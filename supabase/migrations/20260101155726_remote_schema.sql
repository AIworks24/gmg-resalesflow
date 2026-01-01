create sequence "public"."application_property_groups_id_seq";

create sequence "public"."application_types_id_seq";

create sequence "public"."applications_id_seq";

create sequence "public"."compliance_inspections_id_seq";

create sequence "public"."hoa_properties_id_seq";

create sequence "public"."linked_properties_id_seq";

create sequence "public"."notifications_id_seq";

create sequence "public"."property_documents_id_seq";

create sequence "public"."property_owner_forms_id_seq";

create sequence "public"."property_owner_forms_list_id_seq";


  create table "public"."application_property_groups" (
    "id" integer not null default nextval('public.application_property_groups_id_seq'::regclass),
    "application_id" integer not null,
    "property_id" integer not null,
    "property_name" character varying(255) not null,
    "property_location" character varying(255),
    "property_owner_email" character varying(255),
    "is_primary" boolean default false,
    "status" character varying(50) default 'pending'::character varying,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "pdf_url" text,
    "pdf_status" character varying(20) default 'not_started'::character varying,
    "pdf_completed_at" timestamp with time zone,
    "email_status" character varying(20) default 'not_started'::character varying,
    "email_completed_at" timestamp with time zone,
    "form_data" jsonb,
    "inspection_status" character varying(20) default 'not_started'::character varying,
    "inspection_completed_at" timestamp with time zone
      );


alter table "public"."application_property_groups" enable row level security;


  create table "public"."application_types" (
    "id" integer not null default nextval('public.application_types_id_seq'::regclass),
    "name" character varying(50) not null,
    "display_name" character varying(100) not null,
    "required_forms" jsonb not null default '[]'::jsonb,
    "allowed_roles" jsonb not null default '[]'::jsonb,
    "submit_property_files" boolean default true,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP
      );



  create table "public"."applications" (
    "id" integer not null default nextval('public.applications_id_seq'::regclass),
    "user_id" uuid,
    "hoa_property_id" integer,
    "property_address" character varying(500) not null,
    "unit_number" character varying(50),
    "submitter_type" character varying(50),
    "submitter_name" character varying(255) not null,
    "submitter_email" character varying(255) not null,
    "submitter_phone" character varying(50),
    "realtor_license" character varying(100),
    "buyer_name" character varying(255) not null,
    "buyer_email" character varying(255),
    "buyer_phone" character varying(50),
    "seller_name" character varying(255) not null,
    "seller_email" character varying(255),
    "seller_phone" character varying(50),
    "sale_price" numeric(12,2),
    "closing_date" date,
    "package_type" character varying(20) default 'standard'::character varying,
    "processing_fee" numeric(8,2) default 317.95,
    "rush_fee" numeric(8,2) default 70.66,
    "convenience_fee" numeric(8,2) default 9.95,
    "total_amount" numeric(8,2),
    "payment_method" character varying(50),
    "status" character varying(50) default 'draft'::character varying,
    "documents" jsonb default '{}'::jsonb,
    "notes" text,
    "submitted_at" timestamp without time zone,
    "payment_confirmed_at" timestamp without time zone,
    "expected_completion_date" date,
    "completed_at" timestamp without time zone,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "property_owner_notified_at" timestamp without time zone,
    "property_owner_response_due" date,
    "payment_status" character varying(50) default 'pending'::character varying,
    "stripe_session_id" character varying(255),
    "stripe_payment_intent_id" character varying(255),
    "payment_completed_at" timestamp without time zone,
    "payment_failed_at" timestamp without time zone,
    "payment_canceled_at" timestamp without time zone,
    "payment_failure_reason" text,
    "forms_updated_at" timestamp without time zone default now(),
    "assigned_to" character varying,
    "inspection_form_completed_at" timestamp without time zone,
    "resale_certificate_completed_at" timestamp without time zone,
    "pdf_completed_at" timestamp without time zone,
    "email_completed_at" timestamp without time zone,
    "comments" text,
    "pdf_expires_at" timestamp without time zone,
    "pdf_url" character varying,
    "pdf_generated_at" timestamp without time zone,
    "application_type" character varying(50) not null default 'standard'::character varying,
    "parent_application_id" integer,
    "is_multi_child" boolean default false,
    "settlement_form_completed_at" timestamp with time zone,
    "lender_questionnaire_file_path" character varying(500),
    "lender_questionnaire_deletion_date" timestamp with time zone,
    "lender_questionnaire_completed_file_path" character varying(500),
    "lender_questionnaire_completed_uploaded_at" timestamp with time zone,
    "lender_questionnaire_downloaded_at" timestamp with time zone,
    "lender_questionnaire_edited_file_path" character varying(500),
    "lender_questionnaire_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "include_property_documents" boolean default false
      );


alter table "public"."applications" enable row level security;


  create table "public"."auto_login_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "token_hash" text not null,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "used_at" timestamp with time zone,
    "attempts" integer not null default 0
      );


alter table "public"."auto_login_tokens" enable row level security;


  create table "public"."compliance_inspections" (
    "id" integer not null default nextval('public.compliance_inspections_id_seq'::regclass),
    "application_id" integer,
    "inspector_user_id" uuid,
    "inspection_date" date,
    "inspection_time" time without time zone,
    "inspector_name" character varying(255),
    "approved_modifications" text,
    "covenant_violations" text,
    "general_comments" text,
    "status" character varying(50) default 'pending'::character varying,
    "primary_contact" character varying(255),
    "signature_contact" character varying(255),
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
      );


alter table "public"."compliance_inspections" enable row level security;


  create table "public"."email_verification_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "token_hash" text not null,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "used_at" timestamp with time zone,
    "attempts" integer not null default 0
      );


alter table "public"."email_verification_tokens" enable row level security;


  create table "public"."hoa_properties" (
    "id" integer not null default nextval('public.hoa_properties_id_seq'::regclass),
    "name" character varying(255) not null,
    "location" character varying(255),
    "management_contact" character varying(255),
    "phone" character varying(50),
    "email" character varying(255),
    "fee_schedule" jsonb default '{}'::jsonb,
    "special_requirements" text,
    "documents_folder" character varying(255),
    "active" boolean default true,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "property_owner_email" character varying(255),
    "property_owner_name" character varying(255),
    "property_owner_phone" character varying(50),
    "notification_preferences" jsonb default '{"sms": false, "email": true}'::jsonb,
    "is_multi_community" boolean default false,
    "allow_public_offering" boolean default false,
    "force_price_enabled" boolean default false,
    "force_price_value" numeric(10,2) default NULL::numeric,
    "deleted_at" timestamp with time zone,
    "document_order" jsonb
      );


alter table "public"."hoa_properties" enable row level security;


  create table "public"."hoa_property_resale_templates" (
    "id" integer not null default nextval('public.property_owner_forms_id_seq'::regclass),
    "hoa_property_id" integer not null,
    "template_data" jsonb default '{}'::jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
      );


alter table "public"."hoa_property_resale_templates" enable row level security;


  create table "public"."linked_properties" (
    "id" integer not null default nextval('public.linked_properties_id_seq'::regclass),
    "primary_property_id" integer not null,
    "linked_property_id" integer not null,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP
      );


