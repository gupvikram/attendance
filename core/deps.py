from fastapi import Request, HTTPException
from core.config import supabase, supabase_admin

async def verify_device_key(request: Request) -> dict:
    """Validate device API key and ensure current company is active."""
    api_key = request.headers.get("X-Device-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing device API key")
    
    result = supabase.table("devices").select("*, companies(is_active, name)").eq("api_key", api_key).execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Invalid device API key")
    
    device = result.data[0]
    if not device.get("companies", {}).get("is_active", True):
        raise HTTPException(status_code=403, detail="Company account is suspended.")
    
    if device.get("active") is False:
        raise HTTPException(status_code=403, detail="This kiosk device has been deactivated.")
        
    return device

async def require_admin_company(request: Request) -> str:
    """Validate Supabase JWT and return the admin's company_id if active."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
        
    token = auth_header.split(" ")[1]
    
    try:
        # Verify JWT with Supabase Auth
        user_res = supabase.auth.get_user(token)
        if not user_res or not user_res.user:
            raise HTTPException(status_code=401, detail="Invalid token")
            
        uid = user_res.user.id
        request.state.user_id = uid
        
        profile_client = supabase_admin if supabase_admin else supabase
        profile_res = profile_client.table("user_profiles").select("company_id, companies(is_active)").eq("id", uid).execute()
        if not profile_res.data:
            raise HTTPException(status_code=403, detail="User profile or company mapping not found")
            
        profile = profile_res.data[0]
        if not profile.get("companies", {}).get("is_active", True):
            raise HTTPException(status_code=403, detail="Company account is suspended. Please contact support.")
            
        return profile["company_id"]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")

async def require_super_admin(request: Request) -> str:
    """Ensure the user is a Super Admin (Platform Owner)."""
    # First get company_id via regular admin check (ensures token is valid and company active)
    # Actually, super_admins might not be tied to a specific company in the same way, 
    # but our schema says they are in user_profiles. 
    # Let's verify the role directly.
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    user_res = supabase.auth.get_user(token)
    uid = user_res.user.id
    
    profile_client = supabase_admin if supabase_admin else supabase
    res = profile_client.table("user_profiles").select("role").eq("id", uid).execute()
    if not res.data or res.data[0]["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin privileges required")
    
    return uid
