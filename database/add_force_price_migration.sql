-- Add force_price_enabled and force_price_value columns to hoa_properties table
-- This allows Admin and Accounting users to override the standard property price
-- for specific properties by enabling a toggle and setting a custom price value.
-- When force_price_enabled is TRUE, the force_price_value will override standard pricing during checkout.

-- Add force_price_enabled flag to hoa_properties table
ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS force_price_enabled BOOLEAN DEFAULT FALSE;

-- Add force_price_value column to hoa_properties table
ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS force_price_value DECIMAL(10,2) DEFAULT NULL;

-- Create index for better performance when filtering properties with forced prices
CREATE INDEX IF NOT EXISTS idx_hoa_properties_force_price 
ON hoa_properties(force_price_enabled) 
WHERE force_price_enabled = TRUE;

-- Add check constraint to ensure value exists when enabled
ALTER TABLE hoa_properties
DROP CONSTRAINT IF EXISTS force_price_value_when_enabled;

ALTER TABLE hoa_properties
ADD CONSTRAINT force_price_value_when_enabled 
CHECK (
  (force_price_enabled = FALSE) OR 
  (force_price_enabled = TRUE AND force_price_value IS NOT NULL AND force_price_value >= 0)
);

-- Add comments to document the columns
COMMENT ON COLUMN hoa_properties.force_price_enabled IS 
'Flag indicating if a forced price override is enabled for this property. When TRUE, force_price_value will be used instead of standard pricing during checkout. Only Admin and Accounting roles can modify this setting. Defaults to FALSE.';

COMMENT ON COLUMN hoa_properties.force_price_value IS 
'Custom price value (in dollars) that overrides the standard property price when force_price_enabled is TRUE. This price is applied per property during checkout. Rush fees do not apply when force price is enabled. Must be >= 0 when force_price_enabled is TRUE.';

