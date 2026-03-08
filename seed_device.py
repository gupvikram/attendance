import uuid
from core.config import supabase

try:
    # Check if a test device exists
    res = supabase.table("devices").select("*").eq("name", "Main Entrance Kiosk").execute()
    if res.data:
        print(f"✅ Device already exists! API Key: {res.data[0]['api_key']}")
    else:
        # Create a test setup
        loc_res = supabase.table("locations").insert({"name": "HQ", "address": "123 Main St"}).execute()
        loc_id = loc_res.data[0]["id"]
        
        device_id = str(uuid.uuid4())
        api_key = "test_kiosk_key_123"
        dev_res = supabase.table("devices").insert({
            "id": device_id,
            "name": "Main Entrance Kiosk",
            "location_id": loc_id,
            "api_key": api_key,
            "status": "online"
        }).execute()
        
        print(f"✅ Created test device! API Key: {dev_res.data[0]['api_key']}")
except Exception as e:
    print(f"❌ Error: {e}")
