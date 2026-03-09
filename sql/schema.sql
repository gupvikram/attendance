-- =================================================================================
-- Face Recognition Attendance System
-- Database Schema
--
-- Note: Replace 'your_timezone' with 'UTC' or the specific timezone
-- if timestamps are required to align precisely. Currently 'timestamptz' 
-- stores UTC internally.
-- =================================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Reference Data ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    grace_period_minutes INT DEFAULT 15,
    late_threshold_minutes INT DEFAULT 30,
    min_checkout_gap_minutes INT DEFAULT 60
);

-- ── 2. Core Entities ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    shift_id INT REFERENCES shifts(id),
    active BOOLEAN DEFAULT true,
    face_descriptors JSONB, -- Array of 5 separate 128-dim float arrays
    face_thumbnail TEXT,    -- Optional path e.g. /static/thumbnails/employee_12.jpg
    enrolled_at TIMESTAMPTZ,
    descriptor_last_updated_at TIMESTAMPTZ,
    enrollment_quality FLOAT -- < 0.20 GOOD, 0.20-0.30 FAIR, > 0.30 POOR
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location_id INT REFERENCES locations(id),
    api_key TEXT NOT NULL,
    status TEXT DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    CONSTRAINT unique_device_api_key UNIQUE (api_key)
);

-- ── 3. Transactional Data ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    check_in_location_id INT REFERENCES locations(id),
    check_out_location_id INT REFERENCES locations(id),
    status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'absent', 'checkout_missing')),
    source TEXT NOT NULL CHECK (source IN ('face_scan', 'manual', 'auto')),
    match_distance FLOAT,
    notes TEXT
);

-- ── 4. Telemetry & Logs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recognition_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id UUID NOT NULL REFERENCES devices(id),
    employee_id INT REFERENCES employees(id), -- Null if recognition fails completely
    result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'weak_match')),
    match_distance FLOAT
);

CREATE TABLE IF NOT EXISTS heartbeat_logs (
    device_id UUID NOT NULL REFERENCES devices(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- ── 5. System State ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize descriptor_version counter
INSERT INTO system_metadata (key, value) VALUES ('descriptor_version', '1') ON CONFLICT DO NOTHING;

-- ── 6. Performance Indexes ─────────────────────────────────────────────────────

-- Scan lookups (fast check-in/out verification)
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);

-- Date-range report queries
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- FRR analytics by time
CREATE INDEX IF NOT EXISTS idx_recognition_timestamp ON recognition_logs(timestamp);

-- FRR analytics by employee (for investigating specific employee issues)
CREATE INDEX IF NOT EXISTS idx_recognition_employee ON recognition_logs(employee_id);

-- Optional: Descriptor updates audit (Not created by default based on review comments)
-- CREATE TABLE descriptor_update_logs (
--     employee_id INT REFERENCES employees(id),
--     timestamp TIMESTAMPTZ,
--     old_descriptor_index INT,
--     match_distance FLOAT
-- );
