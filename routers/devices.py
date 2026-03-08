import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

from core.config import supabase
from core.deps import verify_device_key
from models.schemas import DeviceCreate, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["devices"])

@router.get("")
async def list_devices():
    """List all devices. Admin only."""
    return supabase.table("devices").select("*, locations(name)").execute().data

@router.post("")
async def create_device(payload: DeviceCreate):
    """Register a new device. Admin only."""
    device = payload.model_dump(exclude_unset=True)
    device["id"] = str(uuid.uuid4())
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
    
    return {"status": "ok", "server_time": now, "device_name": device.get("name", "Kiosk")}

@router.delete("/{device_id}")
async def delete_device(device_id: str):
    """Remove a device. Admin only."""
    # Verify device exists
    check = supabase.table("devices").select("id").eq("id", device_id).execute()
    if not check.data:
        raise HTTPException(404, "Device not found")

    try:
        # Remove recognition_logs tied to this device first
        # (recognition_logs.device_id is NOT NULL, so we must delete rather than nullify)
        supabase.table("recognition_logs").delete().eq("device_id", device_id).execute()
        # Now safe to delete the device
        supabase.table("devices").delete().eq("id", device_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(500, f"Could not delete device: {str(e)}")
