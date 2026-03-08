import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
RECOGNITION_DISTANCE_THRESHOLD = float(os.getenv("RECOGNITION_DISTANCE_THRESHOLD", "0.42"))
WEAK_MATCH_UPPER = 0.48

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")

# ── Global Supabase client ───────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
