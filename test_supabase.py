from core.config import supabase

try:
    # Try fetching a simple table to verify connection
    result = supabase.table("system_metadata").select("*").limit(1).execute()
    print("✅ Successfully connected to Supabase!")
    if result.data:
        print(f"✅ Found data in system_metadata: {result.data[0]}")
    else:
        print("✅ Connection works, but system_metadata table is empty.")
except Exception as e:
    print(f"❌ Failed to connect or query Supabase: {e}")

try:
    # Try querying the devices table which was missing earlier
    devices_result = supabase.table("devices").select("id").limit(1).execute()
    print("✅ The 'devices' table exists!")
except Exception as e:
    print(f"❌ Error accessing 'devices' table: {e}")
