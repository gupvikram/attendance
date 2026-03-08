def increment_descriptor_version():
    """Increment the global descriptor_version in system_metadata."""
    from core.config import supabase
    try:
        # Supabase Python client doesn't support raw SQL UPDATE table SET value = value + 1 easily
        # So we do a read then write. Safe enough for this admin-only, low-frequency operation.
        res = supabase.table("system_metadata").select("value").eq("key", "descriptor_version").execute()
        if res.data:
            current_val = int(res.data[0]["value"])
            supabase.table("system_metadata").update({"value": str(current_val + 1), "updated_at": "now()"}).eq("key", "descriptor_version").execute()
        else:
            supabase.table("system_metadata").insert({"key": "descriptor_version", "value": "1"}).execute()
    except Exception as e:
        print(f"Error incrementing descriptor version: {e}")
