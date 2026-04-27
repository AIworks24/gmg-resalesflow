


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_old_ai_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete completed jobs older than 7 days
  DELETE FROM ai_processing_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '7 days';
  
  -- Delete pending jobs that have been stuck for more than 1 hour
  -- (likely abandoned or failed to process)
  DELETE FROM ai_processing_jobs
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour';
  
  -- Log cleanup (optional - can be removed if not needed)
  RAISE NOTICE 'Cleaned up old AI processing jobs';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_ai_jobs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_ai_jobs"() IS 'Cleans up old AI processing jobs to prevent database bloat. Deletes completed/failed jobs older than 7 days and pending jobs older than 1 hour.';



CREATE OR REPLACE FUNCTION "public"."get_expiring_documents"() RETURNS TABLE("property_id" integer, "property_name" character varying, "document_name" character varying, "expiration_date" "date", "days_until_expiration" integer, "property_owner_email" character varying)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_expiring_documents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_impersonated_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT impersonated_user_id INTO target_user_id
  FROM impersonation_sessions
  WHERE admin_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
  
  RETURN target_user_id;
END;
$$;


ALTER FUNCTION "public"."get_impersonated_user_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_impersonated_user_id"() IS 'Returns the user ID being impersonated by current user, or NULL if not impersonating';



