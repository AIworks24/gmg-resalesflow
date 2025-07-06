-- First, enable RLS on all tables
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owner_forms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins and staff can manage all applications" ON public.applications;
DROP POLICY IF EXISTS "Applicants can view their own applications" ON public.applications;
DROP POLICY IF EXISTS "Staff can manage compliance inspections" ON public.compliance_inspections;
DROP POLICY IF EXISTS "Admins can manage HOA properties" ON public.hoa_properties;
DROP POLICY IF EXISTS "Public read access to HOA properties" ON public.hoa_properties;
DROP POLICY IF EXISTS "public_notifications" ON public.notifications;
DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can manage all forms" ON public.property_owner_forms;
DROP POLICY IF EXISTS "Applicants can view their application forms" ON public.property_owner_forms;

-- Applications policies
CREATE POLICY "Admins and staff can manage all applications"
    ON public.applications
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
        )
    );

CREATE POLICY "Applicants can view basic application info"
    ON public.applications
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
    );

-- Compliance inspections policies
CREATE POLICY "Staff can manage compliance inspections"
    ON public.compliance_inspections
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
        )
    );

-- HOA Properties policies
CREATE POLICY "Admins can manage HOA properties"
    ON public.hoa_properties
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role::text = 'admin'::text
        )
    );

CREATE POLICY "Public read access to HOA properties"
    ON public.hoa_properties
    FOR SELECT
    TO public
    USING (true);

-- Notifications policies
CREATE POLICY "public_notifications"
    ON public.notifications
    FOR SELECT
    TO public
    USING (true);

-- Profiles policies
CREATE POLICY "users_own_profile"
    ON public.profiles
    FOR ALL
    TO public
    USING (auth.uid() = id);

-- Property Owner Forms policies - Only admin/staff access
CREATE POLICY "Staff can manage all forms"
    ON public.property_owner_forms
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
        )
    );

-- Switch to postgres role
SET ROLE postgres;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Reset role
RESET ROLE;

-- Commit the changes
COMMIT; 