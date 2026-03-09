from pydantic import BaseModel
from typing import Optional, List
from datetime import date, time, datetime

# ── Devices ───────────────────────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    api_key: Optional[str] = None  # Auto-generated if not supplied

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    location_id: Optional[int] = None
    api_key: Optional[str] = None
    status: Optional[str] = None
    active: Optional[bool] = None

# ── Shifts ────────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    name: str
    start_time: time
    grace_period_minutes: int = 15
    gap_lock_minutes: int = 60

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[time] = None
    grace_period_minutes: Optional[int] = None
    gap_lock_minutes: Optional[int] = None

# ── Employees ─────────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    name: str
    role: Optional[str] = None
    phone: Optional[str] = None
    shift_id: Optional[int] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    shift_id: Optional[int] = None
    active: Optional[bool] = None

class EmployeeEnroll(BaseModel):
    face_descriptors: List[List[float]]  # 5 arrays of 128 floats
    face_thumbnail: Optional[str] = None
    enrollment_quality: Optional[float] = None

# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceScan(BaseModel):
    employee_id: int
    device_id: str
    match_distance: float
    new_descriptor: Optional[List[float]] = None

class AttendanceManualUpdate(BaseModel):
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    admin_id: str
