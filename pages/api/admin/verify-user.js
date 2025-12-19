import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get userId from request body
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get the user profile to verify
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, email_confirmed_at, role')
      .eq('id', userId)
      .single();

    if (profileError || !targetProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already verified
    if (targetProfile.email_confirmed_at) {
      return res.status(400).json({ 
        error: 'User is already verified',
        alreadyVerified: true
      });
    }

    // Update email_confirmed_at to current timestamp
    const now = new Date();
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        email_confirmed_at: now.toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return res.status(500).json({ error: 'Failed to verify user' });
    }

    // Also update Supabase Auth email confirmation status
    try {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email_confirm: true }
      );

      if (authUpdateError) {
        console.error('Error updating Supabase auth:', authUpdateError);
        // Non-critical - profile is already confirmed
      }
    } catch (authError) {
      console.error('Error in auth update:', authError);
      // Non-critical - continue
    }

    return res.status(200).json({
      success: true,
      message: 'User verified successfully',
      user: {
        id: targetProfile.id,
        email: targetProfile.email,
        email_confirmed_at: now.toISOString()
      }
    });

  } catch (error) {
    console.error('Verify user API error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify user',
      message: error.message 
    });
  }
}

