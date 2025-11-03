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

    console.log('🚀 Starting pdf_url column migration for property_owner_forms...');

    // Read the migration SQL file
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(process.cwd(), 'database', 'add_pdf_url_to_property_owner_forms_migration.sql');
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

    console.log('✅ pdf_url column migration completed successfully!');

    // Verify the migration by checking the table structure
    const { data: columns, error: verifyError } = await supabase
      .from('property_owner_forms')
      .select('pdf_url')
      .limit(1);

    if (verifyError) {
      // Check if it's just a column issue or a real error
      if (verifyError.message?.includes('pdf_url')) {
        return res.status(500).json({
          success: false,
          error: 'Migration may not have completed successfully. Please verify the column exists.',
          sql: migrationSQL
        });
      }
      console.warn('⚠️ Could not verify migration:', verifyError);
    } else {
      console.log('✅ Migration verification successful - pdf_url column is available');
    }

    return res.status(200).json({
      success: true,
      message: 'pdf_url column migration completed successfully!',
      addedColumn: 'pdf_url'
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Migration failed: ' + error.message
    });
  }
}

