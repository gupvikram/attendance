"""
Face Recognition Attendance System — Backend
FastAPI + Supabase
"""

import os
import time
import logging
import sys
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from supabase import create_client, Client

# Configure standard python logging to stdout so it flows into attendance.log
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("attendance")

load_dotenv()

from core.config import supabase, SUPABASE_URL, SUPABASE_KEY, RECOGNITION_DISTANCE_THRESHOLD, WEAK_MATCH_UPPER

# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background scheduler
    try:
        from scheduler import start_scheduler
        start_scheduler()
    except ImportError:
        pass
    yield

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# ── Rate Limiting ─────────────────────────────────────────────────────────────

from core.limiter import limiter

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Attendance System", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Custom Middleware to log EVERY request/response
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    path = request.url.path
    method = request.method
    
    # Process the request
    response = None
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception as e:
        logger.error(f"Error processing {method} {path}: {str(e)}")
        raise e
    finally:
        duration = time.time() - start_time
        level = logging.INFO
        if response and response.status_code >= 400:
            level = logging.WARNING
        if response and response.status_code >= 500:
            level = logging.ERROR
            
        status = response.status_code if response else 500
        logger.log(level, f"{method} {path} - {status} ({duration:.3f}s)")
    
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (face-api.js models, CSS, JS, thumbnails)
app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")
# app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Page routes ───────────────────────────────────────────────────────────────

@app.get("/")
async def index():
    return FileResponse("frontend/index.html")

@app.get("/kiosk")
async def kiosk():
    return FileResponse("frontend/home.html")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/admin")
async def get_admin():
    return FileResponse("frontend/admin.html")

@app.get("/enroll")
async def get_enroll():
    return FileResponse("frontend/enroll.html")

@app.get("/reports")
async def get_reports():
    return FileResponse("frontend/reports.html")

# ── Routers ───────────────────────────────────────────────────────────────────

from routers import devices, employees, attendance, shifts, reports, admin
app.include_router(devices.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(shifts.router)
app.include_router(reports.router)
app.include_router(admin.router)

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
