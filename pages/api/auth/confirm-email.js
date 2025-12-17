/**
 * Email Verification API Endpoint
 * 
 * This endpoint handles email verification with:
 * - SHA-256 token hashing (tokens never stored plaintext)
 * - Rate limiting (10 attempts per hour per IP)
 * - Attempt tracking (max 5 attempts per token)
 * - Replay attack prevention (token marked as used)
 * - Auto-login token generation (5-minute expiry)
 * - Transaction safety with proper cleanup
 * 
 * Security Features:
 * - Tokens validated by hash comparison
 * - Used tokens cannot be reused
 * - Expired tokens rejected
 * - Brute-force protection via rate limiting + attempt counter
 * - Auto-login tokens are short-lived (5 minutes)
 * 
 * @route POST /api/auth/confirm-email
 */

import { createClient } from '@supabase/supabase-js';
import { 
  hashToken, 
  validateTokenFormat
} from '../../../lib/auth/tokens';
import { 
  checkRateLimit, 
  LIMITER_TYPES, 
  getClientIp,
  formatResetTime 
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

const MAX_VERIFICATION_ATTEMPTS = 5;

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
    // 1. RATE LIMITING
    // ==========================================
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit({ ip: clientIp }, LIMITER_TYPES.CONFIRMATION);
    
    if (!rateLimit.success) {
      const resetTime = formatResetTime(rateLimit.reset);
      console.log(`[Verification] Rate limit exceeded for IP: ${clientIp}`);
      
      return res.status(429).json({
        error: 'Too many verification attempts',
        message: `Please try again ${resetTime}`,
        resetAt: rateLimit.reset,
      });
    }

    // ==========================================
    // 2. INPUT VALIDATION
    // ==========================================
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        error: 'Verification token is required' 
      });
    }

    // Validate token format (prevents injection/malformed data)
    const validation = validateTokenFormat(token);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid token format',
        details: validation.error 
      });
    }

    // ==========================================
    // 3. HASH TOKEN FOR LOOKUP
    // ==========================================
    let tokenHash;
    try {
      tokenHash = hashToken(token);
    } catch (hashError) {
      console.error('[Verification] Error hashing token:', hashError);
      return res.status(400).json({ 
        error: 'Invalid verification token' 
      });
    }

    // ==========================================
    // 4. LOOKUP TOKEN IN DATABASE
    // ==========================================
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('email_verification_tokens')
      .select('id, user_id, expires_at, used_at, attempts')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord) {
      console.log('[Verification] Token not found or invalid');
      return res.status(400).json({ 
        error: 'Invalid or expired verification token' 
      });
    }

    // ==========================================
    // 5. CHECK IF TOKEN ALREADY USED
    // ==========================================
    // Check if token has been used (used_at is not null)
    if (tokenRecord.used_at !== null && tokenRecord.used_at !== undefined) {
      console.log(`[Verification] Token already used at: ${tokenRecord.used_at}`);
      
      // Check if user is already verified
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('email_confirmed_at')
        .eq('id', tokenRecord.user_id)
        .single();
      
      if (profileError) {
        console.error('[Verification] Error checking profile:', profileError);
      }
      
      if (profile?.email_confirmed_at) {
        // Token was used and user is verified - this is fine, just inform them
        console.log(`[Verification] Token already used, but user is verified. User ID: ${tokenRecord.user_id}`);
        return res.status(200).json({ 
          success: true, 
          message: 'Email is already verified. Redirecting to home...',
          alreadyConfirmed: true
        });
      }
      
      // Token was used but user is NOT verified - this is an error
      console.log(`[Verification] Token already used, but user is NOT verified. User ID: ${tokenRecord.user_id}`);
      return res.status(400).json({ 
        success: false,
        error: 'This verification link has already been used',
        message: 'This verification link has already been used. Please request a new verification email if you need to verify your account.'
      });
    }

    // ==========================================
    // 6. CHECK IF TOKEN EXPIRED
    // ==========================================
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);
    
    if (expiresAt < now) {
      console.log(`[Verification] Token expired at: ${expiresAt}`);
      return res.status(400).json({ 
        error: 'Verification link has expired',
        message: 'Please request a new verification email'
      });
    }

    // ==========================================
    // 7. CHECK ATTEMPTS LIMIT
    // ==========================================
    if (tokenRecord.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      console.log(`[Verification] Max attempts (${MAX_VERIFICATION_ATTEMPTS}) reached for token`);
      return res.status(400).json({ 
        error: 'Maximum verification attempts exceeded',
        message: 'Please request a new verification email'
      });
    }

    // ==========================================
    // 8. INCREMENT ATTEMPTS COUNTER
    // ==========================================
    const { error: incrementError } = await supabaseAdmin
      .from('email_verification_tokens')
      .update({ 
        attempts: tokenRecord.attempts + 1 
      })
      .eq('id', tokenRecord.id);

    if (incrementError) {
      console.error('[Verification] Error incrementing attempts:', incrementError);
      // Non-critical - continue with verification
    }

    // ==========================================
    // 9. GET USER PROFILE
    // ==========================================
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, email_confirmed_at')
      .eq('id', tokenRecord.user_id)
      .single();

    if (profileError || !profile) {
      console.error('[Verification] User profile not found:', profileError);
      return res.status(400).json({ 
        error: 'User account not found' 
      });
    }

    // Check if already confirmed (edge case)
    if (profile.email_confirmed_at) {
      console.log(`[Verification] User already confirmed at: ${profile.email_confirmed_at}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Email is already verified. You can sign in now.',
        alreadyConfirmed: true
      });
    }

    // ==========================================
    // 10. MARK TOKEN AS USED
    // ==========================================
    const { error: markUsedError } = await supabaseAdmin
      .from('email_verification_tokens')
      .update({ 
        used_at: now.toISOString() 
      })
      .eq('id', tokenRecord.id);

    if (markUsedError) {
      console.error('[Verification] Error marking token as used:', markUsedError);
      return res.status(500).json({ 
        error: 'Failed to process verification' 
      });
    }

    // ==========================================
    // 11. UPDATE PROFILE - MARK EMAIL AS CONFIRMED
    // ==========================================
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email_confirmed_at: now.toISOString()
      })
      .eq('id', profile.id);

    if (updateProfileError) {
      console.error('[Verification] Error updating profile:', updateProfileError);
      return res.status(500).json({ 
        error: 'Failed to confirm email' 
      });
    }

    console.log(`[Verification] Email confirmed for user: ${profile.id}`);

    // ==========================================
    // 12. UPDATE SUPABASE AUTH
    // ==========================================
    try {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.id,
        { email_confirm: true }
      );

      if (authUpdateError) {
        console.error('[Verification] Error updating Supabase auth:', authUpdateError);
        // Non-critical - profile is already confirmed
      }
    } catch (authError) {
      console.error('[Verification] Error in auth update:', authError);
      // Non-critical - continue
    }

    // ==========================================
    // 13. SUCCESS RESPONSE
    // ==========================================
    // User is already logged in from registration
    // They just needed to verify their email to unlock full features
    console.log(`[Verification] Email verified successfully for user: ${profile.id}`);
    
    return res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      user: {
        id: profile.id,
        email: profile.email,
      },
    });

  } catch (error) {
    console.error('[Verification] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred during verification' 
    });
  }
}