CREATE OR REPLACE FUNCTION "public"."get_linked_properties"("property_id" integer) RETURNS TABLE("linked_property_id" integer, "property_name" character varying, "location" character varying, "property_owner_email" character varying, "relationship_comment" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.linked_property_id,
        hp.name as property_name,
        hp.location,
        hp.property_owner_email,
        lp.relationship_comment
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.linked_property_id = hp.id
    WHERE lp.primary_property_id = property_id
    ORDER BY hp.name;
END;
$$;


ALTER FUNCTION "public"."get_linked_properties"("property_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_properties_linking_to"("property_id" integer) RETURNS TABLE("primary_property_id" integer, "property_name" character varying, "location" character varying)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_properties_linking_to"("property_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_linked_properties"("property_id" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    link_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO link_count
    FROM linked_properties
    WHERE primary_property_id = property_id;
    
    RETURN link_count > 0;
END;
$$;


ALTER FUNCTION "public"."has_linked_properties"("property_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM impersonation_sessions
    WHERE admin_user_id = auth.uid()
      AND impersonated_user_id = target_user_id
      AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") IS 'Helper function to check if current user is actively impersonating a target user';



CREATE OR REPLACE FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    admin_user_id,
    acting_user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    p_admin_user_id,
    p_acting_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_metadata,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;


ALTER FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") IS 'Helper function to insert audit log entries (callable via service role)';



CREATE OR REPLACE FUNCTION "public"."log_impersonation_session_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Log when impersonation starts
  IF TG_OP = 'INSERT' THEN
    INSERT INTO impersonation_audit_logs (
      impersonation_session_id,
      admin_user_id,
      impersonated_user_id,
      action_type,
      details
    ) VALUES (
      NEW.id,
      NEW.admin_user_id,
      NEW.impersonated_user_id,
      'start_impersonation',
      jsonb_build_object(
        'reason', NEW.reason,
        'ip_address', NEW.ip_address,
        'user_agent', NEW.user_agent
      )
    );
  END IF;
  
  -- Log when impersonation ends
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO impersonation_audit_logs (
      impersonation_session_id,
      admin_user_id,
      impersonated_user_id,
      action_type,
      details
    ) VALUES (
      NEW.id,
      NEW.admin_user_id,
      NEW.impersonated_user_id,
      'end_impersonation',
      jsonb_build_object(
        'duration_seconds', EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_impersonation_session_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_property_owner_on_submit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."notify_property_owner_on_submit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_all_multi_community_flags"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE hoa_properties hp
  SET is_multi_community = EXISTS(
    SELECT 1 
    FROM linked_properties lp 
    WHERE lp.primary_property_id = hp.id
  ),
  updated_at = CURRENT_TIMESTAMP;
END;
$$;


ALTER FUNCTION "public"."sync_all_multi_community_flags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_cleanup_old_ai_jobs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only run cleanup occasionally (every 100th job) to avoid performance impact
  IF (SELECT COUNT(*) FROM ai_processing_jobs) % 100 = 0 THEN
    PERFORM cleanup_old_ai_jobs();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_cleanup_old_ai_jobs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_cleanup_old_ai_jobs"() IS 'Trigger function that runs cleanup every 100th job insertion to maintain table size without impacting performance.';



CREATE OR REPLACE FUNCTION "public"."update_ai_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_form_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_form_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_impersonation_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_impersonation_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_is_multi_community"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_is_multi_community"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_is_multi_community_for_property"("prop_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_is_multi_community_for_property"("prop_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_notifications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_no_circular_reference"("primary_id" integer, "linked_id" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_no_circular_reference"("primary_id" integer, "linked_id" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."application_property_groups" (
    "id" integer NOT NULL,
    "application_id" integer NOT NULL,
    "property_id" integer NOT NULL,
    "property_name" character varying(255) NOT NULL,
    "property_location" character varying(255),
    "property_owner_email" character varying(255),
    "is_primary" boolean DEFAULT false,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "pdf_url" "text",
    "pdf_status" character varying(20) DEFAULT 'not_started'::character varying,
    "pdf_completed_at" timestamp with time zone,
    "email_status" character varying(20) DEFAULT 'not_started'::character varying,
    "email_completed_at" timestamp with time zone,
    "form_data" "jsonb",
    "inspection_status" character varying(20) DEFAULT 'not_started'::character varying,
    "inspection_completed_at" timestamp with time zone,
    "assigned_to" character varying(255),
    CONSTRAINT "check_email_status" CHECK ((("email_status")::"text" = ANY (ARRAY[('not_started'::character varying)::"text", ('in_progress'::character varying)::"text", ('completed'::character varying)::"text", ('failed'::character varying)::"text"]))),
    CONSTRAINT "check_inspection_status" CHECK ((("inspection_status")::"text" = ANY (ARRAY[('not_started'::character varying)::"text", ('in_progress'::character varying)::"text", ('completed'::character varying)::"text", ('failed'::character varying)::"text"]))),
    CONSTRAINT "check_pdf_status" CHECK ((("pdf_status")::"text" = ANY (ARRAY[('not_started'::character varying)::"text", ('in_progress'::character varying)::"text", ('completed'::character varying)::"text", ('failed'::character varying)::"text"])))
);


ALTER TABLE "public"."application_property_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."application_property_groups" IS 'Stores individual property groups within multi-community applications, allowing separate processing and email sending for each property';



COMMENT ON COLUMN "public"."application_property_groups"."application_id" IS 'Reference to the main application';



COMMENT ON COLUMN "public"."application_property_groups"."property_id" IS 'Reference to the specific property/association';



COMMENT ON COLUMN "public"."application_property_groups"."is_primary" IS 'Whether this is the primary property selected by the user';



COMMENT ON COLUMN "public"."application_property_groups"."status" IS 'Processing status: pending, completed, failed';



COMMENT ON COLUMN "public"."application_property_groups"."pdf_url" IS 'URL to the generated PDF for this property';



COMMENT ON COLUMN "public"."application_property_groups"."pdf_status" IS 'Status of PDF generation for this property';



COMMENT ON COLUMN "public"."application_property_groups"."pdf_completed_at" IS 'Timestamp when PDF was completed for this property';



COMMENT ON COLUMN "public"."application_property_groups"."email_status" IS 'Status of email sending for this property';



COMMENT ON COLUMN "public"."application_property_groups"."email_completed_at" IS 'Timestamp when email was sent for this property';



COMMENT ON COLUMN "public"."application_property_groups"."form_data" IS 'Property-specific form data for PDF generation';



COMMENT ON COLUMN "public"."application_property_groups"."inspection_status" IS 'Status of inspection form for this property';



COMMENT ON COLUMN "public"."application_property_groups"."inspection_completed_at" IS 'Timestamp when inspection form was completed for this property';



COMMENT ON COLUMN "public"."application_property_groups"."assigned_to" IS 'Staff member (email) assigned to handle this property in a multi-community application.';



CREATE SEQUENCE IF NOT EXISTS "public"."application_property_groups_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."application_property_groups_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."application_property_groups_id_seq" OWNED BY "public"."application_property_groups"."id";



CREATE TABLE IF NOT EXISTS "public"."application_types" (
    "id" integer NOT NULL,
    "name" character varying(50) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "required_forms" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "allowed_roles" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submit_property_files" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."application_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."application_types" IS 'Property-based application types: single_property, multi_community, settlement_va, settlement_nc, public_offering. Pricing now handled via environment variables.';



CREATE SEQUENCE IF NOT EXISTS "public"."application_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."application_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."application_types_id_seq" OWNED BY "public"."application_types"."id";



CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "hoa_property_id" integer,
    "property_address" character varying(500) NOT NULL,
    "unit_number" character varying(50),
    "submitter_type" character varying(50),
    "submitter_name" character varying(255) NOT NULL,
    "submitter_email" character varying(255) NOT NULL,
    "submitter_phone" character varying(50),
    "realtor_license" character varying(100),
    "buyer_name" character varying(255),
    "buyer_email" character varying(255),
    "buyer_phone" character varying(50),
    "seller_name" character varying(255) NOT NULL,
    "seller_email" character varying(255),
    "seller_phone" character varying(50),
    "sale_price" numeric(12,2),
    "closing_date" "date",
    "package_type" character varying(20) DEFAULT 'standard'::character varying,
    "processing_fee" numeric(8,2) DEFAULT 317.95,
    "rush_fee" numeric(8,2) DEFAULT 70.66,
    "convenience_fee" numeric(8,2) DEFAULT 9.95,
    "total_amount" numeric(8,2),
    "payment_method" character varying(50),
    "status" character varying(50) DEFAULT 'draft'::character varying,
    "documents" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "submitted_at" timestamp without time zone,
    "payment_confirmed_at" timestamp without time zone,
    "expected_completion_date" "date",
    "completed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "property_owner_notified_at" timestamp without time zone,
    "property_owner_response_due" "date",
    "payment_status" character varying(50) DEFAULT 'pending'::character varying,
    "stripe_session_id" character varying(255),
    "stripe_payment_intent_id" character varying(255),
    "payment_completed_at" timestamp without time zone,
    "payment_failed_at" timestamp without time zone,
    "payment_canceled_at" timestamp without time zone,
    "payment_failure_reason" "text",
    "forms_updated_at" timestamp without time zone DEFAULT "now"(),
    "assigned_to" character varying,
    "inspection_form_completed_at" timestamp without time zone,
    "resale_certificate_completed_at" timestamp without time zone,
    "pdf_completed_at" timestamp without time zone,
    "email_completed_at" timestamp without time zone,
    "comments" "text",
    "pdf_expires_at" timestamp without time zone,
    "pdf_url" character varying,
    "pdf_generated_at" timestamp without time zone,
    "application_type" character varying(50) DEFAULT 'standard'::character varying NOT NULL,
    "parent_application_id" integer,
    "is_multi_child" boolean DEFAULT false,
    "settlement_form_completed_at" timestamp with time zone,
    "lender_questionnaire_file_path" character varying(500),
    "lender_questionnaire_deletion_date" timestamp with time zone,
    "lender_questionnaire_completed_file_path" character varying(500),
    "lender_questionnaire_completed_uploaded_at" timestamp with time zone,
    "lender_questionnaire_downloaded_at" timestamp with time zone,
    "lender_questionnaire_edited_file_path" character varying(500),
    "lender_questionnaire_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "include_property_documents" boolean DEFAULT false,
    "cancelled_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "created_by_admin_id" "uuid",
    "impersonation_session_id" "uuid",
    "is_test_transaction" boolean DEFAULT false,
    "impersonation_metadata" "jsonb",
    "processing_locked" boolean DEFAULT false,
    "processing_locked_at" timestamp with time zone,
    "processing_locked_reason" "text",
    "rush_upgraded_at" timestamp with time zone,
    "correction_stripe_session_id" character varying(255) DEFAULT NULL::character varying,
    "correction_metadata" "jsonb",
    CONSTRAINT "applications_package_type_check" CHECK ((("package_type")::"text" = ANY (ARRAY[('standard'::character varying)::"text", ('rush'::character varying)::"text"]))),
    CONSTRAINT "applications_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'canceled'::character varying, 'refunded'::character varying, 'not_required'::character varying])::"text"[]))),
    CONSTRAINT "applications_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text", ('pending_payment'::character varying)::"text", ('payment_confirmed'::character varying)::"text", ('under_review'::character varying)::"text", ('compliance_pending'::character varying)::"text", ('compliance_completed'::character varying)::"text", ('documents_generated'::character varying)::"text", ('approved'::character varying)::"text", ('completed'::character varying)::"text", ('rejected'::character varying)::"text", ('cancelled'::character varying)::"text", ('awaiting_property_owner_response'::character varying)::"text"])))
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


COMMENT ON TABLE "public"."applications" IS 'stripe_invoice_id column removed - using Stripe receipts instead of invoices';



COMMENT ON COLUMN "public"."applications"."submitter_type" IS 'Type of submitter - can be any string value (seller, realtor, builder, admin, settlement, etc.)';



COMMENT ON COLUMN "public"."applications"."buyer_name" IS 'Buyer name - optional field. Can be null for settlement applications or when buyer info is not available.';



COMMENT ON COLUMN "public"."applications"."buyer_email" IS 'Buyer email(s) - optional field. Can be null or empty for settlement applications or when buyer info is not available.';



COMMENT ON COLUMN "public"."applications"."payment_status" IS 'Tracks the current payment status: pending, completed, failed, canceled, refunded';



COMMENT ON COLUMN "public"."applications"."stripe_session_id" IS 'Stripe Checkout Session ID for tracking payments';



COMMENT ON COLUMN "public"."applications"."stripe_payment_intent_id" IS 'Stripe Payment Intent ID for tracking payments';



COMMENT ON COLUMN "public"."applications"."payment_completed_at" IS 'Timestamp when payment was successfully completed';



COMMENT ON COLUMN "public"."applications"."payment_failed_at" IS 'Timestamp when payment failed';



COMMENT ON COLUMN "public"."applications"."payment_canceled_at" IS 'Timestamp when payment was canceled';



COMMENT ON COLUMN "public"."applications"."payment_failure_reason" IS 'Reason for payment failure for debugging purposes';



COMMENT ON COLUMN "public"."applications"."assigned_to" IS 'Email of the staff member assigned to this application';



COMMENT ON COLUMN "public"."applications"."application_type" IS 'Property-based application type: single_property, multi_community, settlement_va, settlement_nc, public_offering';



COMMENT ON COLUMN "public"."applications"."parent_application_id" IS 'If set, this application is a child of the given parent application (multi-community).';



COMMENT ON COLUMN "public"."applications"."is_multi_child" IS 'Marks the application as a child within a multi-community submission.';



COMMENT ON COLUMN "public"."applications"."settlement_form_completed_at" IS 'Timestamp when settlement form task was completed';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_file_path" IS 'Path to original lender questionnaire form uploaded by user';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_deletion_date" IS 'Date when original lender form should be deleted (30 days after upload)';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_completed_file_path" IS 'Path to completed lender questionnaire form uploaded by staff';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_completed_uploaded_at" IS 'Timestamp when completed form was uploaded by staff';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_downloaded_at" IS 'Timestamp when admin downloaded the original lender questionnaire form (Task 1 completion)';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_edited_file_path" IS 'Path to edited lender questionnaire form from SimplePDF editor';



COMMENT ON COLUMN "public"."applications"."lender_questionnaire_edited_at" IS 'Timestamp when PDF was edited using SimplePDF editor';



COMMENT ON COLUMN "public"."applications"."deleted_at" IS 'Timestamp when the application was soft deleted. NULL means the application is active.';



COMMENT ON COLUMN "public"."applications"."include_property_documents" IS 'Flag indicating whether property documents should be included in the application package.';



COMMENT ON COLUMN "public"."applications"."cancelled_at" IS 'Timestamp when application was cancelled';



COMMENT ON COLUMN "public"."applications"."rejected_at" IS 'Timestamp when application was rejected';



COMMENT ON COLUMN "public"."applications"."created_by_admin_id" IS 'Admin user who created this application while impersonating (null for user-created applications)';



COMMENT ON COLUMN "public"."applications"."impersonation_session_id" IS 'Impersonation session ID if this application was created/modified during impersonation';



COMMENT ON COLUMN "public"."applications"."is_test_transaction" IS 'TRUE if this transaction was created during admin impersonation (always test mode)';



COMMENT ON COLUMN "public"."applications"."impersonation_metadata" IS 'Metadata about impersonation session (admin_id, timestamp, etc.)';



COMMENT ON COLUMN "public"."applications"."processing_locked" IS 'When true, staff cannot process tasks on this application. Set when a correction payment (property change or rush upgrade) is pending. Cleared by webhook on successful payment.';



COMMENT ON COLUMN "public"."applications"."processing_locked_at" IS 'Timestamp when processing_locked was set to true.';



COMMENT ON COLUMN "public"."applications"."processing_locked_reason" IS 'Human-readable reason for the lock, e.g. ''pending_property_correction_payment'' or ''pending_rush_upgrade_payment''.';



COMMENT ON COLUMN "public"."applications"."rush_upgraded_at" IS 'Timestamp when the application package was upgraded from standard to rush by an admin.';



COMMENT ON COLUMN "public"."applications"."correction_stripe_session_id" IS 'Stripe checkout session ID for a correction payment (additional property or rush upgrade). Separate from the original stripe_session_id. Used by the webhook to route correction payment events correctly.';



COMMENT ON CONSTRAINT "applications_payment_status_check" ON "public"."applications" IS 'Valid payment statuses. not_required = free transactions (e.g., VA standard settlements)';



CREATE SEQUENCE IF NOT EXISTS "public"."applications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."applications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."applications_id_seq" OWNED BY "public"."applications"."id";



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid",
    "acting_user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "at_least_one_user" CHECK ((("admin_user_id" IS NOT NULL) OR ("acting_user_id" IS NOT NULL))),
    CONSTRAINT "valid_action" CHECK ((("action" IS NOT NULL) AND ("length"("action") > 0))),
    CONSTRAINT "valid_resource_type" CHECK ((("resource_type" IS NOT NULL) AND ("length"("resource_type") > 0)))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'Comprehensive audit trail for all admin actions and user impersonation';



COMMENT ON COLUMN "public"."audit_logs"."admin_user_id" IS 'The actual admin user who performed the action (NULL for regular user actions)';



COMMENT ON COLUMN "public"."audit_logs"."acting_user_id" IS 'The user identity used for the action (different from admin_user_id during impersonation)';



COMMENT ON COLUMN "public"."audit_logs"."action" IS 'Action performed (e.g., impersonation_started, update_application, delete_application)';



COMMENT ON COLUMN "public"."audit_logs"."resource_type" IS 'Type of resource affected (e.g., user, application, payment)';



COMMENT ON COLUMN "public"."audit_logs"."resource_id" IS 'ID of the affected resource';



COMMENT ON COLUMN "public"."audit_logs"."metadata" IS 'Additional context about the action (field changes, request data, etc.)';



CREATE OR REPLACE VIEW "public"."current_user_context" AS
 SELECT "auth"."uid"() AS "current_user_id",
    "public"."get_impersonated_user_id"() AS "impersonated_user_id",
    COALESCE("public"."get_impersonated_user_id"(), "auth"."uid"()) AS "effective_user_id",
        CASE
            WHEN ("public"."get_impersonated_user_id"() IS NOT NULL) THEN true
            ELSE false
        END AS "is_impersonating";


ALTER VIEW "public"."current_user_context" OWNER TO "postgres";


COMMENT ON VIEW "public"."current_user_context" IS 'Provides context about current user and impersonation status';



CREATE TABLE IF NOT EXISTS "public"."email_verification_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "valid_attempts" CHECK (("attempts" >= 0)),
    CONSTRAINT "valid_expiry" CHECK (("expires_at" > "created_at"))
);


ALTER TABLE "public"."email_verification_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_verification_tokens" IS 'Stores hashed email verification tokens separately from user profiles for security';



COMMENT ON COLUMN "public"."email_verification_tokens"."token_hash" IS 'SHA-256 hash of the verification token';



COMMENT ON COLUMN "public"."email_verification_tokens"."used_at" IS 'Timestamp when token was successfully used (NULL = unused)';



COMMENT ON COLUMN "public"."email_verification_tokens"."attempts" IS 'Number of verification attempts (for rate limiting)';



CREATE TABLE IF NOT EXISTS "public"."form_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "creation_method" character varying(50) DEFAULT 'visual'::character varying,
    "ai_generated" boolean DEFAULT false,
    "ai_confidence_score" double precision,
    "form_structure" "jsonb" DEFAULT '{"sections": []}'::"jsonb" NOT NULL,
    "pdf_template_path" "text",
    "pdf_field_mappings" "jsonb" DEFAULT '{}'::"jsonb",
    "data_source_mappings" "jsonb" DEFAULT '{}'::"jsonb",
    "application_types" "jsonb" DEFAULT '[]'::"jsonb",
    "task_number" integer,
    "created_by" "uuid",
    "last_used_at" timestamp without time zone,
    "usage_count" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "form_templates_creation_method_check" CHECK ((("creation_method")::"text" = ANY ((ARRAY['visual'::character varying, 'ai_import'::character varying])::"text"[])))
);


ALTER TABLE "public"."form_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."form_templates" IS 'Stores form templates for unified form builder system (visual builder + AI import)';



COMMENT ON COLUMN "public"."form_templates"."creation_method" IS 'How form was created: visual (drag & drop) or ai_import (from PDF)';



COMMENT ON COLUMN "public"."form_templates"."form_structure" IS 'Complete form structure as JSON: sections, fields, layout, conditional logic';



COMMENT ON COLUMN "public"."form_templates"."pdf_field_mappings" IS 'Mappings from form field IDs to PDF field names';



COMMENT ON COLUMN "public"."form_templates"."data_source_mappings" IS 'Mappings from form fields to application data fields';



COMMENT ON COLUMN "public"."form_templates"."application_types" IS 'Array of application types this template is assigned to';



COMMENT ON COLUMN "public"."form_templates"."task_number" IS 'Task number in application workflow (1, 2, 3, etc.)';



CREATE TABLE IF NOT EXISTS "public"."hoa_properties" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "location" character varying(255),
    "management_contact" character varying(255),
    "phone" character varying(50),
    "email" character varying(255),
    "fee_schedule" "jsonb" DEFAULT '{}'::"jsonb",
    "special_requirements" "text",
    "documents_folder" character varying(255),
    "active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "property_owner_email" character varying(255),
    "property_owner_name" character varying(255),
    "property_owner_phone" character varying(50),
    "notification_preferences" "jsonb" DEFAULT '{"sms": false, "email": true}'::"jsonb",
    "is_multi_community" boolean DEFAULT false,
    "allow_public_offering" boolean DEFAULT false,
    "force_price_enabled" boolean DEFAULT false,
    "force_price_value" numeric(10,2) DEFAULT NULL::numeric,
    "deleted_at" timestamp with time zone,
    "document_order" "jsonb",
    "insurance_company_name" character varying(255),
    "insurance_agent_name" character varying(255),
    "insurance_agent_phone" character varying(50),
    "insurance_agent_email" character varying(255),
    "multi_community_comment" "text",
    "default_assignee_email" character varying(255),
    "settlement_assignee_email" "text",
    "allow_info_packet" boolean DEFAULT false NOT NULL,
    "info_packet_price" numeric(10,2) DEFAULT NULL::numeric,
    CONSTRAINT "force_price_value_when_enabled" CHECK ((("force_price_enabled" = false) OR (("force_price_enabled" = true) AND ("force_price_value" IS NOT NULL) AND ("force_price_value" >= (0)::numeric))))
);


ALTER TABLE "public"."hoa_properties" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hoa_properties"."is_multi_community" IS 'Flag indicating if this property has linked associations';



COMMENT ON COLUMN "public"."hoa_properties"."allow_public_offering" IS 'Controls whether this property can receive Public Offering Statement requests. When TRUE, the Public Offering Statement option will be available under Builder/Developer submitter type. Defaults to FALSE.';



COMMENT ON COLUMN "public"."hoa_properties"."force_price_enabled" IS 'Flag indicating if a forced price override is enabled for this property. When TRUE, force_price_value will be used instead of standard pricing during checkout. Only Admin and Accounting roles can modify this setting. Defaults to FALSE.';



COMMENT ON COLUMN "public"."hoa_properties"."force_price_value" IS 'Custom price value (in dollars) that overrides the standard property price when force_price_enabled is TRUE. This price is applied per property during checkout. Rush fees do not apply when force price is enabled. Must be >= 0 when force_price_enabled is TRUE.';



COMMENT ON COLUMN "public"."hoa_properties"."deleted_at" IS 'Timestamp when the property was soft deleted. NULL means the property is active.';



COMMENT ON COLUMN "public"."hoa_properties"."insurance_company_name" IS 'Name of the insurance company for the property';



COMMENT ON COLUMN "public"."hoa_properties"."insurance_agent_name" IS 'Name of the insurance agent';



COMMENT ON COLUMN "public"."hoa_properties"."insurance_agent_phone" IS 'Phone number of the insurance agent';



COMMENT ON COLUMN "public"."hoa_properties"."insurance_agent_email" IS 'Email address of the insurance agent';



COMMENT ON COLUMN "public"."hoa_properties"."multi_community_comment" IS 'Explanation of this property role when it is the primary property in a multi-community setup';



COMMENT ON COLUMN "public"."hoa_properties"."default_assignee_email" IS 'When multiple property_owner_email values exist, this email is used as the default assignee for new applications. All emails receive notifications.';



COMMENT ON COLUMN "public"."hoa_properties"."settlement_assignee_email" IS 'Default accounting user email assigned to settlement applications (settlement_va / settlement_nc) for this property';



CREATE SEQUENCE IF NOT EXISTS "public"."hoa_properties_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."hoa_properties_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."hoa_properties_id_seq" OWNED BY "public"."hoa_properties"."id";



CREATE TABLE IF NOT EXISTS "public"."property_owner_forms" (
    "id" integer NOT NULL,
    "application_id" integer,
    "hoa_property_id" integer,
    "recipient_email" character varying(255) NOT NULL,
    "recipient_name" character varying(255),
    "form_type" character varying(50) DEFAULT 'property_disclosure'::character varying,
    "form_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying(50) DEFAULT 'not_started'::character varying,
    "response_data" "jsonb" DEFAULT '{}'::"jsonb",
    "completed_at" timestamp without time zone,
    "expires_at" timestamp without time zone DEFAULT ("now"() + '7 days'::interval),
    "access_token" character varying(255) DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "pdf_url" "text",
    "property_group_id" integer,
    CONSTRAINT "property_owner_forms_form_type_check" CHECK ((("form_type")::"text" = ANY (ARRAY[('inspection_form'::character varying)::"text", ('resale_certificate'::character varying)::"text", ('settlement_form'::character varying)::"text"]))),
    CONSTRAINT "property_owner_forms_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('not_started'::character varying)::"text", ('in_progress'::character varying)::"text", ('completed'::character varying)::"text", ('expired'::character varying)::"text"])))
);


ALTER TABLE "public"."property_owner_forms" OWNER TO "postgres";


COMMENT ON COLUMN "public"."property_owner_forms"."pdf_url" IS 'URL to the generated PDF document for this form';



COMMENT ON COLUMN "public"."property_owner_forms"."property_group_id" IS 'Reference to application_property_groups for multi-community applications';



CREATE SEQUENCE IF NOT EXISTS "public"."property_owner_forms_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."property_owner_forms_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."property_owner_forms_id_seq" OWNED BY "public"."property_owner_forms"."id";



CREATE TABLE IF NOT EXISTS "public"."hoa_property_resale_templates" (
    "id" integer DEFAULT "nextval"('"public"."property_owner_forms_id_seq"'::"regclass") NOT NULL,
    "hoa_property_id" integer NOT NULL,
    "template_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."hoa_property_resale_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."linked_properties" (
    "id" integer NOT NULL,
    "primary_property_id" integer NOT NULL,
    "linked_property_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "relationship_comment" "text",
    CONSTRAINT "no_self_link" CHECK (("primary_property_id" <> "linked_property_id"))
);


ALTER TABLE "public"."linked_properties" OWNER TO "postgres";


COMMENT ON TABLE "public"."linked_properties" IS 'Stores relationships between properties for multi-community transactions';



COMMENT ON COLUMN "public"."linked_properties"."primary_property_id" IS 'The main property selected by the user';



COMMENT ON COLUMN "public"."linked_properties"."linked_property_id" IS 'Additional property that gets included automatically';



COMMENT ON COLUMN "public"."linked_properties"."relationship_comment" IS 'Explanation of why this property is linked (displayed to requestors to prevent ordering errors)';



CREATE SEQUENCE IF NOT EXISTS "public"."linked_properties_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."linked_properties_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."linked_properties_id_seq" OWNED BY "public"."linked_properties"."id";



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" integer NOT NULL,
    "application_id" integer,
    "recipient_email" character varying(255) NOT NULL,
    "recipient_name" character varying(255),
    "notification_type" character varying(50),
    "subject" character varying(500) NOT NULL,
    "message" "text" NOT NULL,
    "email_template" character varying(100),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "sent_at" timestamp without time zone,
    "delivered_at" timestamp without time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "recipient_user_id" "uuid",
    "is_read" boolean DEFAULT false,
    "read_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."deleted_at" IS 'Timestamp when the notification was soft deleted. NULL means the notification is active.';



CREATE SEQUENCE IF NOT EXISTS "public"."notifications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."notifications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."notifications_id_seq" OWNED BY "public"."notifications"."id";



CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."password_reset_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."password_reset_tokens" IS 'Stores password reset tokens with SHA-256 hashes. Tokens are never stored in plaintext.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'external'::character varying,
    "first_name" character varying(255),
    "last_name" character varying(255),
    "phone" character varying(50),
    "company" character varying(255),
    "license_number" character varying(100),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "email_confirmed_at" timestamp with time zone,
    CONSTRAINT "profiles_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying, 'requester'::character varying, NULL::character varying])::"text"[])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles table with custom email confirmation support. Users must confirm their email before full access.';



COMMENT ON COLUMN "public"."profiles"."role" IS 'User role: admin (full access), staff (limited admin access), accounting (settlement agent forms only), requester (regular user), or NULL (unassigned)';



COMMENT ON COLUMN "public"."profiles"."deleted_at" IS 'Timestamp when the profile was soft deleted. NULL means the profile is active.';



COMMENT ON COLUMN "public"."profiles"."email_confirmed_at" IS 'Timestamp when user confirmed their email address (NULL = unconfirmed)';



CREATE TABLE IF NOT EXISTS "public"."property_documents" (
    "id" integer NOT NULL,
    "property_id" integer NOT NULL,
    "document_key" character varying(100) NOT NULL,
    "document_name" character varying(255) NOT NULL,
    "file_path" "text",
    "is_not_applicable" boolean DEFAULT false,
    "expiration_date" "date",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "display_name" character varying(255),
    "file_name" character varying(255)
);


ALTER TABLE "public"."property_documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."property_documents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."property_documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."property_documents_id_seq" OWNED BY "public"."property_documents"."id";



CREATE TABLE IF NOT EXISTS "public"."property_owner_forms_list" (
    "id" integer NOT NULL,
    "form_type" character varying(50) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "user_roles" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."property_owner_forms_list" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."property_owner_forms_list_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."property_owner_forms_list_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."property_owner_forms_list_id_seq" OWNED BY "public"."property_owner_forms_list"."id";



ALTER TABLE ONLY "public"."application_property_groups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."application_property_groups_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."application_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."application_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."applications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."applications_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."hoa_properties" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."hoa_properties_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."linked_properties" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."linked_properties_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."notifications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notifications_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."property_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."property_documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."property_owner_forms" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."property_owner_forms_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."property_owner_forms_list" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."property_owner_forms_list_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."application_property_groups"
    ADD CONSTRAINT "application_property_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_types"
    ADD CONSTRAINT "application_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."application_types"
    ADD CONSTRAINT "application_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_verification_tokens"
    ADD CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_verification_tokens"
    ADD CONSTRAINT "email_verification_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hoa_properties"
    ADD CONSTRAINT "hoa_properties_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."hoa_properties"
    ADD CONSTRAINT "hoa_properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hoa_property_resale_templates"
    ADD CONSTRAINT "hoa_property_resale_templates_hoa_property_id_unique" UNIQUE ("hoa_property_id");



ALTER TABLE ONLY "public"."hoa_property_resale_templates"
    ADD CONSTRAINT "hoa_property_resale_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."linked_properties"
    ADD CONSTRAINT "linked_properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_documents"
    ADD CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_owner_forms"
    ADD CONSTRAINT "property_owner_forms_access_token_key" UNIQUE ("access_token");



ALTER TABLE ONLY "public"."property_owner_forms_list"
    ADD CONSTRAINT "property_owner_forms_list_form_type_key" UNIQUE ("form_type");



ALTER TABLE ONLY "public"."property_owner_forms_list"
    ADD CONSTRAINT "property_owner_forms_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_owner_forms"
    ADD CONSTRAINT "property_owner_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_property_groups"
    ADD CONSTRAINT "unique_application_property" UNIQUE ("application_id", "property_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "unique_notification_per_recipient" UNIQUE ("application_id", "recipient_email", "notification_type");



ALTER TABLE ONLY "public"."linked_properties"
    ADD CONSTRAINT "unique_property_link" UNIQUE ("primary_property_id", "linked_property_id");



CREATE INDEX "idx_application_property_groups_application_id" ON "public"."application_property_groups" USING "btree" ("application_id");



CREATE INDEX "idx_application_property_groups_email_status" ON "public"."application_property_groups" USING "btree" ("email_status");



CREATE INDEX "idx_application_property_groups_inspection_status" ON "public"."application_property_groups" USING "btree" ("inspection_status");



CREATE INDEX "idx_application_property_groups_pdf_status" ON "public"."application_property_groups" USING "btree" ("pdf_status");



CREATE INDEX "idx_application_property_groups_property_id" ON "public"."application_property_groups" USING "btree" ("property_id");



CREATE INDEX "idx_application_property_groups_status" ON "public"."application_property_groups" USING "btree" ("status");



CREATE INDEX "idx_application_types_name" ON "public"."application_types" USING "btree" ("name");



CREATE INDEX "idx_applications_application_type" ON "public"."applications" USING "btree" ("application_type");



CREATE INDEX "idx_applications_assigned_to" ON "public"."applications" USING "btree" ("assigned_to");



CREATE INDEX "idx_applications_cancelled_at" ON "public"."applications" USING "btree" ("cancelled_at") WHERE ("cancelled_at" IS NOT NULL);



CREATE INDEX "idx_applications_correction_stripe_session_id" ON "public"."applications" USING "btree" ("correction_stripe_session_id") WHERE ("correction_stripe_session_id" IS NOT NULL);



CREATE INDEX "idx_applications_created_by_admin" ON "public"."applications" USING "btree" ("created_by_admin_id") WHERE ("created_by_admin_id" IS NOT NULL);



CREATE INDEX "idx_applications_deleted_at" ON "public"."applications" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_applications_forms_updated_at" ON "public"."applications" USING "btree" ("forms_updated_at");



CREATE INDEX "idx_applications_impersonation_session" ON "public"."applications" USING "btree" ("impersonation_session_id") WHERE ("impersonation_session_id" IS NOT NULL);



CREATE INDEX "idx_applications_is_test_transaction" ON "public"."applications" USING "btree" ("is_test_transaction") WHERE ("is_test_transaction" = true);



CREATE INDEX "idx_applications_lender_questionnaire_deletion" ON "public"."applications" USING "btree" ("lender_questionnaire_deletion_date") WHERE ("lender_questionnaire_deletion_date" IS NOT NULL);



CREATE INDEX "idx_applications_parent_application_id" ON "public"."applications" USING "btree" ("parent_application_id");



CREATE INDEX "idx_applications_payment_status" ON "public"."applications" USING "btree" ("payment_status");



CREATE INDEX "idx_applications_pdf_expires_at" ON "public"."applications" USING "btree" ("pdf_expires_at");



CREATE INDEX "idx_applications_rejected_at" ON "public"."applications" USING "btree" ("rejected_at") WHERE ("rejected_at" IS NOT NULL);



CREATE INDEX "idx_applications_settlement_form_completed_at" ON "public"."applications" USING "btree" ("settlement_form_completed_at");



CREATE INDEX "idx_applications_stripe_payment_intent_id" ON "public"."applications" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_applications_stripe_session_id" ON "public"."applications" USING "btree" ("stripe_session_id");



CREATE INDEX "idx_applications_task_completion" ON "public"."applications" USING "btree" ("inspection_form_completed_at", "resale_certificate_completed_at", "pdf_completed_at", "email_completed_at");



CREATE INDEX "idx_audit_logs_acting_created" ON "public"."audit_logs" USING "btree" ("acting_user_id", "created_at" DESC) WHERE ("acting_user_id" IS NOT NULL);



CREATE INDEX "idx_audit_logs_admin_created" ON "public"."audit_logs" USING "btree" ("admin_user_id", "created_at" DESC) WHERE ("admin_user_id" IS NOT NULL);



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_email_verification_tokens_expires" ON "public"."email_verification_tokens" USING "btree" ("expires_at") WHERE ("used_at" IS NULL);



CREATE INDEX "idx_email_verification_tokens_hash" ON "public"."email_verification_tokens" USING "btree" ("token_hash");



CREATE INDEX "idx_email_verification_tokens_user_unused" ON "public"."email_verification_tokens" USING "btree" ("user_id") WHERE ("used_at" IS NULL);



CREATE INDEX "idx_form_templates_application_types" ON "public"."form_templates" USING "gin" ("application_types");



CREATE INDEX "idx_form_templates_created_at" ON "public"."form_templates" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_form_templates_created_by" ON "public"."form_templates" USING "btree" ("created_by");



CREATE INDEX "idx_form_templates_is_active" ON "public"."form_templates" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_form_templates_task_number" ON "public"."form_templates" USING "btree" ("task_number") WHERE ("task_number" IS NOT NULL);



CREATE INDEX "idx_hoa_properties_allow_public_offering" ON "public"."hoa_properties" USING "btree" ("allow_public_offering");



CREATE INDEX "idx_hoa_properties_deleted_at" ON "public"."hoa_properties" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_hoa_properties_document_order" ON "public"."hoa_properties" USING "btree" ("document_order") WHERE ("document_order" IS NOT NULL);



CREATE INDEX "idx_hoa_properties_force_price" ON "public"."hoa_properties" USING "btree" ("force_price_enabled") WHERE ("force_price_enabled" = true);



CREATE INDEX "idx_hoa_properties_multi_community" ON "public"."hoa_properties" USING "btree" ("is_multi_community");



CREATE INDEX "idx_linked_properties_linked" ON "public"."linked_properties" USING "btree" ("linked_property_id");



CREATE INDEX "idx_linked_properties_primary" ON "public"."linked_properties" USING "btree" ("primary_property_id");



CREATE INDEX "idx_notifications_application_id" ON "public"."notifications" USING "btree" ("application_id");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_deleted_at" ON "public"."notifications" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_notifications_notification_type" ON "public"."notifications" USING "btree" ("notification_type");



CREATE INDEX "idx_notifications_recipient_email" ON "public"."notifications" USING "btree" ("recipient_email");



CREATE INDEX "idx_notifications_recipient_user_id" ON "public"."notifications" USING "btree" ("recipient_user_id");



CREATE INDEX "idx_password_reset_tokens_expires_at" ON "public"."password_reset_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_password_reset_tokens_token_hash" ON "public"."password_reset_tokens" USING "btree" ("token_hash");



CREATE INDEX "idx_password_reset_tokens_user_id" ON "public"."password_reset_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_deleted_at" ON "public"."profiles" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_property_documents_expiration" ON "public"."property_documents" USING "btree" ("expiration_date") WHERE ("expiration_date" IS NOT NULL);



CREATE INDEX "idx_property_documents_property_id" ON "public"."property_documents" USING "btree" ("property_id");



CREATE INDEX "idx_property_documents_property_key" ON "public"."property_documents" USING "btree" ("property_id", "document_key");



CREATE INDEX "idx_property_owner_forms_form_type" ON "public"."property_owner_forms_list" USING "btree" ("form_type");



CREATE INDEX "idx_property_owner_forms_property_group_id" ON "public"."property_owner_forms" USING "btree" ("property_group_id");



CREATE OR REPLACE TRIGGER "auto_update_multi_community_delete" AFTER DELETE ON "public"."linked_properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_is_multi_community"();



CREATE OR REPLACE TRIGGER "auto_update_multi_community_insert" AFTER INSERT ON "public"."linked_properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_is_multi_community"();



CREATE OR REPLACE TRIGGER "auto_update_multi_community_update" AFTER UPDATE ON "public"."linked_properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_is_multi_community"();



CREATE OR REPLACE TRIGGER "form_templates_updated_at_trigger" BEFORE UPDATE ON "public"."form_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_form_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_notify_property_owner" AFTER UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."notify_property_owner_on_submit"();



CREATE OR REPLACE TRIGGER "update_application_property_groups_updated_at" BEFORE UPDATE ON "public"."application_property_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_application_types_updated_at" BEFORE UPDATE ON "public"."application_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_applications_updated_at" BEFORE UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hoa_properties_updated_at" BEFORE UPDATE ON "public"."hoa_properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_linked_properties_updated_at" BEFORE UPDATE ON "public"."linked_properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_property_documents_updated_at" BEFORE UPDATE ON "public"."property_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_property_owner_forms_updated_at" BEFORE UPDATE ON "public"."property_owner_forms_list" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."application_property_groups"
    ADD CONSTRAINT "application_property_groups_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_property_groups"
    ADD CONSTRAINT "application_property_groups_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."hoa_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_hoa_property_id_fkey" FOREIGN KEY ("hoa_property_id") REFERENCES "public"."hoa_properties"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_parent_application_id_fkey" FOREIGN KEY ("parent_application_id") REFERENCES "public"."applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_acting_user_id_fkey" FOREIGN KEY ("acting_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_verification_tokens"
    ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hoa_property_resale_templates"
    ADD CONSTRAINT "hoa_property_resale_templates_hoa_property_id_fkey" FOREIGN KEY ("hoa_property_id") REFERENCES "public"."hoa_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."linked_properties"
    ADD CONSTRAINT "linked_properties_linked_property_id_fkey" FOREIGN KEY ("linked_property_id") REFERENCES "public"."hoa_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."linked_properties"
    ADD CONSTRAINT "linked_properties_primary_property_id_fkey" FOREIGN KEY ("primary_property_id") REFERENCES "public"."hoa_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."property_documents"
    ADD CONSTRAINT "property_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."hoa_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_owner_forms"
    ADD CONSTRAINT "property_owner_forms_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id");



ALTER TABLE ONLY "public"."property_owner_forms"
    ADD CONSTRAINT "property_owner_forms_hoa_property_id_fkey" FOREIGN KEY ("hoa_property_id") REFERENCES "public"."hoa_properties"("id");



ALTER TABLE ONLY "public"."property_owner_forms"
    ADD CONSTRAINT "property_owner_forms_property_group_id_fkey" FOREIGN KEY ("property_group_id") REFERENCES "public"."application_property_groups"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and staff can delete properties" ON "public"."hoa_properties" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



COMMENT ON POLICY "Admin and staff can delete properties" ON "public"."hoa_properties" IS 'Allows users with admin or staff role to delete properties from hoa_properties table';



CREATE POLICY "Admin and staff can insert properties" ON "public"."hoa_properties" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



COMMENT ON POLICY "Admin and staff can insert properties" ON "public"."hoa_properties" IS 'Allows users with admin or staff role to insert new properties into hoa_properties table';



CREATE POLICY "Admin and staff can select properties" ON "public"."hoa_properties" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[]))))));



