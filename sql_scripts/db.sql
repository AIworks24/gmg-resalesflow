-- Create sequences first
CREATE SEQUENCE IF NOT EXISTS applications_id_seq;
CREATE SEQUENCE IF NOT EXISTS compliance_inspections_id_seq;
CREATE SEQUENCE IF NOT EXISTS hoa_properties_id_seq;
CREATE SEQUENCE IF NOT EXISTS notifications_id_seq;
CREATE SEQUENCE IF NOT EXISTS property_owner_forms_id_seq;

-- Begin transaction
BEGIN;

-- Create profiles first (depends on auth.users which is created by Supabase)
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  role character varying DEFAULT 'external'::character varying CHECK (role::text = ANY (ARRAY['external'::character varying, 'realtor'::character varying, 'admin'::character varying, 'staff'::character varying]::text[])),
  first_name character varying,
  last_name character varying,
  phone character varying,
  company character varying,
  license_number character varying,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create HOA properties (no dependencies)
CREATE TABLE public.hoa_properties (
  id integer NOT NULL DEFAULT nextval('hoa_properties_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  location character varying,
  management_contact character varying,
  phone character varying,
  email character varying,
  fee_schedule jsonb DEFAULT '{}'::jsonb,
  special_requirements text,
  documents_folder character varying,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  property_owner_email character varying,
  property_owner_name character varying,
  property_owner_phone character varying,
  notification_preferences jsonb DEFAULT '{"sms": false, "email": true}'::jsonb,
  CONSTRAINT hoa_properties_pkey PRIMARY KEY (id)
);

-- Create applications (depends on profiles and hoa_properties)
CREATE TABLE public.applications (
  id integer NOT NULL DEFAULT nextval('applications_id_seq'::regclass),
  user_id uuid,
  hoa_property_id integer,
  property_address character varying NOT NULL,
  unit_number character varying,
  submitter_type character varying CHECK (submitter_type::text = ANY (ARRAY['seller'::character varying, 'realtor'::character varying, 'builder'::character varying, 'admin'::character varying]::text[])),
  submitter_name character varying NOT NULL,
  submitter_email character varying NOT NULL,
  submitter_phone character varying,
  realtor_license character varying,
  buyer_name character varying NOT NULL,
  buyer_email character varying,
  buyer_phone character varying,
  seller_name character varying NOT NULL,
  seller_email character varying,
  seller_phone character varying,
  sale_price numeric,
  closing_date date,
  package_type character varying DEFAULT 'standard'::character varying CHECK (package_type::text = ANY (ARRAY['standard'::character varying, 'rush'::character varying]::text[])),
  processing_fee numeric DEFAULT 317.95,
  rush_fee numeric DEFAULT 70.66,
  convenience_fee numeric DEFAULT 9.95,
  total_amount numeric,
  payment_method character varying,
  status character varying DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'submitted'::character varying, 'pending_payment'::character varying, 'payment_confirmed'::character varying, 'under_review'::character varying, 'compliance_pending'::character varying, 'compliance_completed'::character varying, 'documents_generated'::character varying, 'approved'::character varying, 'completed'::character varying, 'rejected'::character varying, 'awaiting_property_owner_response'::character varying]::text[])),
  documents jsonb DEFAULT '{}'::jsonb,
  notes text,
  submitted_at timestamp without time zone,
  payment_confirmed_at timestamp without time zone,
  expected_completion_date date,
  completed_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  property_owner_notified_at timestamp without time zone,
  property_owner_response_due date,
  pdf_url character varying,
  pdf_generated_at timestamp without time zone,
  CONSTRAINT applications_pkey PRIMARY KEY (id),
  CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT applications_hoa_property_id_fkey FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id)
);

