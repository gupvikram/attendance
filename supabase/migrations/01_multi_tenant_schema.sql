-- 1. Create Companies (Tenants) Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create User Profiles (Links Supabase Auth to a Company and Role)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'company_admin', 'manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'company_admin',
    email TEXT,
    full_name TEXT NOT NULL,
    admin_pin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure email column exists for existing installations
DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN email TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3. Add company_id to core tables if missing
DO $$ BEGIN
    ALTER TABLE employees ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE devices ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE attendance ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE shifts ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE recognition_logs ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- 4. Helper Functions (SECURITY DEFINER bypasses RLS recursion)
CREATE OR REPLACE FUNCTION get_auth_user_company_id()
RETURNS UUID AS $$
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_auth_user_role()
RETURNS TEXT AS $$
    SELECT role::TEXT FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- 5. Enable Row Level Security (RLS)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_logs ENABLE ROW LEVEL SECURITY;


-- 6. Create RLS Policies
-- Cleanup first to avoid "already exists" errors
DROP POLICY IF EXISTS "Users can view profiles in their company" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Tenant Isolation: Employees" ON employees;
DROP POLICY IF EXISTS "Tenant Isolation: Devices" ON devices;
DROP POLICY IF EXISTS "Tenant Isolation: Attendance" ON attendance;
DROP POLICY IF EXISTS "Tenant Isolation: Shifts" ON shifts;
DROP POLICY IF EXISTS "Tenant Isolation: Logs" ON recognition_logs;
DROP POLICY IF EXISTS "Super Admin View All" ON companies;

-- Recreate 
CREATE POLICY "Users can view profiles in their company" ON user_profiles FOR SELECT USING (id = auth.uid() OR company_id = get_auth_user_company_id() OR get_auth_user_role() = 'super_admin');
CREATE POLICY "Users can update their own profile" ON user_profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Tenant Isolation: Employees" ON employees FOR ALL USING (get_auth_user_role() = 'super_admin' OR company_id = get_auth_user_company_id());
CREATE POLICY "Tenant Isolation: Devices" ON devices FOR ALL USING (get_auth_user_role() = 'super_admin' OR company_id = get_auth_user_company_id());
CREATE POLICY "Tenant Isolation: Attendance" ON attendance FOR ALL USING (get_auth_user_role() = 'super_admin' OR company_id = get_auth_user_company_id());
CREATE POLICY "Tenant Isolation: Shifts" ON shifts FOR ALL USING (get_auth_user_role() = 'super_admin' OR company_id = get_auth_user_company_id());
CREATE POLICY "Tenant Isolation: Logs" ON recognition_logs FOR ALL USING (get_auth_user_role() = 'super_admin' OR company_id = get_auth_user_company_id());
CREATE POLICY "Super Admin View All" ON companies FOR ALL USING (get_auth_user_role() = 'super_admin' OR id = get_auth_user_company_id());
