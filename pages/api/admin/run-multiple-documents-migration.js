import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🚀 Starting multiple documents per section migration...');

    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'database', 'multiple_documents_per_section_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration using raw SQL
    // Note: This requires exec_sql RPC function in Supabase
    // If not available, you can run the SQL directly in Supabase dashboard
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error);
      
      // If exec_sql RPC doesn't exist, provide manual instructions
      if (error.message?.includes('exec_sql') || error.message?.includes('function')) {
        return res.status(500).json({
          success: false,
          error: 'exec_sql RPC function not available',
          instructions: 'Please run the SQL directly in your Supabase SQL editor:',
          sql: migrationSQL
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Migration failed: ' + error.message
      });
    }

    console.log('✅ Multiple documents per section migration completed successfully!');

    // Verify the migration by checking the table structure
    const { data: sampleDocs, error: verifyError } = await supabase
      .from('property_documents')
      .select('id, property_id, document_key, display_name, file_name')
      .limit(5);

    if (verifyError) {
      console.warn('Could not verify migration (this is okay):', verifyError);
    }

    res.status(200).json({
      success: true,
      message: 'Multiple documents per section migration completed successfully',
      details: 'The unique constraint has been removed and new columns added. You can now upload multiple documents per document section.',
      sampleDocs: sampleDocs || []
    });

  } catch (error) {
    console.error('Error running multiple documents migration:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      instructions: 'Please run the SQL directly in your Supabase SQL editor. The SQL file is located at: database/multiple_documents_per_section_migration.sql'
    });
  }
}