-- Create compliance_inspections (depends on applications and profiles)
CREATE TABLE public.compliance_inspections (
  id integer NOT NULL DEFAULT nextval('compliance_inspections_id_seq'::regclass),
  application_id integer,
  inspector_user_id uuid,
  inspection_date date,
  inspection_time time without time zone,
  inspector_name character varying,
  approved_modifications text,
  covenant_violations text,
  general_comments text,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'scheduled'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'approved'::character varying, 'requires_action'::character varying]::text[])),
  primary_contact character varying,
  signature_contact character varying,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT compliance_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT compliance_inspections_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id),
  CONSTRAINT compliance_inspections_inspector_user_id_fkey FOREIGN KEY (inspector_user_id) REFERENCES auth.users(id)
);

-- Create notifications (depends on applications)
CREATE TABLE public.notifications (
  id integer NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  application_id integer,
  recipient_email character varying NOT NULL,
  recipient_name character varying,
  notification_type character varying CHECK (notification_type::text = ANY (ARRAY['application_submitted'::character varying, 'payment_confirmed'::character varying, 'property_owner_form_request'::character varying, 'compliance_completed'::character varying, 'application_approved'::character varying, 'application_rejected'::character varying, 'reminder'::character varying, 'status_update'::character varying, 'inspection_form_request'::character varying, 'resale_certificate_request'::character varying]::text[])),
  subject character varying NOT NULL,
  message text NOT NULL,
  email_template character varying,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'bounced'::character varying]::text[])),
  sent_at timestamp without time zone,
  delivered_at timestamp without time zone,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

-- Create property_owner_forms (depends on applications and hoa_properties)
CREATE TABLE public.property_owner_forms (
  id integer NOT NULL DEFAULT nextval('property_owner_forms_id_seq'::regclass),
  application_id integer,
  hoa_property_id integer,
  recipient_email character varying NOT NULL,
  recipient_name character varying,
  form_type character varying DEFAULT 'property_disclosure'::character varying CHECK (form_type::text = ANY (ARRAY['property_disclosure'::character varying, 'compliance_verification'::character varying, 'fee_confirmation'::character varying, 'inspection_form'::character varying, 'resale_certificate'::character varying, 'custom'::character varying]::text[])),
  form_data jsonb DEFAULT '{}'::jsonb,
  status character varying DEFAULT 'not_started'::character varying CHECK (status::text = ANY (ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'expired'::character varying]::text[])),
  response_data jsonb DEFAULT '{}'::jsonb,
  completed_at timestamp without time zone,
  expires_at timestamp without time zone DEFAULT (now() + '7 days'::interval),
  access_token character varying NOT NULL DEFAULT (gen_random_uuid())::text UNIQUE,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT property_owner_forms_pkey PRIMARY KEY (id),
  CONSTRAINT property_owner_forms_hoa_property_id_fkey FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id),
  CONSTRAINT property_owner_forms_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owner_forms ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable delete for users on their own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

-- HOA Properties policies
CREATE POLICY "Anyone can view active HOA properties"
  ON public.hoa_properties
  FOR SELECT
  USING (active = true);

CREATE POLICY "Admin can manage HOA properties"
  ON public.hoa_properties
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Applications policies
CREATE POLICY "Users can create applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view their own applications"
  ON public.applications
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can update their own applications"
  ON public.applications
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Property Owner Forms policies
CREATE POLICY "Users can create property owner forms"
  ON public.property_owner_forms
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_id
      AND (
        applications.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Users can view their property owner forms"
  ON public.property_owner_forms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_id
      AND (
        applications.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

-- Add UPDATE policy for property_owner_forms
CREATE POLICY "Users can update their property owner forms"
  ON public.property_owner_forms
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_id
      AND (
        applications.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

-- Add ON DELETE CASCADE to property_owner_forms_application_id_fkey
ALTER TABLE public.property_owner_forms 
  DROP CONSTRAINT IF EXISTS property_owner_forms_application_id_fkey,
  ADD CONSTRAINT property_owner_forms_application_id_fkey 
    FOREIGN KEY (application_id) 
    REFERENCES public.applications(id) 
    ON DELETE CASCADE;

COMMIT;