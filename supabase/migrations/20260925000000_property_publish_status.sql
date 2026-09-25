-- Property Publish / Draft (ClickUp 14ypaj0dg6g)
--
-- A property in 'draft' is being set up (documents, users, settings) and is not yet
-- orderable by requesters. Only admins may publish it or move it back to draft.
-- While a property is in draft, document-delivery emails for its existing applications
-- are paused (enforced in the API layer, see lib/propertyStatus.js).

-- 1. Columns. Existing rows backfill to 'published' so nothing changes for live properties;
--    the default then flips to 'draft' so newly created properties start unpublished.
ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published'));

ALTER TABLE hoa_properties
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID;

UPDATE hoa_properties
  SET published_at = created_at
  WHERE status = 'published' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hoa_properties_status ON hoa_properties (status);

-- 2. Admin-only status changes. RLS lets staff update any column, so the column-level
--    rule is enforced by a trigger. Service-role writes (the admin API route) pass through.
CREATE OR REPLACE FUNCTION public.enforce_property_status_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF COALESCE(caller_role, '') = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only admins can publish a property or move it to draft'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_property_status_admin_only ON hoa_properties;
CREATE TRIGGER enforce_property_status_admin_only
  BEFORE INSERT OR UPDATE ON hoa_properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_status_admin_only();

-- 3. Requester-orderable properties: live, published, and (for multi-community primaries)
--    no linked property still in draft.
CREATE OR REPLACE FUNCTION public.get_orderable_hoa_properties()
RETURNS SETOF hoa_properties
LANGUAGE sql
STABLE
AS $$
  SELECT hp.*
  FROM hoa_properties hp
  WHERE hp.deleted_at IS NULL
    AND hp.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM linked_properties lp
      JOIN hoa_properties linked ON linked.id = lp.linked_property_id
      WHERE lp.primary_property_id = hp.id
        AND linked.status = 'draft'
    )
  ORDER BY hp.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_orderable_hoa_properties() TO anon, authenticated;

-- 4. Realtime: publish/draft changes must reach open requester and admin sessions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hoa_properties'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hoa_properties;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'linked_properties'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.linked_properties;
  END IF;
END $$;
