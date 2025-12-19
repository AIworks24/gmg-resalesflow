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

    // Get current user profile to check existing role and verification status
    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('role, email_confirmed_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching current profile:', fetchError);
      return res.status(400).json({ error: 'User not found' });
    }

    // Prepare profile update
    const now = new Date().toISOString();
    const profileUpdate = {
      email,
      first_name: first_name || '',
      last_name: last_name || '',
      role,
      updated_at: now
    };

    // Auto-verify staff, admin, and accounting users
    // If role is being changed to staff/admin/accounting and user is not verified, verify them
    if ((role === 'staff' || role === 'admin' || role === 'accounting') && !currentProfile.email_confirmed_at) {
      profileUpdate.email_confirmed_at = now;
    }
    // If role is being changed from staff/admin/accounting to requester, keep verification status as is
    // (don't unverify them if they were already verified)

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
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
    // Also confirm email if role is staff/admin/accounting
    const authUpdate = { email };
    if (role === 'staff' || role === 'admin' || role === 'accounting') {
      authUpdate.email_confirm = true;
    }
    
    const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      authUpdate
    );
    if (emailError) {
      console.error('Email error:', emailError);
      return res.status(400).json({ error: emailError.message });
    }

    // Invalidate Redis cache for users to force refresh
    await deleteCachePattern('admin:users:*');
    console.log('✅ Redis cache invalidated for admin:users:*');

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