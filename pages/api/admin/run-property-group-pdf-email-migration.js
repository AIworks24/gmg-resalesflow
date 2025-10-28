import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🚀 Starting property group PDF/Email fields migration...');

    // Run the migration SQL
    const migrationSQL = `
-- Add PDF and Email status fields to application_property_groups table
-- This enables individual PDF generation and email sending for each property in multi-community applications

-- Add PDF-related columns
ALTER TABLE application_property_groups 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS pdf_completed_at TIMESTAMP WITH TIME ZONE;

-- Add email-related columns  
ALTER TABLE application_property_groups
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS email_completed_at TIMESTAMP WITH TIME ZONE;

-- Add form_data column to store property-specific form data
ALTER TABLE application_property_groups
ADD COLUMN IF NOT EXISTS form_data JSONB;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_application_property_groups_pdf_status 
ON application_property_groups(pdf_status);

CREATE INDEX IF NOT EXISTS idx_application_property_groups_email_status 
ON application_property_groups(email_status);

-- Add constraints for status values
ALTER TABLE application_property_groups 
ADD CONSTRAINT check_pdf_status 
CHECK (pdf_status IN ('not_started', 'in_progress', 'completed', 'failed'));

ALTER TABLE application_property_groups 
ADD CONSTRAINT check_email_status 
CHECK (email_status IN ('not_started', 'in_progress', 'completed', 'failed'));
    `;

    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Migration failed: ' + error.message 
      });
    }

    console.log('✅ Property group PDF/Email fields migration completed successfully!');

    // Verify the migration by checking the table structure
    const { data: columns, error: verifyError } = await supabase
      .from('application_property_groups')
      .select('pdf_url, pdf_status, pdf_completed_at, email_status, email_completed_at, form_data')
      .limit(1);

    if (verifyError) {
      console.warn('⚠️ Could not verify migration:', verifyError);
    } else {
      console.log('✅ Migration verification successful - new columns are available');
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Property group PDF/Email fields migration completed successfully!',
      addedColumns: [
        'pdf_url',
        'pdf_status', 
        'pdf_completed_at',
        'email_status',
        'email_completed_at',
        'form_data'
      ]
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Migration failed: ' + error.message 
    });
  }
}