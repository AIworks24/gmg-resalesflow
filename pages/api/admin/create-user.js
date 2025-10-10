import { createClient } from '@supabase/supabase-js';
import { deleteCachePattern } from '../../../lib/redis';

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
    const { email, password, first_name, last_name, role } = req.body;

    // Validate required fields
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user already exists in auth by trying to create first
    // (The createUser method will fail if email already exists)

    // Create user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error:', authError);
      return res.status(400).json({ error: authError.message });
    }


    // Supabase automatically creates a profile when auth user is created
    // So we need to UPDATE the existing profile instead of creating a new one
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email,
        first_name: first_name || '',
        last_name: last_name || '',
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Profile error:', profileError);
      // If profile creation fails, we should delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    // Invalidate Redis cache for users to force refresh
    await deleteCachePattern('admin:users:*');
    console.log('✅ Redis cache invalidated for admin:users:*');

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
    return res.status(500).json({ error: 'Internal server error' });
  }
} 