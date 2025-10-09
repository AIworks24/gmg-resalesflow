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
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, email, password, first_name, last_name, role } = req.body;

    // Validate required fields
    if (!id || !email || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that first_name and last_name are provided (can be empty strings)
    if (first_name === undefined || last_name === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email,
        first_name: first_name || '',
        last_name: last_name || '',
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (profileError) {
      console.error('Profile error:', profileError);
      return res.status(400).json({ error: profileError.message });
    }

    // Update password if provided
    if (password) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        id,
        { password }
      );
      if (passwordError) {
        console.error('Password error:', passwordError);
        return res.status(400).json({ error: passwordError.message });
      }
    }

    // Update email in auth if it changed
    const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      { email }
    );
    if (emailError) {
      console.error('Email error:', emailError);
      return res.status(400).json({ error: emailError.message });
    }

    return res.status(200).json({ 
      success: true, 
      user: {
        id,
        email,
        first_name,
        last_name,
        role
      }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 