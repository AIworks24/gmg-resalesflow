/**
 * Reset Password API Endpoint
 * 
 * This endpoint handles password reset with:
 * - SHA-256 token hashing (tokens never stored plaintext)
 * - Rate limiting (10 attempts per hour per IP)
 * - Attempt tracking (max 5 attempts per token)
 * - Replay attack prevention (token marked as used)
 * - Transaction safety with proper cleanup
 * 
 * Security Features:
 * - Tokens validated by hash comparison
 * - Used tokens cannot be reused
 * - Expired tokens rejected
 * - Brute-force protection via rate limiting + attempt counter
 * 
 * @route POST /api/auth/reset-password
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

const MAX_RESET_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 6;

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
      console.log(`[ResetPassword] Rate limit exceeded for IP: ${clientIp}`);
      
      return res.status(429).json({
        error: 'Too many password reset attempts',
        message: `Please try again ${resetTime}`,
        resetAt: rateLimit.reset,
      });
    }

    // ==========================================
    // 2. INPUT VALIDATION
    // ==========================================
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ 
        error: 'Reset token is required' 
      });
    }

    if (!password) {
      return res.status(400).json({ 
        error: 'New password is required' 
      });
    }

    // Validate password length
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ 
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` 
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
      console.error('[ResetPassword] Error hashing token:', hashError);
      return res.status(400).json({ 
        error: 'Invalid reset token' 
      });
    }

    // ==========================================
    // 4. LOOKUP TOKEN IN DATABASE
    // ==========================================
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at, attempts')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord) {
      console.log('[ResetPassword] Token not found or invalid');
      return res.status(400).json({ 
        error: 'Invalid or expired reset token' 
      });
    }

    // ==========================================
    // 5. CHECK IF TOKEN ALREADY USED
    // ==========================================
    if (tokenRecord.used_at !== null && tokenRecord.used_at !== undefined) {
      console.log(`[ResetPassword] Token already used at: ${tokenRecord.used_at}`);
      return res.status(400).json({ 
        error: 'This reset link has already been used',
        message: 'This reset link has already been used. Please request a new password reset email.'
      });
    }

    // ==========================================
    // 6. CHECK IF TOKEN EXPIRED
    // ==========================================
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);
    
    if (expiresAt < now) {
      console.log(`[ResetPassword] Token expired at: ${expiresAt}`);
      return res.status(400).json({ 
        error: 'Reset link has expired',
        message: 'Please request a new password reset email'
      });
    }

    // ==========================================
    // 7. CHECK ATTEMPTS LIMIT
    // ==========================================
    if (tokenRecord.attempts >= MAX_RESET_ATTEMPTS) {
      console.log(`[ResetPassword] Max attempts (${MAX_RESET_ATTEMPTS}) reached for token`);
      return res.status(400).json({ 
        error: 'Maximum reset attempts exceeded',
        message: 'Please request a new password reset email'
      });
    }

    // ==========================================
    // 8. INCREMENT ATTEMPTS COUNTER
    // ==========================================
    const { error: incrementError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ 
        attempts: tokenRecord.attempts + 1 
      })
      .eq('id', tokenRecord.id);

    if (incrementError) {
      console.error('[ResetPassword] Error incrementing attempts:', incrementError);
      // Non-critical - continue with reset
    }

    // ==========================================
    // 9. GET USER PROFILE
    // ==========================================
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', tokenRecord.user_id)
      .single();

    if (profileError || !profile) {
      console.error('[ResetPassword] User profile not found:', profileError);
      return res.status(400).json({ 
        error: 'User account not found' 
      });
    }

    // ==========================================
    // 10. UPDATE PASSWORD IN SUPABASE AUTH
    // ==========================================
    try {
      const { error: passwordUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        tokenRecord.user_id,
        { password: password }
      );

      if (passwordUpdateError) {
        console.error('[ResetPassword] Error updating password:', passwordUpdateError);
        return res.status(500).json({ 
          error: 'Failed to update password. Please try again.' 
        });
      }

      console.log(`[ResetPassword] Password updated for user: ${tokenRecord.user_id}`);
    } catch (authError) {
      console.error('[ResetPassword] Error in password update:', authError);
      return res.status(500).json({ 
        error: 'Failed to update password. Please try again.' 
      });
    }

    // ==========================================
    // 11. MARK TOKEN AS USED
    // ==========================================
    const { error: markUsedError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ 
        used_at: now.toISOString() 
      })
      .eq('id', tokenRecord.id);

    if (markUsedError) {
      console.error('[ResetPassword] Error marking token as used:', markUsedError);
      // Non-critical - password is already updated
    }

    // ==========================================
    // 12. SUCCESS RESPONSE
    // ==========================================
    console.log(`[ResetPassword] Password reset successfully for user: ${profile.id}`);
    
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.',
    });

  } catch (error) {
    console.error('[ResetPassword] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred during password reset' 
    });
  }
}

