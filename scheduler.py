"""
Background scheduler — APScheduler jobs:
  1. Auto-absent (23:55 nightly)
  2. recognition_logs cleanup (90-day retention, runs at 02:00)
  3. Heartbeat watchdog (every 2 minutes)
"""

from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler


scheduler = BackgroundScheduler(timezone="UTC")


def auto_absent_job():
    """Mark absent for all employees with no attendance row for today."""
    from core.config import supabase
    today = datetime.now(timezone.utc).date().isoformat()

    employees = supabase.table("employees").select("id").eq("active", True).execute().data
    existing = supabase.table("attendance").select("employee_id").eq("date", today).execute().data
    existing_ids = {row["employee_id"] for row in existing}

    absent_rows = [
        {"employee_id": emp["id"], "date": today, "status": "absent", "source": "auto"}
        for emp in employees
        if emp["id"] not in existing_ids
    ]
    if absent_rows:
        supabase.table("attendance").insert(absent_rows).execute()
    print(f"[scheduler] auto-absent: {len(absent_rows)} employees marked absent for {today}")


def recognition_log_cleanup_job():
    """Delete recognition_logs older than 90 days."""
    from core.config import supabase
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    supabase.table("recognition_logs").delete().lt("timestamp", cutoff).execute()
    print(f"[scheduler] recognition_logs cleanup: deleted rows older than {cutoff}")


def heartbeat_watchdog_job():
    """Mark devices offline if last_heartbeat > 5 minutes ago."""
    from core.config import supabase
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    supabase.table("devices").update({"status": "offline"}).lt("last_heartbeat", cutoff).eq("status", "online").execute()


def start_scheduler():
    scheduler.add_job(auto_absent_job,        "cron",    hour=23, minute=55, id="auto_absent")
    scheduler.add_job(recognition_log_cleanup_job, "cron", hour=2, minute=0,  id="log_cleanup")
    scheduler.add_job(heartbeat_watchdog_job, "interval", minutes=2,          id="heartbeat_watchdog")
    scheduler.start()
    print("[scheduler] Started: auto_absent, log_cleanup, heartbeat_watchdog")
