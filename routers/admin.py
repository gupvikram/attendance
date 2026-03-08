from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from core.config import supabase
from core.deps import require_admin_company, require_super_admin

router = APIRouter(prefix="/admin", tags=["admin"])

class EmailLogin(BaseModel):
    email: str
    password: str

class EmailSignup(BaseModel):
    email: str
    company_name: str

class CompanyStatusToggle(BaseModel):
    company_id: str
    is_active: bool

class PasswordReset(BaseModel):
    email: str

class PasswordUpdate(BaseModel):
    new_password: str

class AdminReset(BaseModel):
    company_id: str
    new_email: str = None
    new_password: str = None

@router.post("/login")
async def login_with_email(payload: EmailLogin):
    """Initial login to get a Supabase JWT and role metadata."""
    try:
        res = supabase.auth.sign_in_with_password({
            "email": payload.email, 
            "password": payload.password
        })
        
        uid = res.user.id
        print(f"[AUTH] Login successful for UID: {uid}")
        # Get role and company
        profile_res = supabase.table("user_profiles").select("role, company_id, companies(name)").eq("id", uid).execute()
        
        if not profile_res.data:
            raise Exception("User profile not found")
            
        profile = profile_res.data[0]
        company_name = profile.get("companies", {}).get("name", "Unknown")
        
        return {
            "access_token": res.session.access_token, 
            "user": uid,
            "role": profile["role"],
            "company_id": profile["company_id"],
            "company_name": company_name
        }
    except Exception as e:
        print(f"[AUTH ERROR] {str(e)}")
        # If it's a Supabase Auth error, it usually has a message
        detail = str(e)
        if "Email not confirmed" in detail:
            detail = "Please confirm your email in Supabase (or disable email confirmation in settings)."
        elif "User profile not found" in detail:
            detail = f"Login successful, but profile not found for uid. Did you run the SQL to create your profile? (Error: {detail})"
        
        raise HTTPException(status_code=401, detail=detail)

@router.post("/provision")
async def provision_company(payload: EmailSignup, super_admin_id: str = Depends(require_super_admin)):
    """Provision a new company and invite the first admin."""
    try:
        # 1. Create Company
        comp_res = supabase.table("companies").insert({"name": payload.company_name}).execute()
        if not comp_res.data:
            raise Exception("Failed to create company")
        company_id = comp_res.data[0]["id"]
        
        # 2. Create User via Supabase Admin Auth
        # We use create_user with email_confirm=True to bypass invitation flow hurdles
        temp_password = "admin" 
        invite_res = supabase.auth.admin.create_user({
            "email": payload.email,
            "password": temp_password,
            "email_confirm": True
        })
        user_id = invite_res.user.id
        
        # 3. Create Profile (Role: company_admin)
        supabase.table("user_profiles").insert({
            "id": user_id,
            "company_id": company_id,
            "role": "company_admin",
            "email": payload.email,
            "full_name": payload.email.split("@")[0]
        }).execute()
        
        return {"status": "success", "company_id": company_id, "user_id": user_id}
    except Exception as e:
        print(f"[PROVISION ERROR] Details: {str(e)}")
        # Check if company was created but auth failed
        raise HTTPException(status_code=400, detail=f"Provisioning failed: {str(e)}")

