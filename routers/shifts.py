from fastapi import APIRouter, HTTPException
from core.config import supabase
from models.schemas import ShiftCreate, ShiftUpdate

router = APIRouter(prefix="/shifts", tags=["shifts"])

@router.get("")
async def list_shifts():
    """List all shifts."""
    return supabase.table("shifts").select("*").execute().data

@router.post("")
async def create_shift(payload: ShiftCreate):
    """Create a new shift."""
    try:
        data = payload.model_dump()
        # Ensure time is serialized to string
        data["start_time"] = data["start_time"].isoformat()
        res = supabase.table("shifts").insert(data).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, str(e))

@router.put("/{shift_id}")
async def update_shift(shift_id: int, payload: ShiftUpdate):
    """Update a shift."""
    data = payload.model_dump(exclude_unset=True)
    if "start_time" in data and data["start_time"] is not None:
        data["start_time"] = data["start_time"].isoformat()
        
    res = supabase.table("shifts").update(data).eq("id", shift_id).execute()
    if not res.data:
        raise HTTPException(404, "Shift not found")
    return res.data[0]