alter table "public"."linked_properties" enable row level security;


  create table "public"."notifications" (
    "id" integer not null default nextval('public.notifications_id_seq'::regclass),
    "application_id" integer,
    "recipient_email" character varying(255) not null,
    "recipient_name" character varying(255),
    "notification_type" character varying(50),
    "subject" character varying(500) not null,
    "message" text not null,
    "email_template" character varying(100),
    "status" character varying(50) default 'pending'::character varying,
    "sent_at" timestamp without time zone,
    "delivered_at" timestamp without time zone,
    "error_message" text,
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp without time zone default now(),
    "recipient_user_id" uuid,
    "is_read" boolean default false,
    "read_at" timestamp with time zone,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "deleted_at" timestamp with time zone
      );


alter table "public"."notifications" enable row level security;


  create table "public"."password_reset_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "token_hash" text not null,
    "expires_at" timestamp with time zone not null,
    "used_at" timestamp with time zone,
    "attempts" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."password_reset_tokens" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" character varying(255) not null,
    "role" character varying(50) default 'external'::character varying,
    "first_name" character varying(255),
    "last_name" character varying(255),
    "phone" character varying(50),
    "company" character varying(255),
    "license_number" character varying(100),
    "active" boolean not null default true,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "deleted_at" timestamp with time zone,
    "email_confirmed_at" timestamp with time zone
      );


alter table "public"."profiles" enable row level security;


  create table "public"."property_documents" (
    "id" integer not null default nextval('public.property_documents_id_seq'::regclass),
    "property_id" integer not null,
    "document_key" character varying(100) not null,
    "document_name" character varying(255) not null,
    "file_path" text,
    "is_not_applicable" boolean default false,
    "expiration_date" date,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "display_name" character varying(255),
    "file_name" character varying(255)
      );



  create table "public"."property_owner_forms" (
    "id" integer not null default nextval('public.property_owner_forms_id_seq'::regclass),
    "application_id" integer,
    "hoa_property_id" integer,
    "recipient_email" character varying(255) not null,
    "recipient_name" character varying(255),
    "form_type" character varying(50) default 'property_disclosure'::character varying,
    "form_data" jsonb default '{}'::jsonb,
    "status" character varying(50) default 'not_started'::character varying,
    "response_data" jsonb default '{}'::jsonb,
    "completed_at" timestamp without time zone,
    "expires_at" timestamp without time zone default (now() + '7 days'::interval),
    "access_token" character varying(255) not null default (gen_random_uuid())::text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "pdf_url" text,
    "property_group_id" integer
      );


alter table "public"."property_owner_forms" enable row level security;


  create table "public"."property_owner_forms_list" (
    "id" integer not null default nextval('public.property_owner_forms_list_id_seq'::regclass),
    "form_type" character varying(50) not null,
    "display_name" character varying(100) not null,
    "user_roles" jsonb not null default '[]'::jsonb,
    "description" text,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP
      );


alter sequence "public"."application_property_groups_id_seq" owned by "public"."application_property_groups"."id";

alter sequence "public"."application_types_id_seq" owned by "public"."application_types"."id";

alter sequence "public"."applications_id_seq" owned by "public"."applications"."id";

alter sequence "public"."compliance_inspections_id_seq" owned by "public"."compliance_inspections"."id";

alter sequence "public"."hoa_properties_id_seq" owned by "public"."hoa_properties"."id";

alter sequence "public"."linked_properties_id_seq" owned by "public"."linked_properties"."id";

alter sequence "public"."notifications_id_seq" owned by "public"."notifications"."id";

alter sequence "public"."property_documents_id_seq" owned by "public"."property_documents"."id";

alter sequence "public"."property_owner_forms_id_seq" owned by "public"."property_owner_forms"."id";

alter sequence "public"."property_owner_forms_list_id_seq" owned by "public"."property_owner_forms_list"."id";

CREATE UNIQUE INDEX application_property_groups_pkey ON public.application_property_groups USING btree (id);

CREATE UNIQUE INDEX application_types_name_key ON public.application_types USING btree (name);

CREATE UNIQUE INDEX application_types_pkey ON public.application_types USING btree (id);

CREATE UNIQUE INDEX applications_pkey ON public.applications USING btree (id);

CREATE UNIQUE INDEX auto_login_tokens_pkey ON public.auto_login_tokens USING btree (id);

CREATE UNIQUE INDEX auto_login_tokens_token_hash_key ON public.auto_login_tokens USING btree (token_hash);

CREATE UNIQUE INDEX compliance_inspections_pkey ON public.compliance_inspections USING btree (id);

CREATE UNIQUE INDEX email_verification_tokens_pkey ON public.email_verification_tokens USING btree (id);

CREATE UNIQUE INDEX email_verification_tokens_token_hash_key ON public.email_verification_tokens USING btree (token_hash);

CREATE UNIQUE INDEX hoa_properties_name_key ON public.hoa_properties USING btree (name);

CREATE UNIQUE INDEX hoa_properties_pkey ON public.hoa_properties USING btree (id);

CREATE UNIQUE INDEX hoa_property_resale_templates_hoa_property_id_unique ON public.hoa_property_resale_templates USING btree (hoa_property_id);

CREATE UNIQUE INDEX hoa_property_resale_templates_pkey ON public.hoa_property_resale_templates USING btree (id);

CREATE INDEX idx_application_property_groups_application_id ON public.application_property_groups USING btree (application_id);

CREATE INDEX idx_application_property_groups_email_status ON public.application_property_groups USING btree (email_status);

CREATE INDEX idx_application_property_groups_inspection_status ON public.application_property_groups USING btree (inspection_status);

CREATE INDEX idx_application_property_groups_pdf_status ON public.application_property_groups USING btree (pdf_status);

CREATE INDEX idx_application_property_groups_property_id ON public.application_property_groups USING btree (property_id);

CREATE INDEX idx_application_property_groups_status ON public.application_property_groups USING btree (status);

CREATE INDEX idx_application_types_name ON public.application_types USING btree (name);

CREATE INDEX idx_applications_application_type ON public.applications USING btree (application_type);

CREATE INDEX idx_applications_assigned_to ON public.applications USING btree (assigned_to);

CREATE INDEX idx_applications_deleted_at ON public.applications USING btree (deleted_at) WHERE (deleted_at IS NULL);

CREATE INDEX idx_applications_forms_updated_at ON public.applications USING btree (forms_updated_at);

CREATE INDEX idx_applications_lender_questionnaire_deletion ON public.applications USING btree (lender_questionnaire_deletion_date) WHERE (lender_questionnaire_deletion_date IS NOT NULL);

CREATE INDEX idx_applications_parent_application_id ON public.applications USING btree (parent_application_id);

CREATE INDEX idx_applications_payment_status ON public.applications USING btree (payment_status);

CREATE INDEX idx_applications_pdf_expires_at ON public.applications USING btree (pdf_expires_at);

CREATE INDEX idx_applications_settlement_form_completed_at ON public.applications USING btree (settlement_form_completed_at);

CREATE INDEX idx_applications_stripe_payment_intent_id ON public.applications USING btree (stripe_payment_intent_id);

CREATE INDEX idx_applications_stripe_session_id ON public.applications USING btree (stripe_session_id);

CREATE INDEX idx_applications_task_completion ON public.applications USING btree (inspection_form_completed_at, resale_certificate_completed_at, pdf_completed_at, email_completed_at);

