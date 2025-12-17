import { createClient } from '@supabase/supabase-js';
import { sendEmailConfirmationEmail } from '../../../lib/emailService';
import crypto from 'crypto';

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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user profile by email (more efficient than listing all users)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, email_confirmed, first_name')
      .ilike('email', email) // Case-insensitive email match
      .single();

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Error fetching profile:', profileError);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }

    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (profile.email_confirmed) {
      return res.status(400).json({ error: 'Email is already confirmed' });
    }

    // Generate a secure confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Store the token in the profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        email_confirmation_token: confirmationToken,
        email_confirmation_token_expires_at: expiresAt.toISOString(),
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Error updating profile with confirmation token:', updateError);
      return res.status(500).json({ error: 'Failed to generate confirmation token' });
    }

    // Send confirmation email
    try {
      await sendEmailConfirmationEmail({
        to: email,
        confirmationToken,
        firstName: profile?.first_name || null,
      });

      return res.status(200).json({ 
        success: true, 
        message: 'Confirmation email sent successfully' 
      });
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      return res.status(500).json({ error: 'Failed to send confirmation email' });
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: `Unexpected error: ${error.message}` });
  }
}

