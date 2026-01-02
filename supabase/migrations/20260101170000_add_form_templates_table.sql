-- Migration: Add form_templates table for unified form builder system
-- Rollback: DROP TABLE IF EXISTS form_templates CASCADE;

-- Create form_templates table
CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Form creation method
  creation_method VARCHAR(50) DEFAULT 'visual' CHECK (creation_method IN ('visual', 'ai_import')),
  ai_generated BOOLEAN DEFAULT false,
  ai_confidence_score FLOAT, -- For AI-imported forms (0.0 to 1.0)
  
  -- Form structure (JSON)
  form_structure JSONB NOT NULL DEFAULT '{"sections": []}'::jsonb,
  
  -- PDF configuration
  pdf_template_path TEXT, -- Path to PDF template in Supabase storage
  pdf_field_mappings JSONB DEFAULT '{}'::jsonb, -- Map form fields → PDF fields
  
  -- Data source mapping
  data_source_mappings JSONB DEFAULT '{}'::jsonb, -- Map form fields → application data fields
  
  -- Assignment to application types and tasks
  application_types JSONB DEFAULT '[]'::jsonb, -- ['settlement_va', 'settlement_nc', etc.]
  task_number INTEGER, -- Which task in workflow (1, 2, 3, etc.)
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_templates_created_by ON form_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_form_templates_application_types ON form_templates USING GIN(application_types);
CREATE INDEX IF NOT EXISTS idx_form_templates_is_active ON form_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_form_templates_created_at ON form_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_templates_task_number ON form_templates(task_number) WHERE task_number IS NOT NULL;

-- Add Row Level Security
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own templates
CREATE POLICY "Users can view their own form templates" 
  ON form_templates FOR SELECT 
  USING (auth.uid() = created_by);

-- RLS Policy: Users can insert their own templates
CREATE POLICY "Users can insert their own form templates" 
  ON form_templates FOR INSERT 
  WITH CHECK (auth.uid() = created_by);

-- RLS Policy: Users can update their own templates
CREATE POLICY "Users can update their own form templates" 
  ON form_templates FOR UPDATE 
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policy: Users can delete their own templates
CREATE POLICY "Users can delete their own form templates" 
  ON form_templates FOR DELETE 
  USING (auth.uid() = created_by);

-- RLS Policy: Admin/staff can view all templates
CREATE POLICY "Admin can view all form templates" 
  ON form_templates FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- RLS Policy: Admin/staff can insert templates
CREATE POLICY "Admin can insert form templates" 
  ON form_templates FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- RLS Policy: Admin/staff can update all templates
CREATE POLICY "Admin can update all form templates" 
  ON form_templates FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- RLS Policy: Admin/staff can delete all templates
CREATE POLICY "Admin can delete all form templates" 
  ON form_templates FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_form_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_templates_updated_at_trigger
  BEFORE UPDATE ON form_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_form_templates_updated_at();

-- Add comments for documentation
COMMENT ON TABLE form_templates IS 'Stores form templates for unified form builder system (visual builder + AI import)';
COMMENT ON COLUMN form_templates.creation_method IS 'How form was created: visual (drag & drop) or ai_import (from PDF)';
COMMENT ON COLUMN form_templates.form_structure IS 'Complete form structure as JSON: sections, fields, layout, conditional logic';
COMMENT ON COLUMN form_templates.pdf_field_mappings IS 'Mappings from form field IDs to PDF field names';
COMMENT ON COLUMN form_templates.data_source_mappings IS 'Mappings from form fields to application data fields';
COMMENT ON COLUMN form_templates.application_types IS 'Array of application types this template is assigned to';
COMMENT ON COLUMN form_templates.task_number IS 'Task number in application workflow (1, 2, 3, etc.)';