CREATE INDEX idx_auto_login_tokens_expires ON public.auto_login_tokens USING btree (expires_at) WHERE (used_at IS NULL);

CREATE INDEX idx_auto_login_tokens_hash ON public.auto_login_tokens USING btree (token_hash);

CREATE INDEX idx_auto_login_tokens_user_unused ON public.auto_login_tokens USING btree (user_id) WHERE (used_at IS NULL);

CREATE INDEX idx_email_verification_tokens_expires ON public.email_verification_tokens USING btree (expires_at) WHERE (used_at IS NULL);

CREATE INDEX idx_email_verification_tokens_hash ON public.email_verification_tokens USING btree (token_hash);

CREATE INDEX idx_email_verification_tokens_user_unused ON public.email_verification_tokens USING btree (user_id) WHERE (used_at IS NULL);

CREATE INDEX idx_hoa_properties_allow_public_offering ON public.hoa_properties USING btree (allow_public_offering);

CREATE INDEX idx_hoa_properties_deleted_at ON public.hoa_properties USING btree (deleted_at) WHERE (deleted_at IS NULL);

CREATE INDEX idx_hoa_properties_document_order ON public.hoa_properties USING btree (document_order) WHERE (document_order IS NOT NULL);

CREATE INDEX idx_hoa_properties_force_price ON public.hoa_properties USING btree (force_price_enabled) WHERE (force_price_enabled = true);

CREATE INDEX idx_hoa_properties_multi_community ON public.hoa_properties USING btree (is_multi_community);

CREATE INDEX idx_linked_properties_linked ON public.linked_properties USING btree (linked_property_id);

CREATE INDEX idx_linked_properties_primary ON public.linked_properties USING btree (primary_property_id);

CREATE INDEX idx_notifications_application_id ON public.notifications USING btree (application_id);

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_notifications_deleted_at ON public.notifications USING btree (deleted_at) WHERE (deleted_at IS NULL);

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read) WHERE (is_read = false);

CREATE INDEX idx_notifications_notification_type ON public.notifications USING btree (notification_type);

CREATE INDEX idx_notifications_recipient_email ON public.notifications USING btree (recipient_email);

CREATE INDEX idx_notifications_recipient_user_id ON public.notifications USING btree (recipient_user_id);

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);

CREATE INDEX idx_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);

CREATE INDEX idx_profiles_deleted_at ON public.profiles USING btree (deleted_at) WHERE (deleted_at IS NULL);

CREATE INDEX idx_property_documents_expiration ON public.property_documents USING btree (expiration_date) WHERE (expiration_date IS NOT NULL);

CREATE INDEX idx_property_documents_property_id ON public.property_documents USING btree (property_id);

CREATE INDEX idx_property_documents_property_key ON public.property_documents USING btree (property_id, document_key);

CREATE INDEX idx_property_owner_forms_form_type ON public.property_owner_forms_list USING btree (form_type);

CREATE INDEX idx_property_owner_forms_property_group_id ON public.property_owner_forms USING btree (property_group_id);

CREATE UNIQUE INDEX linked_properties_pkey ON public.linked_properties USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id);

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);

CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX property_documents_pkey ON public.property_documents USING btree (id);

CREATE UNIQUE INDEX property_owner_forms_access_token_key ON public.property_owner_forms USING btree (access_token);

CREATE UNIQUE INDEX property_owner_forms_list_form_type_key ON public.property_owner_forms_list USING btree (form_type);

CREATE UNIQUE INDEX property_owner_forms_list_pkey ON public.property_owner_forms_list USING btree (id);

CREATE UNIQUE INDEX property_owner_forms_pkey ON public.property_owner_forms USING btree (id);

CREATE UNIQUE INDEX unique_application_property ON public.application_property_groups USING btree (application_id, property_id);

CREATE UNIQUE INDEX unique_notification_per_recipient ON public.notifications USING btree (application_id, recipient_email, notification_type);

CREATE UNIQUE INDEX unique_property_link ON public.linked_properties USING btree (primary_property_id, linked_property_id);

alter table "public"."application_property_groups" add constraint "application_property_groups_pkey" PRIMARY KEY using index "application_property_groups_pkey";

alter table "public"."application_types" add constraint "application_types_pkey" PRIMARY KEY using index "application_types_pkey";

alter table "public"."applications" add constraint "applications_pkey" PRIMARY KEY using index "applications_pkey";

alter table "public"."auto_login_tokens" add constraint "auto_login_tokens_pkey" PRIMARY KEY using index "auto_login_tokens_pkey";

alter table "public"."compliance_inspections" add constraint "compliance_inspections_pkey" PRIMARY KEY using index "compliance_inspections_pkey";

alter table "public"."email_verification_tokens" add constraint "email_verification_tokens_pkey" PRIMARY KEY using index "email_verification_tokens_pkey";

alter table "public"."hoa_properties" add constraint "hoa_properties_pkey" PRIMARY KEY using index "hoa_properties_pkey";

alter table "public"."hoa_property_resale_templates" add constraint "hoa_property_resale_templates_pkey" PRIMARY KEY using index "hoa_property_resale_templates_pkey";

alter table "public"."linked_properties" add constraint "linked_properties_pkey" PRIMARY KEY using index "linked_properties_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."password_reset_tokens" add constraint "password_reset_tokens_pkey" PRIMARY KEY using index "password_reset_tokens_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."property_documents" add constraint "property_documents_pkey" PRIMARY KEY using index "property_documents_pkey";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_pkey" PRIMARY KEY using index "property_owner_forms_pkey";

alter table "public"."property_owner_forms_list" add constraint "property_owner_forms_list_pkey" PRIMARY KEY using index "property_owner_forms_list_pkey";

alter table "public"."application_property_groups" add constraint "application_property_groups_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE not valid;

alter table "public"."application_property_groups" validate constraint "application_property_groups_application_id_fkey";

alter table "public"."application_property_groups" add constraint "application_property_groups_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE not valid;

alter table "public"."application_property_groups" validate constraint "application_property_groups_property_id_fkey";

alter table "public"."application_property_groups" add constraint "check_email_status" CHECK (((email_status)::text = ANY (ARRAY[('not_started'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text]))) not valid;

alter table "public"."application_property_groups" validate constraint "check_email_status";

alter table "public"."application_property_groups" add constraint "check_inspection_status" CHECK (((inspection_status)::text = ANY (ARRAY[('not_started'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text]))) not valid;

alter table "public"."application_property_groups" validate constraint "check_inspection_status";

alter table "public"."application_property_groups" add constraint "check_pdf_status" CHECK (((pdf_status)::text = ANY (ARRAY[('not_started'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text]))) not valid;

alter table "public"."application_property_groups" validate constraint "check_pdf_status";

alter table "public"."application_property_groups" add constraint "unique_application_property" UNIQUE using index "unique_application_property";

alter table "public"."application_types" add constraint "application_types_name_key" UNIQUE using index "application_types_name_key";

alter table "public"."applications" add constraint "applications_hoa_property_id_fkey" FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id) not valid;

alter table "public"."applications" validate constraint "applications_hoa_property_id_fkey";

alter table "public"."applications" add constraint "applications_package_type_check" CHECK (((package_type)::text = ANY (ARRAY[('standard'::character varying)::text, ('rush'::character varying)::text]))) not valid;

alter table "public"."applications" validate constraint "applications_package_type_check";

alter table "public"."applications" add constraint "applications_parent_application_id_fkey" FOREIGN KEY (parent_application_id) REFERENCES public.applications(id) ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_parent_application_id_fkey";

alter table "public"."applications" add constraint "applications_payment_status_check" CHECK (((payment_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('canceled'::character varying)::text, ('refunded'::character varying)::text]))) not valid;

alter table "public"."applications" validate constraint "applications_payment_status_check";

alter table "public"."applications" add constraint "applications_status_check" CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('submitted'::character varying)::text, ('pending_payment'::character varying)::text, ('payment_confirmed'::character varying)::text, ('under_review'::character varying)::text, ('compliance_pending'::character varying)::text, ('compliance_completed'::character varying)::text, ('documents_generated'::character varying)::text, ('approved'::character varying)::text, ('completed'::character varying)::text, ('rejected'::character varying)::text, ('awaiting_property_owner_response'::character varying)::text]))) not valid;

