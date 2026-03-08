import os
import openpyxl
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from core.config import supabase
from core.deps import require_admin_company

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/monthly")
async def get_monthly_summary(month: str = None, company_id: str = Depends(require_admin_company)):
    """
    Get summary of attendance (present, late, absent) per employee for a specific month.
    Month format: YYYY-MM. Defaults to current month.
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        
    start_date = f"{month}-01"
    
    # Calculate end date via simple string manip (hacky for prod, adjust safely)
    y, m = map(int, month.split('-'))
    if m == 12:
        end_date = f"{y+1}-01-01"
    else:
        end_date = f"{y}-{m+1:02d}-01"

    # Fetch employees for this company
    emps_res = supabase.table("employees").select("id", "name", "role", "active").eq("company_id", company_id).execute()
    employees = emps_res.data
    
    # Fetch attendance for this company
    att_res = supabase.table("attendance").select("*").eq("company_id", company_id).gte("date", start_date).lt("date", end_date).execute()
    attendance = att_res.data

    # Aggregate
    summary = {}
    for emp in employees:
        summary[emp["id"]] = {
            "name": emp["name"],
            "role": emp["role"],
            "active": emp["active"],
            "total_present": 0,
            "total_late": 0,
            "total_absent": 0,
            "total_checkout_missing": 0
        }

    for record in attendance:
        emp_id = record["employee_id"]
        status = record["status"]
        if emp_id in summary:
            if status == "on_time":
                summary[emp_id]["total_present"] += 1
            elif status == "late":
                summary[emp_id]["total_present"] += 1
                summary[emp_id]["total_late"] += 1
            elif status == "absent":
                summary[emp_id]["total_absent"] += 1
            elif status == "checkout_missing":
                summary[emp_id]["total_present"] += 1
                summary[emp_id]["total_checkout_missing"] += 1

    return list(summary.values())

@router.get("/monthly/export")
async def export_monthly_excel(month: str = None, company_id: str = Depends(require_admin_company)):
    """Generate and return an Excel file from the monthly summary."""
    data = await get_monthly_summary(month, company_id)
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Attendance {month}"
    
    headers = ["Name", "Role", "Status", "Present Days", "Late Days", "Absent", "Missing Checkout"]
    ws.append(headers)
    
    for row in data:
        ws.append([
            row["name"],
            row["role"],
            "Active" if row["active"] else "Inactive",
            row["total_present"],
            row["total_late"],
            row["total_absent"],
            row["total_checkout_missing"]
        ])
        
    os.makedirs("exports", exist_ok=True)
    filename = f"exports/attendance_{month}_{int(datetime.now().timestamp())}.xlsx"
    wb.save(filename)
    
    return FileResponse(
        path=filename,
        filename=f"Attendance_{month}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/failures")
async def get_recent_failures(limit: int = 20, company_id: str = Depends(require_admin_company)):
    """Fetch recent failed recognition attempts from the logging table."""
    try:
        # Join with employees to get the name, and devices to get the location name
        res = supabase.table("recognition_logs") \
            .select("*, employee:employees(name), device:devices(name)") \
            .eq("company_id", company_id) \
            .neq("result", "success") \
            .order("timestamp", desc=True) \
            .limit(limit) \
            .execute()
        return res.data
    except Exception as e:
        import logging
        logger = logging.getLogger("attendance.reports")
        logger.error(f"FAILED to fetch recognition logs: {str(e)}")
        raise HTTPException(500, str(e))
