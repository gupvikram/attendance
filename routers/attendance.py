from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from typing import List
import logging

logger = logging.getLogger("attendance.scan")

from core.config import supabase
from core.deps import verify_device_key, require_admin_company
from core.config import RECOGNITION_DISTANCE_THRESHOLD, WEAK_MATCH_UPPER
from core.limiter import limiter
from models.schemas import AttendanceScan, AttendanceManualUpdate
from routers.attendance_helpers import process_self_updating_descriptor

router = APIRouter(prefix="/attendance", tags=["attendance"])

@router.post("/scan")
@limiter.limit("30/minute")
async def scan_attendance(
    request: Request,
    payload: AttendanceScan, 
    background_tasks: BackgroundTasks,
    device: dict = Depends(verify_device_key)
):
    """
    Handle face recognition scan from kiosk.
    1. Verifies timing for checkout gap
    2. Writes to recognition_logs
    3. Triggers self-updating descriptor optionally
    4. Returns standardized response for kiosk
    """
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date().isoformat()
    now_iso = now_utc.isoformat()
    
    # 1. Verification
    emp_res = supabase.table("employees").select("*").eq("id", payload.employee_id).eq("company_id", device["company_id"]).eq("active", True).execute()
    if not emp_res.data:
        # Log failure
        supabase.table("recognition_logs").insert({
            "device_id": device["id"],
            "company_id": device["company_id"],
            "result": "failure",
            "match_distance": payload.match_distance
        }).execute()
        raise HTTPException(404, "Employee not found or inactive")
        
    employee = emp_res.data[0]

    # Validate distance threshold
    if payload.match_distance > WEAK_MATCH_UPPER:
        supabase.table("recognition_logs").insert({
            "device_id": device["id"],
            "company_id": device["company_id"],
            "employee_id": payload.employee_id,
            "result": "failure",
            "match_distance": payload.match_distance
        }).execute()
        raise HTTPException(401, "Face match failed threshold")

    # Determine match result classification
    match_result = "weak_match" if payload.match_distance >= RECOGNITION_DISTANCE_THRESHOLD else "success"

    # 2. Logic: Check-in vs Check-out
    # Find active shift settings
    shift = {
        "start_time": "09:00:00", 
        "grace_period_minutes": 15,
        "min_checkout_gap_minutes": 60
    }
    if employee.get("shift_id"):
        shift_res = supabase.table("shifts").select("*").eq("id", employee["shift_id"]).execute()
        if shift_res.data:
            shift = shift_res.data[0]

    # Find the MOST RECENT attendance record for today
    existing = supabase.table("attendance").select("*").eq("employee_id", employee["id"]).eq("date", today).order("check_in_time", desc=True).limit(1).execute()
    
    action, response_status = "unknown", "success"
    try:
        # If no record today, OR the most recent record already has a checkout (meaning they left), perform a Check-in.
        if not existing.data or existing.data[0]["check_out_time"] is not None:
            # Check In
            # Calculate status based on time (only really relevant for the first check-in of the day)
            shift_start = datetime.strptime(shift["start_time"], "%H:%M:%S").time()
            check_in_dt = datetime.combine(now_utc.date(), shift_start).replace(tzinfo=timezone.utc)
            grace_dt = check_in_dt.replace(minute=check_in_dt.minute + shift.get("grace_period_minutes", 15))
            
            # Very simplistic local vs UTC math comparison
            is_late = now_utc > grace_dt
            
            # Since "return" is likely not a valid enum in the DB causing a 400 error,
            # we will just use "on_time" for subsequent checkins, or strictly re-evaluate.
            att_status = "late" if is_late else "on_time"

            supabase.table("attendance").insert({
                "employee_id": employee["id"],
                "company_id": device["company_id"],
                "date": today,
                "check_in_time": now_iso,
                "check_in_location_id": device["location_id"],
                "status": att_status,
                "source": "face_scan",
                "match_distance": payload.match_distance
            }).execute()
            action = "check_in"

        else:
            # Check Out
            row = existing.data[0]
            
            # Allow immediate checkout by bypassing min_checkout_gap_minutes (or reducing to 1m to prevent double scans)
            raw_check_in = row["check_in_time"]
            clean_ts = raw_check_in.split('+')[0].replace('Z', '').split('.')[0]
            check_in = datetime.fromisoformat(clean_ts).replace(tzinfo=timezone.utc)
            
            if (now_utc - check_in).total_seconds() < 60: # Just 1 minute debounce
                msg = f"Checkout not allowed yet, {employee['name']}"
                logger.warning(f"Scan Rejected (Double Scan): {msg}")
                raise HTTPException(400, "Please wait 1 minute before scanning again.")

            supabase.table("attendance").update({
                "check_out_time": now_iso,
                "check_out_location_id": device["location_id"],
                "match_distance": payload.match_distance
            }).eq("id", row["id"]).execute()
            action = "check_out"

        logger.info(f"Scan Success: {employee['name']} ({action}) - Dist: {payload.match_distance:.3f}")

        # 3. Write recognition_logs telemetry
        supabase.table("recognition_logs").insert({
            "device_id": device["id"],
            "company_id": device["company_id"],
            "employee_id": employee["id"],
            "result": match_result,
            "match_distance": payload.match_distance
        }).execute()

        # 4. Trigger self-updator in background if match was extremely strong
        # Uses background task to not block the kiosk response payload
        if match_result == "success" and employee.get("face_descriptors"):
            # Only if the payload included exactly which 128-float array caused the match? 
            # Review requirement: Kiosk doesn't send the new raw descriptor.
            # FIX: The self-updating descriptor requires the raw float array to be saved!
            # The current /attendance/scan request format was:
            # { "employee_id": 12, "device_id": "...", "match_distance": 0.37 }
            # Wait, the kiosk MUST send the new descriptor vector if the backend is to store it.
            # We'll allow taking the vector in the payload.
            if hasattr(payload, 'new_descriptor') and payload.new_descriptor:
                 background_tasks.add_task(
                     process_self_updating_descriptor, 
                     supabase, employee, payload.new_descriptor, payload.match_distance
                 )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

    # Standardized response
    return {
        "status": "success",
        "employee_name": employee["name"],
        "action": action,
        "time": now_utc.strftime("%H:%M"),
        "location": device.get("name", "Unknown Location")
    }


@router.put("/{record_id}")
async def update_attendance(record_id: int, payload: AttendanceManualUpdate, company_id: str = Depends(require_admin_company)):
    """Admin manual corrections."""
    data = payload.model_dump(exclude_unset=True)
    admin_id = data.pop("admin_id", "admin")
    notes = data.pop("notes", "Manual adjustment")

    # Change source to manual if check times or status changed
    data["source"] = "manual"

    try:
        res = supabase.table("attendance").update(data).eq("id", record_id).eq("company_id", company_id).execute()
        if not res.data:
            raise HTTPException(404, "Attendance record not found or access denied")
        
        # Audit log
        supabase.table("admin_logs").insert({
            "admin_id": admin_id,
            "action": "manual_correction",
            "entity_type": "attendance",
            "entity_id": record_id,
            "notes": notes
        }).execute()

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("")
async def query_attendance(date: str = None, employee_id: int = None, company_id: str = Depends(require_admin_company)):
    """Fetch attendance records, optionally filtered by date or employee. Admin only."""
    try:
        query = supabase.table("attendance").select("*, employee:employees(name, role)").eq("company_id", company_id)
        
        if date:
            query = query.eq("date", date)
        if employee_id:
            query = query.eq("employee_id", employee_id)
            
        res = query.order("check_in_time", desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(500, str(e))
