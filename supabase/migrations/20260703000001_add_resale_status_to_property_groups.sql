-- Add dedicated resale-certificate completion columns to application_property_groups.
--
-- Background: the resale-certificate step for multi-community groups was inferred from
-- `status` (the doc-generation processing flag: pending/completed/failed). Post-payment
-- doc generation sets status='completed', which the UI mis-read as "resale certificate
-- completed", so the step showed Completed with no staff action.
--
-- Fix: give resale its own columns, mirroring the existing inspection_status /
-- inspection_completed_at pattern. `status` reverts to meaning ONLY doc-gen processing.

ALTER TABLE "public"."application_property_groups"
  ADD COLUMN IF NOT EXISTS "resale_status" character varying(20) NOT NULL DEFAULT 'not_started'::character varying,
  ADD COLUMN IF NOT EXISTS "resale_completed_at" timestamp with time zone;

-- Mirror the inspection/email/pdf CHECK constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_resale_status'
  ) THEN
    ALTER TABLE "public"."application_property_groups"
      ADD CONSTRAINT "check_resale_status"
      CHECK ((("resale_status")::"text" = ANY (ARRAY[
        ('not_started'::character varying)::"text",
        ('in_progress'::character varying)::"text",
        ('completed'::character varying)::"text",
        ('failed'::character varying)::"text"
      ])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_application_property_groups_resale_status"
  ON "public"."application_property_groups" USING btree ("resale_status");

COMMENT ON COLUMN "public"."application_property_groups"."resale_status" IS 'Resale certificate completion status (staff-driven): not_started, in_progress, completed, failed. Distinct from `status`, which is the doc-generation processing flag.';
COMMENT ON COLUMN "public"."application_property_groups"."resale_completed_at" IS 'Timestamp when the resale certificate was marked complete for this property group';

-- Backfill 1:1 from existing `status` so no existing application's display changes.
-- (A broader evidence-based cleanup of historical false-completes is intentionally NOT
-- done here.)
UPDATE "public"."application_property_groups"
SET
  "resale_status" = CASE "status"
    WHEN 'completed' THEN 'completed'
    WHEN 'in_progress' THEN 'in_progress'
    ELSE 'not_started'
  END,
  "resale_completed_at" = CASE WHEN "status" = 'completed' THEN "updated_at" ELSE NULL END;