alter table "public"."applications" validate constraint "applications_status_check";

alter table "public"."applications" add constraint "applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."applications" validate constraint "applications_user_id_fkey";

alter table "public"."auto_login_tokens" add constraint "auto_login_tokens_token_hash_key" UNIQUE using index "auto_login_tokens_token_hash_key";

alter table "public"."auto_login_tokens" add constraint "auto_login_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."auto_login_tokens" validate constraint "auto_login_tokens_user_id_fkey";

alter table "public"."auto_login_tokens" add constraint "short_expiry" CHECK ((expires_at <= (created_at + '00:05:00'::interval))) not valid;

alter table "public"."auto_login_tokens" validate constraint "short_expiry";

alter table "public"."auto_login_tokens" add constraint "valid_attempts" CHECK ((attempts >= 0)) not valid;

alter table "public"."auto_login_tokens" validate constraint "valid_attempts";

alter table "public"."auto_login_tokens" add constraint "valid_expiry" CHECK ((expires_at > created_at)) not valid;

alter table "public"."auto_login_tokens" validate constraint "valid_expiry";

alter table "public"."compliance_inspections" add constraint "compliance_inspections_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) not valid;

alter table "public"."compliance_inspections" validate constraint "compliance_inspections_application_id_fkey";

alter table "public"."compliance_inspections" add constraint "compliance_inspections_inspector_user_id_fkey" FOREIGN KEY (inspector_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."compliance_inspections" validate constraint "compliance_inspections_inspector_user_id_fkey";

alter table "public"."compliance_inspections" add constraint "compliance_inspections_status_check" CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('scheduled'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('approved'::character varying)::text, ('requires_action'::character varying)::text]))) not valid;

alter table "public"."compliance_inspections" validate constraint "compliance_inspections_status_check";

alter table "public"."email_verification_tokens" add constraint "email_verification_tokens_token_hash_key" UNIQUE using index "email_verification_tokens_token_hash_key";

alter table "public"."email_verification_tokens" add constraint "email_verification_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."email_verification_tokens" validate constraint "email_verification_tokens_user_id_fkey";

alter table "public"."email_verification_tokens" add constraint "valid_attempts" CHECK ((attempts >= 0)) not valid;

alter table "public"."email_verification_tokens" validate constraint "valid_attempts";

alter table "public"."email_verification_tokens" add constraint "valid_expiry" CHECK ((expires_at > created_at)) not valid;

alter table "public"."email_verification_tokens" validate constraint "valid_expiry";

alter table "public"."hoa_properties" add constraint "force_price_value_when_enabled" CHECK (((force_price_enabled = false) OR ((force_price_enabled = true) AND (force_price_value IS NOT NULL) AND (force_price_value >= (0)::numeric)))) not valid;

alter table "public"."hoa_properties" validate constraint "force_price_value_when_enabled";

alter table "public"."hoa_properties" add constraint "hoa_properties_name_key" UNIQUE using index "hoa_properties_name_key";

alter table "public"."hoa_property_resale_templates" add constraint "hoa_property_resale_templates_hoa_property_id_fkey" FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE not valid;

alter table "public"."hoa_property_resale_templates" validate constraint "hoa_property_resale_templates_hoa_property_id_fkey";

alter table "public"."hoa_property_resale_templates" add constraint "hoa_property_resale_templates_hoa_property_id_unique" UNIQUE using index "hoa_property_resale_templates_hoa_property_id_unique";

alter table "public"."linked_properties" add constraint "linked_properties_linked_property_id_fkey" FOREIGN KEY (linked_property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE not valid;

alter table "public"."linked_properties" validate constraint "linked_properties_linked_property_id_fkey";

alter table "public"."linked_properties" add constraint "linked_properties_primary_property_id_fkey" FOREIGN KEY (primary_property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE not valid;

alter table "public"."linked_properties" validate constraint "linked_properties_primary_property_id_fkey";

alter table "public"."linked_properties" add constraint "no_self_link" CHECK ((primary_property_id <> linked_property_id)) not valid;

alter table "public"."linked_properties" validate constraint "no_self_link";

alter table "public"."linked_properties" add constraint "unique_property_link" UNIQUE using index "unique_property_link";

alter table "public"."notifications" add constraint "notifications_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) not valid;

alter table "public"."notifications" validate constraint "notifications_application_id_fkey";

alter table "public"."notifications" add constraint "notifications_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_recipient_user_id_fkey";

alter table "public"."notifications" add constraint "unique_notification_per_recipient" UNIQUE using index "unique_notification_per_recipient";

alter table "public"."password_reset_tokens" add constraint "password_reset_tokens_token_hash_key" UNIQUE using index "password_reset_tokens_token_hash_key";

alter table "public"."password_reset_tokens" add constraint "password_reset_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."password_reset_tokens" validate constraint "password_reset_tokens_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_email_key" UNIQUE using index "profiles_email_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying, 'requester'::character varying, NULL::character varying])::text[]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

alter table "public"."property_documents" add constraint "property_documents_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE not valid;

alter table "public"."property_documents" validate constraint "property_documents_property_id_fkey";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_access_token_key" UNIQUE using index "property_owner_forms_access_token_key";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) not valid;

alter table "public"."property_owner_forms" validate constraint "property_owner_forms_application_id_fkey";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_form_type_check" CHECK (((form_type)::text = ANY (ARRAY[('inspection_form'::character varying)::text, ('resale_certificate'::character varying)::text, ('settlement_form'::character varying)::text]))) not valid;

alter table "public"."property_owner_forms" validate constraint "property_owner_forms_form_type_check";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_hoa_property_id_fkey" FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id) not valid;

alter table "public"."property_owner_forms" validate constraint "property_owner_forms_hoa_property_id_fkey";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_property_group_id_fkey" FOREIGN KEY (property_group_id) REFERENCES public.application_property_groups(id) ON DELETE CASCADE not valid;

alter table "public"."property_owner_forms" validate constraint "property_owner_forms_property_group_id_fkey";

