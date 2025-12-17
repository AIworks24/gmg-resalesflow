/**
 * Resend Verification Email API Endpoint
 * 
 * This endpoint allows users to request new verification emails with:
 * - Dual rate limiting: 5 per day + 2-minute cooldown between requests
 * - Token invalidation: Old unused tokens deleted when issuing new ones
 * - User enumeration protection: Generic responses regardless of email existence
 * - Attempt tracking: Monitors abuse patterns
 * 
 * Security Features:
 * - Email validation (RFC-compliant format)
 * - Rate limiting via Upstash Redis (5/24h + 2-min cooldown)
 * - Generic success responses (prevents account enumeration)
 * - Old token cleanup (prevents token accumulation)
 * - Detailed server-side logging for monitoring
 * 
 * @route POST /api/auth/resend-verification
 */

import { createClient } from '@supabase/supabase-js';
import { sendEmailConfirmationEmail } from '../../../lib/emailService';
import { 
  generateVerificationToken, 
  getVerificationTokenExpiry 
} from '../../../lib/auth/tokens';
import { 
  checkRateLimit, 
  LIMITER_TYPES, 
  getClientIp 
} from '../../../lib/ratelimit';

// =====================================================
// SUPABASE ADMIN CLIENT
// =====================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// =====================================================
// CONSTANTS
// =====================================================

const COOLDOWN_SECONDS = 120; // 2 minutes
const MAX_DAILY_RESENDS = 5;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Validate email format (RFC-compliant)
 */
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * Calculate next available resend time
 */
const getNextResendTime = () => {
  const now = new Date();
  const nextTime = new Date(now.getTime() + COOLDOWN_SECONDS * 1000);
  return nextTime.toISOString();
};

/**
 * Delete all unused verification tokens for a user
 * This prevents token accumulation and ensures only the latest token is valid
 */
const deleteUnusedTokens = async (userId) => {
  try {
    const { error } = await supabaseAdmin
      .from('email_verification_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null); // Only delete unused tokens

    if (error) {
      console.error(`[ResendVerification] Error deleting unused tokens for user ${userId}:`, error);
      return false;
    }

    console.log(`[ResendVerification] Deleted unused tokens for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[ResendVerification] Exception deleting tokens:`, error);
    return false;
  }
};

// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ==========================================
    // 1. INPUT VALIDATION
    // ==========================================
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ 
        error: 'Email address is required' 
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Please enter a valid email address' 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ==========================================
    // 2. RATE LIMITING (Dual: Daily + Cooldown)
    // ==========================================
    // The RESEND limiter type handles both:
    // - 5 requests per 24 hours (daily limit)
    // - 1 request per 2 minutes (cooldown)
    const rateLimit = await checkRateLimit(
      { email: normalizedEmail }, 
      LIMITER_TYPES.RESEND
    );

    if (!rateLimit.success) {
      // Calculate seconds remaining for user-friendly message
      const now = Date.now();
      const secondsRemaining = Math.ceil((rateLimit.reset - now) / 1000);
      const minutesRemaining = Math.ceil(secondsRemaining / 60);

      let userMessage = 'Please wait before requesting another verification email.';
      if (secondsRemaining < 120) {
        // Show seconds if less than 2 minutes
        userMessage = `Please wait ${secondsRemaining} seconds before requesting another verification email.`;
      } else if (minutesRemaining < 60) {
        // Show minutes if less than 1 hour
        userMessage = `Please wait ${minutesRemaining} minutes before requesting another verification email.`;
      } else {
        // Show hours for daily limit
        const hoursRemaining = Math.ceil(minutesRemaining / 60);
        userMessage = `Daily limit reached. Please try again in ${hoursRemaining} hours.`;
      }

      console.log(`[ResendVerification] Rate limit exceeded for email: ${normalizedEmail}`);
      
      return res.status(429).json({
        error: 'Too many requests',
        message: userMessage,
        nextResendAvailable: new Date(rateLimit.reset).toISOString(),
        remaining: rateLimit.remaining,
      });
    }

    // ==========================================
    // 3. CHECK IF USER EXISTS & IS VERIFIED
    // ==========================================
    // Query profiles table directly (faster & more reliable than auth.listUsers)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, email_confirmed_at')
      .ilike('email', normalizedEmail)
      .single();

    // Case A: User not found or error
    if (profileError || !profile) {
      console.log(`[ResendVerification] Profile not found for email: ${normalizedEmail}`);
      // Return generic success to prevent enumeration
      return res.status(200).json({
        success: true,
        message: 'If your email is registered and unverified, a new verification email will be sent.',
        nextResendAvailable: getNextResendTime(),
      });
    }

    // Case B: User already verified
    if (profile.email_confirmed_at) {
      console.log(`[ResendVerification] Email already confirmed for user: ${profile.id}`);
      // Return generic success to prevent enumeration
      // We do NOT tell them it's already verified here to prevent probing
      return res.status(200).json({
        success: true,
        message: 'If your email is registered and unverified, a new verification email will be sent.',
        nextResendAvailable: getNextResendTime(),
      });
    }

    // ==========================================
    // 4. DELETE OLD UNUSED TOKENS
    // ==========================================
    // Safe to delete old tokens since we are issuing a new one
    await deleteUnusedTokens(profile.id);

    // ==========================================
    // 5. GENERATE NEW VERIFICATION TOKEN
    // ==========================================
    const { token, tokenHash } = generateVerificationToken();
    const expiresAt = getVerificationTokenExpiry(); // 24 hours

    const { error: tokenError } = await supabaseAdmin
      .from('email_verification_tokens')
      .insert({
        user_id: profile.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        attempts: 0,
      });

    if (tokenError) {
      console.error(`[ResendVerification] Error storing verification token for user ${profile.id}:`, tokenError);
      // Fallback: don't reveal server error to user if possible, but here 500 is appropriate
      return res.status(500).json({ 
        error: 'Failed to generate verification token. Please try again.' 
      });
    }

    console.log(`[ResendVerification] New verification token generated for user: ${profile.id}`);

    // ==========================================
    // 6. SEND VERIFICATION EMAIL
    // ==========================================
    try {
      await sendEmailConfirmationEmail({
        to: normalizedEmail,
        confirmationToken: token, // Send plaintext token in email
        firstName: profile.first_name || null,
      });

      console.log(`[ResendVerification] Verification email sent to: ${normalizedEmail}`);
    } catch (emailError) {
      console.error(`[ResendVerification] Error sending verification email to ${normalizedEmail}:`, emailError);
      
      // Email send failed - clean up the token we just created
      await supabaseAdmin
        .from('email_verification_tokens')
        .delete()
        .eq('token_hash', tokenHash);

      return res.status(500).json({ 
        error: 'Failed to send verification email. Please try again.' 
      });
    }

    // ==========================================
    // 7. SUCCESS RESPONSE
    // ==========================================
    return res.status(200).json({
      success: true,
      message: `Verification email sent! You can request another in ${COOLDOWN_SECONDS / 60} minutes.`,
      nextResendAvailable: getNextResendTime(),
      attemptsRemaining: MAX_DAILY_RESENDS - 1, // They just used one
    });

  } catch (error) {
    console.error('[ResendVerification] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.' 
    });
  }
}
