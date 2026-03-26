-- Add Info Packet (Welcome Package) feature to hoa_properties
-- allow_info_packet: enables the Info Packet purchase option for builder submitters
-- info_packet_price: per-property custom price (NULL = use system default $200)

ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS allow_info_packet BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS info_packet_price NUMERIC(10, 2) DEFAULT NULL;

COMMENT ON COLUMN hoa_properties.allow_info_packet IS 'When true, builder submitters can purchase an Info Packet (Welcome Package) for this property';
COMMENT ON COLUMN hoa_properties.info_packet_price IS 'Custom Info Packet price in dollars per association. NULL = use system default ($200)';
