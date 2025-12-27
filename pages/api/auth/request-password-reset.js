/**
 * Request Password Reset API Endpoint
 * 
 * This endpoint handles password reset requests with:
 * - SHA-256 token hashing (tokens never stored plaintext)
 * - Rate limiting (5 requests per hour per IP)
 * - User enumeration protection (generic responses)
 * - Token expiry (1 hour)
 * 
 * Security Features:
 * - Tokens validated by hash comparison
 * - Used tokens cannot be reused
 * - Expired tokens rejected
 * - Brute-force protection via rate limiting
 * 
 * @route POST /api/auth/request-password-reset
 */

import { createClient } from '@supabase/supabase-js';
import { sendPasswordResetEmail } from '../../../lib/emailService';
import { 
  generateVerificationToken,
  hashToken,
  validateTokenFormat
} from '../../../lib/auth/tokens';
import { 
  checkRateLimit, 
  LIMITER_TYPES, 
  getClientIp,
  formatResetTime 
} from '../../../lib/ratelimit';
import { normalizeEmail } from '../../../lib/emailUtils';

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

const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1; // 1 hour expiry for password reset

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
 * Calculate expiry timestamp for password reset tokens
 */
const getPasswordResetTokenExpiry = () => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS);
  return expiry;
};

/**
 * Delete all unused password reset tokens for a user
 */
const deleteUnusedTokens = async (userId) => {
  try {
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null);

    if (error) {
      console.error(`[RequestPasswordReset] Error deleting unused tokens for user ${userId}:`, error);
      return false;
    }

    console.log(`[RequestPasswordReset] Deleted unused tokens for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[RequestPasswordReset] Exception deleting tokens:`, error);
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
    // 1. RATE LIMITING
    // ==========================================
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit({ ip: clientIp }, LIMITER_TYPES.CONFIRMATION);
    
    if (!rateLimit.success) {
      const resetTime = formatResetTime(rateLimit.reset);
      console.log(`[RequestPasswordReset] Rate limit exceeded for IP: ${clientIp}`);
      
      return res.status(429).json({
        error: 'Too many password reset requests',
        message: `Please try again ${resetTime}`,
        resetAt: rateLimit.reset,
      });
    }

    // ==========================================
    // 2. INPUT VALIDATION
    // ==========================================
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required' 
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      // Generic response to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // ==========================================
    // 3. FIND USER BY EMAIL
    // ==========================================
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name')
      .ilike('email', normalizedEmail)
      .single();

    // User enumeration protection: always return success even if user doesn't exist
    if (profileError || !profile) {
      console.log(`[RequestPasswordReset] User not found for email: ${normalizedEmail}`);
      // Return generic success message to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // ==========================================
    // 4. DELETE OLD UNUSED TOKENS
    // ==========================================
    await deleteUnusedTokens(profile.id);

    // ==========================================
    // 5. GENERATE PASSWORD RESET TOKEN
    // ==========================================
    let resetToken;
    let tokenHash;
    
    try {
      const tokenData = generateVerificationToken();
      resetToken = tokenData.token;      // Plaintext (send to user)
      tokenHash = tokenData.tokenHash;   // SHA-256 hash (store in DB)
    } catch (tokenError) {
      console.error('[RequestPasswordReset] Error generating token:', tokenError);
      return res.status(500).json({ 
        error: 'Failed to generate reset token. Please try again.' 
      });
    }

    // ==========================================
    // 6. STORE TOKEN IN DATABASE
    // ==========================================
    const expiresAt = getPasswordResetTokenExpiry();
    
    const { error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: profile.id,
        token_hash: tokenHash,              // Store ONLY the hash, never plaintext
        expires_at: expiresAt.toISOString(),
        attempts: 0,
      });

    if (tokenError) {
      console.error(`[RequestPasswordReset] Error storing reset token for user ${profile.id}:`, tokenError);
      return res.status(500).json({ 
        error: 'Failed to generate reset token. Please try again.' 
      });
    }

    console.log(`[RequestPasswordReset] New password reset token generated for user: ${profile.id}`);

    // ==========================================
    // 7. SEND PASSWORD RESET EMAIL
    // ==========================================
    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        resetToken: resetToken, // Send plaintext token in email
        firstName: profile.first_name || null,
      });

      console.log(`[RequestPasswordReset] Password reset email sent to: ${normalizedEmail}`);
    } catch (emailError) {
      console.error(`[RequestPasswordReset] Error sending password reset email to ${normalizedEmail}:`, emailError);
      
      // Email send failed - clean up the token we just created
      await supabaseAdmin
        .from('password_reset_tokens')
        .delete()
        .eq('token_hash', tokenHash);

      return res.status(500).json({ 
        error: 'Failed to send password reset email. Please try again.' 
      });
    }

    // ==========================================
    // 8. SUCCESS RESPONSE (generic to prevent enumeration)
    // ==========================================
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('[RequestPasswordReset] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.' 
    });
  }
}

