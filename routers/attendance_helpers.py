"""
Logic to incrementally update an employee's face descriptors over time if a very high-confidence match occurs.
"""
from datetime import datetime, timezone, timedelta
import math

# Try importing scipy, but fallback to manual euclidean if not installed
try:
    from scipy.spatial.distance import euclidean
except ImportError:
    def euclidean(v1, v2):
        if len(v1) != len(v2):
            return float('inf')
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))

def process_self_updating_descriptor(supabase, employee: dict, new_descriptor: list, match_distance: float):
    """
    Called after a successful face scan. Option A logic.
    Updates the weakest descriptor if the match is extremely confident (< 0.35) 
    and interval is > 4 hours.
    """
    if match_distance >= 0.35:
        return

    stored_descriptors = employee.get("face_descriptors", [])
    if not stored_descriptors or len(stored_descriptors) != 5:
        return

    last_update_str = employee.get("descriptor_last_updated_at")
    now_utc = datetime.now(timezone.utc)
    
    if last_update_str:
        # Handle Supabase timestamptz string format parsing
        try:
            # Drop the trailing Z or +00:00 for simple parsing and replace timezone manually
            clean_str = last_update_str.replace("Z", "+00:00")
            last_update = datetime.fromisoformat(clean_str)
            if last_update.tzinfo is None:
                last_update = last_update.replace(tzinfo=timezone.utc)
                
            if (now_utc - last_update) <= timedelta(hours=4):
                print(f"[Self-Update] Skipped {employee['id']} — updated too recently")
                return
        except Exception as e:
            print(f"[Self-Update] Error parsing timestamp {last_update_str}: {e}")
            pass # Continue to update if parse fails (fallback)

    # 1. Diversity check: skip if new descriptor is too similar to ANY existing one
    # This ensures we don't end up with 5 identical copies of the exact same angle
    min_dist_to_existing = min(euclidean(new_descriptor, d) for d in stored_descriptors)
    if min_dist_to_existing <= 0.15:
        print(f"[Self-Update] Skipped {employee['id']} — descriptor doesn't add diversity (dist: {min_dist_to_existing:.2f})")
        return

    # 2. Find weakest descriptor (furthest from the new confident scan)
    distances = [euclidean(new_descriptor, d) for d in stored_descriptors]
    weakest_index = distances.index(max(distances))

    # 3. Replace
    stored_descriptors[weakest_index] = new_descriptor

    # 4. Save to DB
    try:
        supabase.table("employees").update({
            "face_descriptors": stored_descriptors,
            "descriptor_last_updated_at": now_utc.isoformat()
        }).eq("id", employee["id"]).execute()
        print(f"[Self-Update] Updated employee {employee['id']} descriptor at index {weakest_index}")
        
    except Exception as e:
        print(f"[Self-Update] DB write failed: {e}")
