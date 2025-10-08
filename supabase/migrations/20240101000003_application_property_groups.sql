-- Application Property Groups Migration
-- Creates application_property_groups table for multi-community applications

-- Create the application_property_groups table
CREATE TABLE IF NOT EXISTS application_property_groups (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES hoa_properties(id) ON DELETE CASCADE,
  property_name VARCHAR(255) NOT NULL,
  property_location VARCHAR(255),
  property_owner_email VARCHAR(255),
  is_primary BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, email_sent
  generated_docs JSONB DEFAULT '[]'::jsonb, -- Store generated document URLs/IDs
  email_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_application_property_groups_application_id 
  ON application_property_groups(application_id);
CREATE INDEX IF NOT EXISTS idx_application_property_groups_property_id 
  ON application_property_groups(property_id);
CREATE INDEX IF NOT EXISTS idx_application_property_groups_status 
  ON application_property_groups(status);

-- Add unique constraint to prevent duplicate property groups per application
ALTER TABLE application_property_groups 
ADD CONSTRAINT unique_application_property 
UNIQUE (application_id, property_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_application_property_groups_updated_at 
  BEFORE UPDATE ON application_property_groups 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE application_property_groups ENABLE ROW LEVEL SECURITY;

-- Policy for reading application property groups
CREATE POLICY "Allow read access to application property groups" ON application_property_groups
  FOR SELECT USING (true);

-- Policy for inserting application property groups
CREATE POLICY "Allow insert access to application property groups" ON application_property_groups
  FOR INSERT WITH CHECK (true);

-- Policy for updating application property groups
CREATE POLICY "Allow update access to application property groups" ON application_property_groups
  FOR UPDATE USING (true);

-- Policy for deleting application property groups
CREATE POLICY "Allow delete access to application property groups" ON application_property_groups
  FOR DELETE USING (true);

-- Add comment to the table
COMMENT ON TABLE application_property_groups IS 'Stores individual property groups within multi-community applications, allowing separate processing and email sending for each property';