alter table "public"."property_owner_forms" add constraint "property_owner_forms_status_check" CHECK (((status)::text = ANY (ARRAY[('not_started'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('expired'::character varying)::text]))) not valid;

alter table "public"."property_owner_forms" validate constraint "property_owner_forms_status_check";

alter table "public"."property_owner_forms_list" add constraint "property_owner_forms_list_form_type_key" UNIQUE using index "property_owner_forms_list_form_type_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_expiring_documents()
 RETURNS TABLE(property_id integer, property_name character varying, document_name character varying, expiration_date date, days_until_expiration integer, property_owner_email character varying)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        pd.property_id,
        hp.name as property_name,
        pd.document_name,
        pd.expiration_date,
        (pd.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
        hp.property_owner_email
    FROM property_documents pd
    JOIN hoa_properties hp ON pd.property_id = hp.id
    WHERE pd.expiration_date IS NOT NULL
        AND pd.is_not_applicable = FALSE
        AND pd.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
        AND pd.expiration_date >= CURRENT_DATE
    ORDER BY pd.expiration_date ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_linked_properties(property_id integer)
 RETURNS TABLE(linked_property_id integer, property_name character varying, location character varying, property_owner_email character varying)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        lp.linked_property_id,
        hp.name as property_name,
        hp.location,
        hp.property_owner_email
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.linked_property_id = hp.id
    WHERE lp.primary_property_id = property_id
    ORDER BY hp.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_properties_linking_to(property_id integer)
 RETURNS TABLE(primary_property_id integer, property_name character varying, location character varying)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        lp.primary_property_id,
        hp.name as property_name,
        hp.location
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.primary_property_id = hp.id
    WHERE lp.linked_property_id = property_id
    ORDER BY hp.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id, 
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_linked_properties(property_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    link_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO link_count
    FROM linked_properties
    WHERE primary_property_id = property_id;
    
    RETURN link_count > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_property_owner_on_submit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  property_owner_email VARCHAR(255);
  property_owner_name VARCHAR(255);
  notification_id INTEGER;
  inspection_form_id INTEGER;
  resale_cert_id INTEGER;
  existing_notifications INTEGER;
BEGIN
  -- Only trigger when status changes to 'submitted' and no notifications exist yet
  IF NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status != 'submitted') THEN
    
    -- Check if notifications already exist for this application
    SELECT COUNT(*) INTO existing_notifications
    FROM notifications 
    WHERE application_id = NEW.id;
    
    -- Only proceed if no notifications exist yet
    IF existing_notifications = 0 THEN
      
      -- Get property owner details
      SELECT hp.property_owner_email, hp.property_owner_name
      INTO property_owner_email, property_owner_name
      FROM hoa_properties hp
      WHERE hp.id = NEW.hoa_property_id;
      
      -- Create notification record for inspection form
      INSERT INTO notifications (
        application_id,
        recipient_email,
        recipient_name,
        notification_type,
        subject,
        message,
        email_template
      ) VALUES (
        NEW.id,
        property_owner_email,
        property_owner_name,
        'inspection_form_request',
        'Property Inspection Form Required - Application #' || NEW.id,
        'A new property transfer application requires completion of the property inspection form. Please complete the attached form and return it promptly.',
        'inspection_form_notification'
      ) RETURNING id INTO notification_id;
      
      -- Create property inspection form
      INSERT INTO property_owner_forms (
        application_id,
        hoa_property_id,
        recipient_email,
        recipient_name,
        form_type
      ) VALUES (
        NEW.id,
        NEW.hoa_property_id,
        property_owner_email,
        property_owner_name,
        'inspection_form'
      ) RETURNING id INTO inspection_form_id;
      
      -- Create notification record for resale certificate
      INSERT INTO notifications (
        application_id,
        recipient_email,
        recipient_name,
        notification_type,
        subject,
        message,
        email_template
      ) VALUES (
        NEW.id,
        property_owner_email,
        property_owner_name,
        'resale_certificate_request',
        'Resale Certificate Required - Application #' || NEW.id,
        'A new property transfer application requires completion of the Virginia Resale Certificate (Form A492-05RESALE-v4). Please complete all required sections.',
        'resale_certificate_notification'
      ) RETURNING id INTO notification_id;
      
      -- Create resale certificate form
      INSERT INTO property_owner_forms (
        application_id,
        hoa_property_id,
        recipient_email,
        recipient_name,
        form_type
      ) VALUES (
        NEW.id,
        NEW.hoa_property_id,
        property_owner_email,
        property_owner_name,
        'resale_certificate'
      ) RETURNING id INTO resale_cert_id;
      
      -- Update application with notification timestamp
      UPDATE applications 
      SET 
        property_owner_notified_at = NOW(),
        property_owner_response_due = (NOW() + INTERVAL '7 days')::date,
        status = 'awaiting_property_owner_response'
      WHERE id = NEW.id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_all_multi_community_flags()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE hoa_properties hp
  SET is_multi_community = EXISTS(
    SELECT 1 
    FROM linked_properties lp 
    WHERE lp.primary_property_id = hp.id
  ),
  updated_at = CURRENT_TIMESTAMP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_is_multi_community()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  primary_id INTEGER;
  has_links BOOLEAN;
BEGIN
  -- Determine which property ID to check
  IF TG_OP = 'INSERT' THEN
    primary_id := NEW.primary_property_id;
  ELSIF TG_OP = 'DELETE' THEN
    primary_id := OLD.primary_property_id;
  ELSE
    -- For UPDATE, check both old and new primary_property_id
    IF OLD.primary_property_id != NEW.primary_property_id THEN
      -- Link was moved to a different property, update both
      primary_id := OLD.primary_property_id;
      PERFORM update_is_multi_community_for_property(primary_id);
      primary_id := NEW.primary_property_id;
    ELSE
      primary_id := NEW.primary_property_id;
    END IF;
  END IF;

  -- Update the primary property
  PERFORM update_is_multi_community_for_property(primary_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_is_multi_community_for_property(prop_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  has_links BOOLEAN;
BEGIN
  -- Check if property has any linked properties
  SELECT EXISTS(
    SELECT 1 
    FROM linked_properties 
    WHERE primary_property_id = prop_id
  ) INTO has_links;

  -- Update is_multi_community based on whether links exist
  UPDATE hoa_properties
  SET is_multi_community = has_links,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = prop_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_no_circular_reference(primary_id integer, linked_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  dup_count INTEGER;
BEGIN
  -- Block self-linking (A -> A)
  IF primary_id = linked_id THEN
    RETURN FALSE;
  END IF;

  -- Block exact duplicates only (existing A -> B)
  SELECT COUNT(*) INTO dup_count
  FROM linked_properties
  WHERE primary_property_id = primary_id
    AND linked_property_id = linked_id;

  RETURN dup_count = 0;
END;
$function$
;

grant delete on table "public"."application_property_groups" to "anon";

grant insert on table "public"."application_property_groups" to "anon";

grant references on table "public"."application_property_groups" to "anon";

grant select on table "public"."application_property_groups" to "anon";

grant trigger on table "public"."application_property_groups" to "anon";

grant truncate on table "public"."application_property_groups" to "anon";

grant update on table "public"."application_property_groups" to "anon";

grant delete on table "public"."application_property_groups" to "authenticated";

grant insert on table "public"."application_property_groups" to "authenticated";

grant references on table "public"."application_property_groups" to "authenticated";

grant select on table "public"."application_property_groups" to "authenticated";

grant trigger on table "public"."application_property_groups" to "authenticated";

grant truncate on table "public"."application_property_groups" to "authenticated";

grant update on table "public"."application_property_groups" to "authenticated";

grant delete on table "public"."application_property_groups" to "service_role";

grant insert on table "public"."application_property_groups" to "service_role";

grant references on table "public"."application_property_groups" to "service_role";

grant select on table "public"."application_property_groups" to "service_role";

grant trigger on table "public"."application_property_groups" to "service_role";

grant truncate on table "public"."application_property_groups" to "service_role";

grant update on table "public"."application_property_groups" to "service_role";

grant delete on table "public"."application_types" to "anon";

grant insert on table "public"."application_types" to "anon";

grant references on table "public"."application_types" to "anon";

grant select on table "public"."application_types" to "anon";

grant trigger on table "public"."application_types" to "anon";

grant truncate on table "public"."application_types" to "anon";

grant update on table "public"."application_types" to "anon";

grant delete on table "public"."application_types" to "authenticated";

grant insert on table "public"."application_types" to "authenticated";

grant references on table "public"."application_types" to "authenticated";

grant select on table "public"."application_types" to "authenticated";

grant trigger on table "public"."application_types" to "authenticated";

grant truncate on table "public"."application_types" to "authenticated";

grant update on table "public"."application_types" to "authenticated";

grant delete on table "public"."application_types" to "service_role";

grant insert on table "public"."application_types" to "service_role";

grant references on table "public"."application_types" to "service_role";

grant select on table "public"."application_types" to "service_role";

grant trigger on table "public"."application_types" to "service_role";

grant truncate on table "public"."application_types" to "service_role";

grant update on table "public"."application_types" to "service_role";

grant delete on table "public"."applications" to "anon";

grant insert on table "public"."applications" to "anon";

grant references on table "public"."applications" to "anon";

grant select on table "public"."applications" to "anon";

grant trigger on table "public"."applications" to "anon";

grant truncate on table "public"."applications" to "anon";

grant update on table "public"."applications" to "anon";

grant delete on table "public"."applications" to "authenticated";

grant insert on table "public"."applications" to "authenticated";

grant references on table "public"."applications" to "authenticated";

grant select on table "public"."applications" to "authenticated";

grant trigger on table "public"."applications" to "authenticated";

grant truncate on table "public"."applications" to "authenticated";

grant update on table "public"."applications" to "authenticated";

grant delete on table "public"."applications" to "service_role";

grant insert on table "public"."applications" to "service_role";

grant references on table "public"."applications" to "service_role";

grant select on table "public"."applications" to "service_role";

grant trigger on table "public"."applications" to "service_role";

grant truncate on table "public"."applications" to "service_role";

grant update on table "public"."applications" to "service_role";

grant delete on table "public"."auto_login_tokens" to "anon";

grant insert on table "public"."auto_login_tokens" to "anon";

grant references on table "public"."auto_login_tokens" to "anon";

grant select on table "public"."auto_login_tokens" to "anon";

grant trigger on table "public"."auto_login_tokens" to "anon";

grant truncate on table "public"."auto_login_tokens" to "anon";

grant update on table "public"."auto_login_tokens" to "anon";

grant delete on table "public"."auto_login_tokens" to "authenticated";

grant insert on table "public"."auto_login_tokens" to "authenticated";

grant references on table "public"."auto_login_tokens" to "authenticated";

grant select on table "public"."auto_login_tokens" to "authenticated";

grant trigger on table "public"."auto_login_tokens" to "authenticated";

grant truncate on table "public"."auto_login_tokens" to "authenticated";

grant update on table "public"."auto_login_tokens" to "authenticated";

grant delete on table "public"."auto_login_tokens" to "service_role";

grant insert on table "public"."auto_login_tokens" to "service_role";

grant references on table "public"."auto_login_tokens" to "service_role";

grant select on table "public"."auto_login_tokens" to "service_role";

grant trigger on table "public"."auto_login_tokens" to "service_role";

grant truncate on table "public"."auto_login_tokens" to "service_role";

grant update on table "public"."auto_login_tokens" to "service_role";

grant delete on table "public"."compliance_inspections" to "anon";

grant insert on table "public"."compliance_inspections" to "anon";

grant references on table "public"."compliance_inspections" to "anon";

grant select on table "public"."compliance_inspections" to "anon";

grant trigger on table "public"."compliance_inspections" to "anon";

grant truncate on table "public"."compliance_inspections" to "anon";

grant update on table "public"."compliance_inspections" to "anon";

grant delete on table "public"."compliance_inspections" to "authenticated";

grant insert on table "public"."compliance_inspections" to "authenticated";

grant references on table "public"."compliance_inspections" to "authenticated";

grant select on table "public"."compliance_inspections" to "authenticated";

grant trigger on table "public"."compliance_inspections" to "authenticated";

grant truncate on table "public"."compliance_inspections" to "authenticated";

grant update on table "public"."compliance_inspections" to "authenticated";

grant delete on table "public"."compliance_inspections" to "service_role";

grant insert on table "public"."compliance_inspections" to "service_role";

grant references on table "public"."compliance_inspections" to "service_role";

grant select on table "public"."compliance_inspections" to "service_role";

grant trigger on table "public"."compliance_inspections" to "service_role";

grant truncate on table "public"."compliance_inspections" to "service_role";

grant update on table "public"."compliance_inspections" to "service_role";

grant delete on table "public"."email_verification_tokens" to "anon";

grant insert on table "public"."email_verification_tokens" to "anon";

grant references on table "public"."email_verification_tokens" to "anon";

grant select on table "public"."email_verification_tokens" to "anon";

grant trigger on table "public"."email_verification_tokens" to "anon";

grant truncate on table "public"."email_verification_tokens" to "anon";

grant update on table "public"."email_verification_tokens" to "anon";

grant delete on table "public"."email_verification_tokens" to "authenticated";

grant insert on table "public"."email_verification_tokens" to "authenticated";

grant references on table "public"."email_verification_tokens" to "authenticated";

grant select on table "public"."email_verification_tokens" to "authenticated";

grant trigger on table "public"."email_verification_tokens" to "authenticated";

grant truncate on table "public"."email_verification_tokens" to "authenticated";

grant update on table "public"."email_verification_tokens" to "authenticated";

grant delete on table "public"."email_verification_tokens" to "service_role";

grant insert on table "public"."email_verification_tokens" to "service_role";

grant references on table "public"."email_verification_tokens" to "service_role";

grant select on table "public"."email_verification_tokens" to "service_role";

grant trigger on table "public"."email_verification_tokens" to "service_role";

grant truncate on table "public"."email_verification_tokens" to "service_role";

grant update on table "public"."email_verification_tokens" to "service_role";

grant delete on table "public"."hoa_properties" to "anon";

grant insert on table "public"."hoa_properties" to "anon";

grant references on table "public"."hoa_properties" to "anon";

grant select on table "public"."hoa_properties" to "anon";

grant trigger on table "public"."hoa_properties" to "anon";

grant truncate on table "public"."hoa_properties" to "anon";

grant update on table "public"."hoa_properties" to "anon";

grant delete on table "public"."hoa_properties" to "authenticated";

grant insert on table "public"."hoa_properties" to "authenticated";

grant references on table "public"."hoa_properties" to "authenticated";

grant select on table "public"."hoa_properties" to "authenticated";

grant trigger on table "public"."hoa_properties" to "authenticated";

grant truncate on table "public"."hoa_properties" to "authenticated";

grant update on table "public"."hoa_properties" to "authenticated";

grant delete on table "public"."hoa_properties" to "service_role";

grant insert on table "public"."hoa_properties" to "service_role";

grant references on table "public"."hoa_properties" to "service_role";

grant select on table "public"."hoa_properties" to "service_role";

grant trigger on table "public"."hoa_properties" to "service_role";

grant truncate on table "public"."hoa_properties" to "service_role";

grant update on table "public"."hoa_properties" to "service_role";

grant delete on table "public"."hoa_property_resale_templates" to "anon";

grant insert on table "public"."hoa_property_resale_templates" to "anon";

grant references on table "public"."hoa_property_resale_templates" to "anon";

grant select on table "public"."hoa_property_resale_templates" to "anon";

grant trigger on table "public"."hoa_property_resale_templates" to "anon";

grant truncate on table "public"."hoa_property_resale_templates" to "anon";

grant update on table "public"."hoa_property_resale_templates" to "anon";

grant delete on table "public"."hoa_property_resale_templates" to "authenticated";

grant insert on table "public"."hoa_property_resale_templates" to "authenticated";

grant references on table "public"."hoa_property_resale_templates" to "authenticated";

grant select on table "public"."hoa_property_resale_templates" to "authenticated";

grant trigger on table "public"."hoa_property_resale_templates" to "authenticated";

grant truncate on table "public"."hoa_property_resale_templates" to "authenticated";

grant update on table "public"."hoa_property_resale_templates" to "authenticated";

grant delete on table "public"."hoa_property_resale_templates" to "service_role";

grant insert on table "public"."hoa_property_resale_templates" to "service_role";

grant references on table "public"."hoa_property_resale_templates" to "service_role";

grant select on table "public"."hoa_property_resale_templates" to "service_role";

grant trigger on table "public"."hoa_property_resale_templates" to "service_role";

grant truncate on table "public"."hoa_property_resale_templates" to "service_role";

grant update on table "public"."hoa_property_resale_templates" to "service_role";

grant delete on table "public"."linked_properties" to "anon";

grant insert on table "public"."linked_properties" to "anon";

grant references on table "public"."linked_properties" to "anon";

grant select on table "public"."linked_properties" to "anon";

grant trigger on table "public"."linked_properties" to "anon";

grant truncate on table "public"."linked_properties" to "anon";

grant update on table "public"."linked_properties" to "anon";

grant delete on table "public"."linked_properties" to "authenticated";

grant insert on table "public"."linked_properties" to "authenticated";

grant references on table "public"."linked_properties" to "authenticated";

grant select on table "public"."linked_properties" to "authenticated";

grant trigger on table "public"."linked_properties" to "authenticated";

grant truncate on table "public"."linked_properties" to "authenticated";

grant update on table "public"."linked_properties" to "authenticated";

grant delete on table "public"."linked_properties" to "service_role";

grant insert on table "public"."linked_properties" to "service_role";

grant references on table "public"."linked_properties" to "service_role";

grant select on table "public"."linked_properties" to "service_role";

grant trigger on table "public"."linked_properties" to "service_role";

grant truncate on table "public"."linked_properties" to "service_role";

grant update on table "public"."linked_properties" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."password_reset_tokens" to "anon";

grant insert on table "public"."password_reset_tokens" to "anon";

grant references on table "public"."password_reset_tokens" to "anon";

grant select on table "public"."password_reset_tokens" to "anon";

grant trigger on table "public"."password_reset_tokens" to "anon";

grant truncate on table "public"."password_reset_tokens" to "anon";

grant update on table "public"."password_reset_tokens" to "anon";

grant delete on table "public"."password_reset_tokens" to "authenticated";

grant insert on table "public"."password_reset_tokens" to "authenticated";

grant references on table "public"."password_reset_tokens" to "authenticated";

grant select on table "public"."password_reset_tokens" to "authenticated";

grant trigger on table "public"."password_reset_tokens" to "authenticated";

grant truncate on table "public"."password_reset_tokens" to "authenticated";

grant update on table "public"."password_reset_tokens" to "authenticated";

grant delete on table "public"."password_reset_tokens" to "service_role";

grant insert on table "public"."password_reset_tokens" to "service_role";

grant references on table "public"."password_reset_tokens" to "service_role";

grant select on table "public"."password_reset_tokens" to "service_role";

grant trigger on table "public"."password_reset_tokens" to "service_role";

grant truncate on table "public"."password_reset_tokens" to "service_role";

grant update on table "public"."password_reset_tokens" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."property_documents" to "anon";

grant insert on table "public"."property_documents" to "anon";

grant references on table "public"."property_documents" to "anon";

grant select on table "public"."property_documents" to "anon";

grant trigger on table "public"."property_documents" to "anon";

grant truncate on table "public"."property_documents" to "anon";

grant update on table "public"."property_documents" to "anon";

grant delete on table "public"."property_documents" to "authenticated";

grant insert on table "public"."property_documents" to "authenticated";

grant references on table "public"."property_documents" to "authenticated";

grant select on table "public"."property_documents" to "authenticated";

grant trigger on table "public"."property_documents" to "authenticated";

grant truncate on table "public"."property_documents" to "authenticated";

grant update on table "public"."property_documents" to "authenticated";

grant delete on table "public"."property_documents" to "service_role";

grant insert on table "public"."property_documents" to "service_role";

grant references on table "public"."property_documents" to "service_role";

grant select on table "public"."property_documents" to "service_role";

grant trigger on table "public"."property_documents" to "service_role";

grant truncate on table "public"."property_documents" to "service_role";

grant update on table "public"."property_documents" to "service_role";

grant delete on table "public"."property_owner_forms" to "anon";

grant insert on table "public"."property_owner_forms" to "anon";

grant references on table "public"."property_owner_forms" to "anon";

grant select on table "public"."property_owner_forms" to "anon";

grant trigger on table "public"."property_owner_forms" to "anon";

grant truncate on table "public"."property_owner_forms" to "anon";

grant update on table "public"."property_owner_forms" to "anon";

grant delete on table "public"."property_owner_forms" to "authenticated";

grant insert on table "public"."property_owner_forms" to "authenticated";

grant references on table "public"."property_owner_forms" to "authenticated";

grant select on table "public"."property_owner_forms" to "authenticated";

grant trigger on table "public"."property_owner_forms" to "authenticated";

grant truncate on table "public"."property_owner_forms" to "authenticated";

grant update on table "public"."property_owner_forms" to "authenticated";

grant delete on table "public"."property_owner_forms" to "service_role";

grant insert on table "public"."property_owner_forms" to "service_role";

grant references on table "public"."property_owner_forms" to "service_role";

grant select on table "public"."property_owner_forms" to "service_role";

grant trigger on table "public"."property_owner_forms" to "service_role";

grant truncate on table "public"."property_owner_forms" to "service_role";

grant update on table "public"."property_owner_forms" to "service_role";

grant delete on table "public"."property_owner_forms_list" to "anon";

grant insert on table "public"."property_owner_forms_list" to "anon";

grant references on table "public"."property_owner_forms_list" to "anon";

grant select on table "public"."property_owner_forms_list" to "anon";

grant trigger on table "public"."property_owner_forms_list" to "anon";

grant truncate on table "public"."property_owner_forms_list" to "anon";

grant update on table "public"."property_owner_forms_list" to "anon";

grant delete on table "public"."property_owner_forms_list" to "authenticated";

grant insert on table "public"."property_owner_forms_list" to "authenticated";

grant references on table "public"."property_owner_forms_list" to "authenticated";

grant select on table "public"."property_owner_forms_list" to "authenticated";

grant trigger on table "public"."property_owner_forms_list" to "authenticated";

grant truncate on table "public"."property_owner_forms_list" to "authenticated";

grant update on table "public"."property_owner_forms_list" to "authenticated";

grant delete on table "public"."property_owner_forms_list" to "service_role";

grant insert on table "public"."property_owner_forms_list" to "service_role";

grant references on table "public"."property_owner_forms_list" to "service_role";

grant select on table "public"."property_owner_forms_list" to "service_role";

grant trigger on table "public"."property_owner_forms_list" to "service_role";

grant truncate on table "public"."property_owner_forms_list" to "service_role";

grant update on table "public"."property_owner_forms_list" to "service_role";


  create policy "Allow all operations for application_property_groups"
  on "public"."application_property_groups"
  as permissive
  for all
  to public
using (true);



  create policy "Allow delete access to application property groups"
  on "public"."application_property_groups"
  as permissive
  for delete
  to public
using (true);



  create policy "Allow insert access to application property groups"
  on "public"."application_property_groups"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow read access to application property groups"
  on "public"."application_property_groups"
  as permissive
  for select
  to public
using (true);



  create policy "Allow update access to application property groups"
  on "public"."application_property_groups"
  as permissive
  for update
  to public
using (true);



  create policy "Admins and staff can manage all applications"
  on "public"."applications"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY (ARRAY[('admin'::character varying)::text, ('staff'::character varying)::text]))))));



  create policy "Admins and staff can view all applications"
  on "public"."applications"
  as permissive
  for select
  to public
