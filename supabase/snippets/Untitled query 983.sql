-- Move info packet domain eligibility from a global table to per-property
DROP TABLE IF EXISTS info_packet_allowed_domains;

ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS info_packet_allowed_domains TEXT[] NOT NULL DEFAULT '{}';
