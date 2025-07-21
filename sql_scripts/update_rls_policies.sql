-- Add PDF-related columns if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'pdf_url') THEN
        ALTER TABLE applications ADD COLUMN pdf_url character varying;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'pdf_generated_at') THEN
        ALTER TABLE applications ADD COLUMN pdf_generated_at timestamp without time zone;
    END IF;
END $$;

-- Create policies if they don't exist, otherwise update them
DO $$ 
BEGIN
    -- Create a completely open storage policy for testing
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all storage operations' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Allow all storage operations"
        ON storage.objects
        FOR ALL 
        USING (true)
        WITH CHECK (true);
    END IF;

    -- Make applications table completely open for testing
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all application operations' AND tablename = 'applications') THEN
        CREATE POLICY "Allow all application operations"
        ON public.applications
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Switch to postgres role
SET ROLE postgres;

-- Storage policies removed - bucket0 is now public

-- Notifications table policies
CREATE POLICY "Allow authenticated users to view notifications" ON public.notifications
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to create notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update notifications" ON public.notifications
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Reset role
RESET ROLE; 