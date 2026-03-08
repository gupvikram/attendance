from fastapi import Request, HTTPException
from core.config import supabase

async def verify_device_key(request: Request) -> dict:
    """Validate device API key from X-Device-Key header. Returns device row."""
    api_key = request.headers.get("X-Device-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing device API key")
    
    result = supabase.table("devices").select("*").eq("api_key", api_key).execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Invalid device API key")
    
    return result.data[0]
