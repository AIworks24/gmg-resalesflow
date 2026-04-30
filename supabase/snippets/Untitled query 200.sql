-- Table for whitelisting email domains eligible to see the info packet option
CREATE TABLE IF NOT EXISTS info_packet_allowed_domains (
  domain TEXT PRIMARY KEY CHECK (domain = lower(domain) AND domain NOT LIKE '@%'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE info_packet_allowed_domains ENABLE ROW LEVEL SECURITY;

-- Authenticated requesters can read to check their own eligibility
CREATE POLICY "Authenticated users can read allowed domains"
  ON info_packet_allowed_domains FOR SELECT
  TO authenticated
  USING (true);

-- Admin and staff can insert/update/delete domains
CREATE POLICY "Admins and staff can manage allowed domains"
  ON info_packet_allowed_domains FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );
