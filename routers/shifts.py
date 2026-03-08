from fastapi import APIRouter, HTTPException, Depends
from core.config import supabase
from core.deps import require_admin_company
from models.schemas import ShiftCreate, ShiftUpdate

router = APIRouter(prefix="/shifts", tags=["shifts"])

@router.get("")
async def list_shifts(company_id: str = Depends(require_admin_company)):
    """List all shifts for this company."""
    return supabase.table("shifts").select("*").eq("company_id", company_id).execute().data

@router.post("")
async def create_shift(payload: ShiftCreate, company_id: str = Depends(require_admin_company)):
    """Create a new shift."""
    try:
        data = payload.model_dump()
        data["company_id"] = company_id
        # Ensure time is serialized to string
        data["start_time"] = data["start_time"].isoformat()
        res = supabase.table("shifts").insert(data).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, str(e))

@router.put("/{shift_id}")
async def update_shift(shift_id: int, payload: ShiftUpdate, company_id: str = Depends(require_admin_company)):
    """Update a shift."""
    data = payload.model_dump(exclude_unset=True)
    if "start_time" in data and data["start_time"] is not None:
        data["start_time"] = data["start_time"].isoformat()
        
    res = supabase.table("shifts").update(data).eq("id", shift_id).eq("company_id", company_id).execute()
    if not res.data:
        raise HTTPException(404, "Shift not found or access denied")
    return res.data[0]