using (true);



  create policy "Allow all application operations"
  on "public"."applications"
  as permissive
  for all
  to public
using (true);



  create policy "Users can create applications"
  on "public"."applications"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can delete their own unpaid applications"
  on "public"."applications"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) AND ((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_payment'::character varying)::text]))));



  create policy "Users can update their own applications"
  on "public"."applications"
  as permissive
  for update
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY (ARRAY[('admin'::character varying)::text, ('staff'::character varying)::text])))))));



  create policy "Users can view their own applications"
  on "public"."applications"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY (ARRAY[('admin'::character varying)::text, ('staff'::character varying)::text])))))));



  create policy "users_own_applications"
  on "public"."applications"
  as permissive
  for all
  to authenticated
using ((user_id = auth.uid()));



  create policy "Auto-login tokens are server-side only"
  on "public"."auto_login_tokens"
  as permissive
  for all
  to public
using (false);



  create policy "Staff can manage compliance inspections"
  on "public"."compliance_inspections"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY (ARRAY[('admin'::character varying)::text, ('staff'::character varying)::text]))))));



  create policy "Tokens are server-side only"
  on "public"."email_verification_tokens"
  as permissive
  for all
  to public
using (false);



  create policy "Admin and staff can delete properties"
  on "public"."hoa_properties"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin and staff can insert properties"
  on "public"."hoa_properties"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin and staff can select properties"
  on "public"."hoa_properties"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[]))))));



  create policy "Admin and staff can update properties"
  on "public"."hoa_properties"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin can manage HOA properties"
  on "public"."hoa_properties"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'admin'::text)))));



  create policy "Admins can manage HOA properties"
  on "public"."hoa_properties"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'admin'::text)))));



  create policy "Anyone can view active HOA properties"
  on "public"."hoa_properties"
  as permissive
  for select
  to public
