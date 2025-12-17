import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create a Supabase client with service role key for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // First, let's try to create a test user with accounting role to see the current constraint
    const testUser = {
      id: 'test-accounting-migration-' + Date.now(),
      email: 'test-accounting-migration@example.com',
      first_name: 'Test',
      last_name: 'Accounting',
      role: 'accounting',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Try to insert the test user
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert([testUser]);

    if (error) {
      // If it fails due to constraint, we need to update the constraint
      if (error.message.includes('profiles_role_check')) {
        return res.status(400).json({ 
          error: 'Database constraint needs to be updated. Please run this SQL in your Supabase dashboard:',
          sql: `
-- Drop the existing check constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the new check constraint that includes 'accounting' role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'staff', 'accounting', 'requester', NULL));
          `,
          instructions: 'Copy the SQL above and run it in your Supabase SQL editor, then try creating the accounting user again.'
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // If successful, clean up the test user
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', testUser.id);

    return res.status(200).json({ 
      success: true, 
      message: 'Accounting role is already supported in the database' 
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}