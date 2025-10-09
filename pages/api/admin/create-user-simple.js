import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    const { email, password, first_name, last_name, role } = req.body;

    console.log('Creating user with:', { email, role });

    // Step 1: Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error:', authError);
      return res.status(400).json({ error: `Auth error: ${authError.message}` });
    }

    console.log('Auth user created with ID:', authData.user.id);

    // Step 2: Create profile using raw SQL to avoid any ORM issues
    const { error: profileError } = await supabaseAdmin
      .rpc('create_user_profile', {
        user_id: authData.user.id,
        user_email: email,
        user_first_name: first_name || '',
        user_last_name: last_name || '',
        user_role: role
      });

    if (profileError) {
      console.error('Profile error:', profileError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: `Profile error: ${profileError.message}` });
    }

    return res.status(200).json({ 
      success: true, 
      user: {
        id: authData.user.id,
        email,
        first_name,
        last_name,
        role
      }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: `Unexpected error: ${error.message}` });
  }
}