COMMENT ON POLICY "Admin and staff can select properties" ON "public"."hoa_properties" IS 'Allows users with admin, staff, or accounting role to read properties from hoa_properties table';



CREATE POLICY "Admin and staff can update properties" ON "public"."hoa_properties" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



COMMENT ON POLICY "Admin and staff can update properties" ON "public"."hoa_properties" IS 'Allows users with admin or staff role to update existing properties in hoa_properties table';



CREATE POLICY "Admin can delete all form templates" ON "public"."form_templates" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



CREATE POLICY "Admin can insert form templates" ON "public"."form_templates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



CREATE POLICY "Admin can manage HOA properties" ON "public"."hoa_properties" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update all form templates" ON "public"."form_templates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



CREATE POLICY "Admin can view all form templates" ON "public"."form_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::"text"[]))))));



CREATE POLICY "Admins can manage HOA properties" ON "public"."hoa_properties" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can view all audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins, staff, and accounting can manage all applications" ON "public"."applications" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[]))))));



CREATE POLICY "Allow all operations for application_property_groups" ON "public"."application_property_groups" USING (true);



CREATE POLICY "Allow all operations for linked_properties" ON "public"."linked_properties" USING (true);



CREATE POLICY "Allow authenticated users to create notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to view notifications" ON "public"."notifications" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow delete access to application property groups" ON "public"."application_property_groups" FOR DELETE USING (true);