@router.post("/toggle-company")
async def toggle_company_status(payload: CompanyStatusToggle, super_admin_id: str = Depends(require_super_admin)):
    """Suspend or activate a company."""
    try:
        supabase.table("companies").update({"is_active": payload.is_active}).eq("id", payload.company_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/companies")
async def list_companies(super_admin_id: str = Depends(require_super_admin)):
    """List all companies for Super Admin oversight."""
    # Fetch companies and their primary admin email from user_profiles
    res = supabase.table("companies").select("*, user_profiles(email, role)").order("created_at").execute()
    companies = res.data

    for comp in companies:
        profiles = comp.get("user_profiles", [])
        # Prioritize company_admin
        admin = next((p for p in profiles if p["role"] == "company_admin"), None)
        if not admin and profiles:
            admin = profiles[0]
        
        comp["admin_email"] = admin["email"] if admin else "No Admin"
        comp.pop("user_profiles", None)

    return companies

@router.post("/reset-admin")
async def reset_company_admin(payload: AdminReset, super_admin_id: str = Depends(require_super_admin)):
    """Reset the email and/or password for a company's admin."""
    try:
        # 1. Find the admin(s) for this company
        # We first look for company_admin, then fall back to ANY profile associated with that company
        # to handle cases where roles might be missing or different.
        res = supabase.table("user_profiles").select("id, role, full_name").eq("company_id", payload.company_id).execute()
        
        if not res.data:
            print(f"[RESET ADMIN] No profiles found for company_id: {payload.company_id}. Checking for force-creation...")
            if not payload.new_email or not payload.new_password:
                raise Exception("No administrator found for this company. Please provide BOTH a new Email and Password to assign a new admin.")
            
            # Force Create Mode - Check if user already exists in Auth first
            print(f"[RESET ADMIN] Searching for existing user in Auth: {payload.new_email}")
            users_res = supabase.auth.admin.list_users()
            users_list = users_res.users if hasattr(users_res, "users") else users_res
            existing_user = next((u for u in users_list if u.email.lower() == payload.new_email.lower()), None)
            
            if existing_user:
                print(f"[RESET ADMIN] User {payload.new_email} already exists in Auth (UID: {existing_user.id}). Linking existing user.")
                user_id = existing_user.id
                # Update password if provided
                if payload.new_password:
                    supabase.auth.admin.update_user_by_id(user_id, {"password": payload.new_password})
            else:
                print(f"[RESET ADMIN] Creating NEW user {payload.new_email} in Auth.")
                auth_res = supabase.auth.admin.create_user({
                    "email": payload.new_email,
                    "password": payload.new_password,
                    "email_confirm": True
                })
                user_id = auth_res.user.id
            
            target_profile = {"id": user_id, "role": None} # Dummy for synchronization step
        else:
            # Prioritize 'company_admin' roles, otherwise take the first one
            admins = [p for p in res.data if p.get("role") == "company_admin"]
            target_profile = admins[0] if admins else res.data[0]
            user_id = target_profile["id"]
            print(f"[RESET ADMIN] Found existing user: {user_id} (Role: {target_profile.get('role')})")
            
            # 2. Update via Auth Admin API
            update_data = {}
            if payload.new_email:
                update_data["email"] = payload.new_email
                update_data["email_confirm"] = True
            if payload.new_password:
                update_data["password"] = payload.new_password
                
            if update_data:
                auth_res = supabase.auth.admin.update_user_by_id(user_id, update_data)
                if not auth_res.user:
                    raise Exception("Supabase Auth update failed")
            
        # 3. Synchronize Profile Metadata
        # We use upsert here to create the profile if it doesn't exist (Ghost Company recovery)
        profile_data = {
            "id": user_id,
            "company_id": payload.company_id,
            "role": "company_admin" # Always ensure they are an admin after reset
        }
        
        # Add optional fields only if we have them or they changed
        if payload.new_email:
            profile_data["email"] = payload.new_email
            profile_data["full_name"] = payload.new_email.split("@")[0]
        elif target_profile.get("full_name"):
             profile_data["full_name"] = target_profile["full_name"]
            
        print(f"[RESET ADMIN] Syncing profile for {user_id}: {profile_data}")
        supabase.table("user_profiles").upsert(profile_data).execute()
            
        return {"status": "success", "message": f"Credentials updated and profile linked for {payload.new_email or 'existing admin'}"}
    except Exception as e:
        print(f"[RESET ADMIN ERROR] {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reset-password")
async def reset_password(payload: PasswordReset):
    """Send a password reset email."""
    try:
        # Requires a configured email provider in Supabase
        supabase.auth.reset_password_email(payload.email)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/update-password")
async def update_auth_password(request: Request, payload: PasswordUpdate, company_id: str = Depends(require_admin_company)):
    """Update the current user's Supabase password using Admin bypass."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User identification lost")
        
    try:
        # Use the Admin API because the global client doesn't hold the user's specific session
        supabase.auth.admin.update_user_by_id(user_id, {"password": payload.new_password})
        print(f"[AUTH] Password updated for UID: {user_id}")
        return {"status": "success"}
    except Exception as e:
        print(f"[AUTH ERROR] Password update failed for {user_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

