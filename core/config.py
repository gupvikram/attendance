import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
RECOGNITION_DISTANCE_THRESHOLD = float(os.getenv("RECOGNITION_DISTANCE_THRESHOLD", "0.42"))
WEAK_MATCH_UPPER = 0.48

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_KEY are missing. "
        "Please add them to your Railway service's 'Variables' tab."
    )

# ── Global Supabase client (Anon permissions) ───────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Admin Supabase client (Service Role permissions) ─────────────────────────────
# Used for operations requiring bypass of RLS or Auth Admin API
supabase_admin: Client = None
if SUPABASE_SERVICE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    print("⚠️  SUPABASE_SERVICE_KEY missing. Admin auth features may fail.")

