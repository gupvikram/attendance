import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

from core.config import supabase
from core.deps import verify_device_key, require_admin_company
from models.schemas import DeviceCreate, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["devices"])

@router.get("")
async def list_devices(company_id: str = Depends(require_admin_company)):
    """List all devices for this company."""
    return supabase.table("devices").select("*, locations(name)").eq("company_id", company_id).execute().data

@router.post("")
async def create_device(payload: DeviceCreate, company_id: str = Depends(require_admin_company)):
    """Register a new device. Admin only."""
    device = payload.model_dump(exclude_unset=True)
    device["id"] = str(uuid.uuid4())
    device["company_id"] = company_id
    # Auto-generate api_key if not provided
    if not device.get("api_key"):
        device["api_key"] = f"sk_{uuid.uuid4().hex[:24]}"
    try:
        res = supabase.table("devices").insert(device).execute()
        return res.data[0]
    except Exception as e:
        if "unique_device_api_key" in str(e):
            raise HTTPException(400, "API key already exists")
        raise HTTPException(500, str(e))

@router.post("/heartbeat")
async def device_heartbeat(device: dict = Depends(verify_device_key)):
    """Device sends 60s ping. Returns server_time for clock skew detection."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("devices").update({
        "status": "online",
        "last_heartbeat": now
    }).eq("id", device["id"]).execute()
    
    company_name = device.get("companies", {}).get("name", "Unknown")
    return {"status": "ok", "server_time": now, "device_name": device.get("name", "Kiosk"), "company_name": company_name}

@router.delete("/{device_id}")
async def delete_device(device_id: str, company_id: str = Depends(require_admin_company)):
    """Remove a device. Admin only."""
    # Verify device exists and belongs to company
    check = supabase.table("devices").select("id").eq("id", device_id).eq("company_id", company_id).execute()
    if not check.data:
        raise HTTPException(404, "Device not found or access denied")

    try:
        # Remove recognition_logs tied to this device first
        # (recognition_logs.device_id is NOT NULL, so we must delete rather than nullify)
        supabase.table("recognition_logs").delete().eq("device_id", device_id).execute()
        # Now safe to delete the device
        supabase.table("devices").delete().eq("id", device_id).eq("company_id", company_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(500, f"Could not delete device: {str(e)}")
@router.patch("/{device_id}")
async def update_device(device_id: str, payload: DeviceUpdate, company_id: str = Depends(require_admin_company)):
    """Update device details or active status."""
    data = payload.model_dump(exclude_unset=True)
    res = supabase.table("devices").update(data).eq("id", device_id).eq("company_id", company_id).execute()
    if not res.data:
        raise HTTPException(404, "Device not found or access denied")
    return res.data[0]