CREATE POLICY "Allow insert access to application property groups" ON "public"."application_property_groups" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view active HOA properties" ON "public"."hoa_properties" FOR SELECT USING (("active" = true));



CREATE POLICY "Authenticated users can manage resale templates" ON "public"."hoa_property_resale_templates" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Public read access to HOA properties" ON "public"."hoa_properties" FOR SELECT USING (true);



CREATE POLICY "Service role can insert audit logs" ON "public"."audit_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage password reset tokens" ON "public"."password_reset_tokens" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Tokens are server-side only" ON "public"."email_verification_tokens" USING (false);



CREATE POLICY "Users can create applications" ON "public"."applications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create property owner forms" ON "public"."property_owner_forms" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can delete their own form templates" ON "public"."form_templates" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own unpaid applications" ON "public"."applications" FOR DELETE USING ((("auth"."uid"() = "user_id") AND (("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('pending_payment'::character varying)::"text"]))));



CREATE POLICY "Users can delete their property owner forms" ON "public"."property_owner_forms" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "property_owner_forms"."application_id") AND ("applications"."user_id" = "auth"."uid"()) AND (("applications"."status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('pending_payment'::character varying)::"text"]))))));



CREATE POLICY "Users can insert application property groups for their applicat" ON "public"."application_property_groups" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "application_property_groups"."application_id") AND (("applications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[]))))))))));



CREATE POLICY "Users can insert their own form templates" ON "public"."form_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can read their own notifications" ON "public"."notifications" FOR SELECT USING ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_email")::"text" IN ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own application property groups" ON "public"."application_property_groups" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "application_property_groups"."application_id") AND (("applications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[]))))))))));



CREATE POLICY "Users can update their own applications" ON "public"."applications" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[])))))));