using ((active = true));



  create policy "Public read access to HOA properties"
  on "public"."hoa_properties"
  as permissive
  for select
  to public
using (true);



  create policy "Authenticated users can manage resale templates"
  on "public"."hoa_property_resale_templates"
  as permissive
  for all
  to public
using ((auth.uid() IS NOT NULL));



  create policy "Allow all operations for linked_properties"
  on "public"."linked_properties"
  as permissive
  for all
  to public
using (true);



  create policy "Allow authenticated users to create notifications"
  on "public"."notifications"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow authenticated users to update notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Allow authenticated users to view notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Service role can insert notifications"
  on "public"."notifications"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can read their own notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using (((recipient_user_id = auth.uid()) OR ((recipient_email)::text IN ( SELECT profiles.email
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "Users can update their own notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using (((recipient_user_id = auth.uid()) OR ((recipient_email)::text IN ( SELECT profiles.email
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
with check (((recipient_user_id = auth.uid()) OR ((recipient_email)::text IN ( SELECT profiles.email
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "public_notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using (true);



  create policy "Service role can manage password reset tokens"
  on "public"."password_reset_tokens"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Users can view own profile changes"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "admin_staff_can_read_all_profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



  create policy "service_role_can_manage_all_profiles"
  on "public"."profiles"
  as permissive
  for all
  to service_role
using (true);



  create policy "users_can_read_own_profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "users_can_update_own_profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));



  create policy "Users can create property owner forms"
  on "public"."property_owner_forms"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can delete their property owner forms"
  on "public"."property_owner_forms"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.applications
  WHERE ((applications.id = property_owner_forms.application_id) AND (applications.user_id = auth.uid()) AND ((applications.status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_payment'::character varying)::text]))))));



  create policy "Users can view their property owner forms"
  on "public"."property_owner_forms"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.applications
  WHERE ((applications.id = property_owner_forms.application_id) AND ((applications.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'admin'::text)))))))));



  create policy "public_forms_access"
  on "public"."property_owner_forms"
  as permissive
  for all
  to public
using (true);


CREATE TRIGGER update_application_property_groups_updated_at BEFORE UPDATE ON public.application_property_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_application_types_updated_at BEFORE UPDATE ON public.application_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_notify_property_owner AFTER UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.notify_property_owner_on_submit();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compliance_inspections_updated_at BEFORE UPDATE ON public.compliance_inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hoa_properties_updated_at BEFORE UPDATE ON public.hoa_properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER auto_update_multi_community_delete AFTER DELETE ON public.linked_properties FOR EACH ROW EXECUTE FUNCTION public.update_is_multi_community();

CREATE TRIGGER auto_update_multi_community_insert AFTER INSERT ON public.linked_properties FOR EACH ROW EXECUTE FUNCTION public.update_is_multi_community();

CREATE TRIGGER auto_update_multi_community_update AFTER UPDATE ON public.linked_properties FOR EACH ROW EXECUTE FUNCTION public.update_is_multi_community();

CREATE TRIGGER update_linked_properties_updated_at BEFORE UPDATE ON public.linked_properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_notifications_updated_at();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_property_documents_updated_at BEFORE UPDATE ON public.property_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_property_owner_forms_updated_at BEFORE UPDATE ON public.property_owner_forms_list FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


  create policy "Allow public to upload property files 3q6kjq_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'bucket0'::text));



  create policy "Allow public to upload property files 3q6kjq_1"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'bucket0'::text));



  create policy "Allow public to upload property files 3q6kjq_2"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'bucket0'::text));



  create policy "Allow public to upload property files 3q6kjq_3"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'bucket0'::text));



