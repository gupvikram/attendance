from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.config import supabase

router = APIRouter(prefix="/admin", tags=["admin"])

class PinVerify(BaseModel):
    pin: str

class PinUpdate(BaseModel):
    current_pin: str
    new_pin: str

@router.post("/verify-pin")
async def verify_pin(payload: PinVerify):
    """Verify the admin PIN against the database."""
    res = supabase.table("system_metadata").select("value").eq("key", "admin_pin").execute()
    
    # Default PIN is 1234 if not set in DB
    stored_pin = "1234"
    if res.data:
        stored_pin = res.data[0]["value"]
    else:
        # Initialize if missing
        supabase.table("system_metadata").insert({"key": "admin_pin", "value": "1234"}).execute()
        
    if payload.pin == stored_pin:
        return {"status": "success"}
    else:
        raise HTTPException(status_code=401, detail="Invalid PIN")

@router.post("/update-pin")
async def update_pin(payload: PinUpdate):
    """Update the admin PIN."""
    # 1. Verify current PIN
    res = supabase.table("system_metadata").select("value").eq("key", "admin_pin").execute()
    stored_pin = "1234"
    if res.data:
        stored_pin = res.data[0]["value"]
        
    if payload.current_pin != stored_pin:
        raise HTTPException(status_code=401, detail="Current PIN is incorrect")
    
    # 2. Update to new PIN
    supabase.table("system_metadata").upsert({"key": "admin_pin", "value": payload.new_pin, "updated_at": "now()"}).execute()
    
    return {"status": "success", "message": "PIN updated successfully"}