CREATE POLICY "Users can update their own form templates" ON "public"."form_templates" FOR UPDATE USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_email")::"text" IN ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))))) WITH CHECK ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_email")::"text" IN ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Users can view own profile changes" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own application property groups" ON "public"."application_property_groups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "application_property_groups"."application_id") AND (("applications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[]))))))))));



CREATE POLICY "Users can view their own applications" ON "public"."applications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::"text"[])))))));



CREATE POLICY "Users can view their own form templates" ON "public"."form_templates" FOR SELECT USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can view their property owner forms" ON "public"."property_owner_forms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "property_owner_forms"."application_id") AND (("applications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))))))));



CREATE POLICY "admin_staff_can_read_all_profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'staff'::"text", 'accounting'::"text"])));



ALTER TABLE "public"."application_property_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_verification_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."form_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hoa_properties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hoa_property_resale_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."linked_properties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_owner_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_forms_access" ON "public"."property_owner_forms" USING (true);



CREATE POLICY "public_notifications" ON "public"."notifications" FOR SELECT USING (true);



CREATE POLICY "service_role_can_manage_all_profiles" ON "public"."profiles" TO "service_role" USING (true);



CREATE POLICY "users_can_read_own_profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users_can_update_own_profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "users_own_applications" ON "public"."applications" TO "authenticated" USING (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."application_property_groups";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."applications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."cleanup_old_ai_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_ai_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_ai_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_expiring_documents"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_expiring_documents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expiring_documents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_impersonated_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_impersonated_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_impersonated_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_linked_properties"("property_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_linked_properties"("property_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_linked_properties"("property_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_properties_linking_to"("property_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_properties_linking_to"("property_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_properties_linking_to"("property_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_linked_properties"("property_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."has_linked_properties"("property_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_linked_properties"("property_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_impersonating_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_admin_user_id" "uuid", "p_acting_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_impersonation_session_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_impersonation_session_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_impersonation_session_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_property_owner_on_submit"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_property_owner_on_submit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_property_owner_on_submit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_all_multi_community_flags"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_all_multi_community_flags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_all_multi_community_flags"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_cleanup_old_ai_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_old_ai_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_old_ai_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_form_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_form_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_form_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_impersonation_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_impersonation_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_impersonation_sessions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_is_multi_community"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_is_multi_community"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_is_multi_community"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_is_multi_community_for_property"("prop_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_is_multi_community_for_property"("prop_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_is_multi_community_for_property"("prop_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_no_circular_reference"("primary_id" integer, "linked_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_no_circular_reference"("primary_id" integer, "linked_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_no_circular_reference"("primary_id" integer, "linked_id" integer) TO "service_role";


















GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_property_groups" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_property_groups" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_property_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."application_property_groups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."application_property_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."application_property_groups_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_types" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_types" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."application_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."application_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."application_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."application_types_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."applications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."applications" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."applications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."applications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."applications_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."current_user_context" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."current_user_context" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."current_user_context" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."email_verification_tokens" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."email_verification_tokens" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."email_verification_tokens" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."form_templates" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."form_templates" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."form_templates" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_properties" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_properties" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_properties" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hoa_properties_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hoa_properties_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hoa_properties_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."property_owner_forms_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."property_owner_forms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."property_owner_forms_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_property_resale_templates" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_property_resale_templates" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."hoa_property_resale_templates" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."linked_properties" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."linked_properties" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."linked_properties" TO "service_role";



GRANT ALL ON SEQUENCE "public"."linked_properties_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."linked_properties_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."linked_properties_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."password_reset_tokens" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."password_reset_tokens" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."password_reset_tokens" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_documents" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_documents" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."property_documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."property_documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."property_documents_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms_list" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms_list" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."property_owner_forms_list" TO "service_role";



GRANT ALL ON SEQUENCE "public"."property_owner_forms_list_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."property_owner_forms_list_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."property_owner_forms_list_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "service_role";































drop policy "Users can insert application property groups for their applicat" on "public"."application_property_groups";

drop policy "Users can update their own application property groups" on "public"."application_property_groups";

drop policy "Users can view their own application property groups" on "public"."application_property_groups";

drop policy "Admins, staff, and accounting can manage all applications" on "public"."applications";

drop policy "Users can update their own applications" on "public"."applications";

drop policy "Users can view their own applications" on "public"."applications";

drop policy "Admin can delete all form templates" on "public"."form_templates";

drop policy "Admin can insert form templates" on "public"."form_templates";

drop policy "Admin can update all form templates" on "public"."form_templates";

drop policy "Admin can view all form templates" on "public"."form_templates";

drop policy "Admin and staff can delete properties" on "public"."hoa_properties";

drop policy "Admin and staff can insert properties" on "public"."hoa_properties";

drop policy "Admin and staff can select properties" on "public"."hoa_properties";

drop policy "Admin and staff can update properties" on "public"."hoa_properties";

alter table "public"."applications" drop constraint "applications_payment_status_check";

alter table "public"."form_templates" drop constraint "form_templates_creation_method_check";

alter table "public"."profiles" drop constraint "profiles_role_check";

alter table "public"."applications" add constraint "applications_payment_status_check" CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'canceled'::character varying, 'refunded'::character varying, 'not_required'::character varying])::text[]))) not valid;

alter table "public"."applications" validate constraint "applications_payment_status_check";

alter table "public"."form_templates" add constraint "form_templates_creation_method_check" CHECK (((creation_method)::text = ANY ((ARRAY['visual'::character varying, 'ai_import'::character varying])::text[]))) not valid;

alter table "public"."form_templates" validate constraint "form_templates_creation_method_check";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying, 'requester'::character varying, NULL::character varying])::text[]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";


  create policy "Users can insert application property groups for their applicat"
  on "public"."application_property_groups"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.applications
  WHERE ((applications.id = application_property_groups.application_id) AND ((applications.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[]))))))))));



  create policy "Users can update their own application property groups"
  on "public"."application_property_groups"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.applications
  WHERE ((applications.id = application_property_groups.application_id) AND ((applications.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[]))))))))));



  create policy "Users can view their own application property groups"
  on "public"."application_property_groups"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.applications
  WHERE ((applications.id = application_property_groups.application_id) AND ((applications.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[]))))))))));



  create policy "Admins, staff, and accounting can manage all applications"
  on "public"."applications"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[]))))));



  create policy "Users can update their own applications"
  on "public"."applications"
  as permissive
  for update
  to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[])))))));



  create policy "Users can view their own applications"
  on "public"."applications"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying, 'accounting'::character varying])::text[])))))));



  create policy "Admin can delete all form templates"
  on "public"."form_templates"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin can insert form templates"
  on "public"."form_templates"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin can update all form templates"
  on "public"."form_templates"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



  create policy "Admin can view all form templates"
  on "public"."form_templates"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'staff'::character varying])::text[]))))));



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




