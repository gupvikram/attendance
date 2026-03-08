from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from typing import List

from core.config import supabase
from core.deps import verify_device_key
from models.schemas import EmployeeCreate, EmployeeUpdate, EmployeeEnroll
from routers.utils import increment_descriptor_version

router = APIRouter(prefix="/employees", tags=["employees"])

@router.get("")
async def list_employees():
    """List all employees. Admin only."""
    return supabase.table("employees").select("*, shifts(*)").execute().data

@router.get("/descriptors")
async def get_descriptors(request: Request, response: Response, device: dict = Depends(verify_device_key)):
    """
    Lightweight fetch for kiosk devices.
    Returns: id, name, face_descriptors, enrolled_at
    Implements HTTP 304 ETag caching using the global descriptor_version.
    """
    # 1. Fetch current descriptor version
    version_res = supabase.table("system_metadata").select("value").eq("key", "descriptor_version").execute()
    current_version = version_res.data[0]["value"] if version_res.data else "1"

    # 2. Check Client ETag
    client_etag = request.headers.get("If-None-Match")
    if client_etag == current_version:
        response.status_code = 304
        return Response(status_code=304)

    # 3. If missing or changed, fetch active enrolled employees
    employees = supabase.table("employees").select(
        "id, name, face_descriptors, descriptor_last_updated_at"
    ).eq("active", True).not_.is_("face_descriptors", "null").execute().data

    response.headers["ETag"] = current_version
    return {
        "descriptor_version": current_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "employees": employees
    }

@router.post("")
async def create_employee(payload: EmployeeCreate):
    """Add employee."""
    try:
        res = supabase.table("employees").insert(payload.model_dump(exclude_unset=True)).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, str(e))

@router.put("/{emp_id}")
async def update_employee(emp_id: int, payload: EmployeeUpdate):
    """Edit active status or details."""
    data = payload.model_dump(exclude_unset=True)
    if "active" in data and data["active"] is False:
        increment_descriptor_version()
        
    res = supabase.table("employees").update(data).eq("id", emp_id).execute()
    if not res.data:
        raise HTTPException(404, "Employee not found")
    return res.data[0]

@router.delete("/{emp_id}")
async def deactivate_employee(emp_id: int):
    """Deactivate employee (soft delete)."""
    res = supabase.table("employees").update({"active": False}).eq("id", emp_id).execute()
    increment_descriptor_version()
    if not res.data:
        raise HTTPException(404, "Employee not found")
    return {"status": "deactivated"}

@router.post("/{emp_id}/enroll")
async def enroll_employee(emp_id: int, payload: EmployeeEnroll):
    """Save 5 face descriptors from enrollment."""
    # Verify employee exists
    emp = supabase.table("employees").select("id").eq("id", emp_id).execute()
    if not emp.data:
        raise HTTPException(404, "Employee not found")

    if len(payload.face_descriptors) != 5:
        raise HTTPException(400, "Exactly 5 descriptors are required")

    now = datetime.now(timezone.utc).isoformat()
    data = {
        "face_descriptors": payload.face_descriptors,
        "enrolled_at": now,
        "descriptor_last_updated_at": now
    }
    
    if payload.face_thumbnail:
        data["face_thumbnail"] = payload.face_thumbnail
    if payload.enrollment_quality is not None:
        data["enrollment_quality"] = payload.enrollment_quality

    res = supabase.table("employees").update(data).eq("id", emp_id).execute()
    increment_descriptor_version()

    # Log action
    supabase.table("admin_logs").insert({
        "admin_id": "system",
        "action": "enrolled_face",
        "entity_type": "employee",
        "entity_id": emp_id,
        "notes": f"Quality: {payload.enrollment_quality}"
    }).execute()

    return {"status": "enrolled", "employee": res.data[0]}
