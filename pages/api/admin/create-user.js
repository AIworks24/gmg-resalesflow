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

    const userId = authData.user.id;
    const now = new Date().toISOString();

    // Check if profile already exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    // Prepare profile data
    const profileData = {
      id: userId,
      email,
      first_name: first_name || '',
      last_name: last_name || '',
      role,
      updated_at: now
    };

    // Auto-verify staff, admin, and accounting users
    if (role === 'staff' || role === 'admin' || role === 'accounting') {
      profileData.email_confirmed_at = now;
    }

    let profileError;

    // If profile doesn't exist, INSERT it; otherwise UPDATE it
    if (checkError && checkError.code === 'PGRST116') {
      // Profile doesn't exist, create it
      profileData.created_at = now;
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(profileData);

      profileError = insertError;
      if (insertError) {
        console.error('Profile insert error:', insertError);
      } else {
        console.log('✅ Profile created for user:', userId);
      }
    } else if (checkError) {
      // Some other error checking for profile
      console.error('Error checking profile:', checkError);
      profileError = checkError;
    } else {
      // Profile exists, update it
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', userId);

      profileError = updateError;
      if (updateError) {
        console.error('Profile update error:', updateError);
      } else {
        console.log('✅ Profile updated for user:', userId);
      }
    }

    if (profileError) {
      console.error('Profile error:', profileError);
      // If profile creation/update fails, we should delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: `Failed to create/update profile: ${profileError.message}` });
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