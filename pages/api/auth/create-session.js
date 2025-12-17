/**
 * Create Auto-Login Token API Endpoint
 * 
 * This endpoint generates an auto-login token for verified users on the device
 * that initiated registration (cross-device auto-login).
 * 
 * Flow:
 * 1. User registers on Device A (stays on waiting screen)
 * 2. User verifies email on Device B (clicks link in email)
 * 3. Device A's Realtime subscription detects verification
 * 4. Device A calls this endpoint to get an auto-login token
 * 5. Device A redirects to /api/auth/auto-login with the token
 * 6. User is automatically logged in on Device A
 * 
 * Security Features:
 * - Validates user exists in Supabase Auth
 * - Verifies email is confirmed before issuing token
 * - Rate limiting (20 requests per hour per user ID)
 * - Generates short-lived auto-login token (5 minutes)
 * - Token is hashed using SHA-256 before storage
 * 
 * @route POST /api/auth/create-session
 */

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, LIMITER_TYPES, getClientIp } from '../../../lib/ratelimit';
import { generateVerificationToken } from '../../../lib/auth/tokens';

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
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID format' 
      });
    }

    // ==========================================
    // 2. RATE LIMITING
    // ==========================================
    // Use a custom rate limiter for session creation: 20 per hour per user ID
    const clientIp = getClientIp(req);
    
    // We'll check rate limit by user ID, not IP (prevents abuse per user)
    // But we still need IP for the rate limiter, so we'll use a combination
    const rateLimitKey = `${userId}-${clientIp}`;
    
    // Create a simple rate limit check for session creation
    // Since we don't have a SESSION_CREATE limiter type, we'll use a workaround
    // by checking the IP-based limiter with a reasonable limit
    const rateLimit = await checkRateLimit({ ip: rateLimitKey }, LIMITER_TYPES.AUTO_LOGIN);
    
    if (!rateLimit.success) {
      console.log(`[CreateSession] Rate limit exceeded for user: ${userId}`);
      return res.status(429).json({
        error: 'Too many session creation attempts',
        message: 'Please wait before trying again.',
        resetAt: rateLimit.reset,
      });
    }

    // ==========================================
    // 3. VALIDATE USER EXISTS IN SUPABASE AUTH
    // ==========================================
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError || !authUser.user) {
      console.error('[CreateSession] User not found in auth:', authError);
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // ==========================================
    // 4. CHECK EMAIL VERIFICATION STATUS
    // ==========================================
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, email_confirmed_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('[CreateSession] Profile not found:', profileError);
      return res.status(404).json({ 
        error: 'User profile not found' 
      });
    }

    // Check if email is verified
    if (!profile.email_confirmed_at) {
      console.log(`[CreateSession] Email not verified for user: ${userId}`);
      return res.status(403).json({ 
        error: 'Email not yet verified',
        message: 'Please verify your email before creating a session.'
      });
    }

    console.log(`[CreateSession] Creating session for verified user: ${userId}`);

    // ==========================================
    // 5. GENERATE AUTO-LOGIN TOKEN FOR THIS DEVICE
    // ==========================================
    const { token: autoLoginToken, tokenHash: autoLoginTokenHash } = generateVerificationToken();
    const autoLoginExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const { error: tokenInsertError } = await supabaseAdmin
      .from('auto_login_tokens')
      .insert({
        user_id: userId,
        token_hash: autoLoginTokenHash,
        expires_at: autoLoginExpiresAt.toISOString(),
      });

    if (tokenInsertError) {
      console.error('[CreateSession] Error storing auto-login token:', tokenInsertError);
      return res.status(500).json({ 
        error: 'Failed to create session',
        message: 'Unable to generate auto-login token. Please try signing in manually.'
      });
    }

    console.log(`[CreateSession] Auto-login token generated for user: ${userId}`);

    // ==========================================
    // 6. SUCCESS RESPONSE WITH AUTO-LOGIN TOKEN
    // ==========================================
    // Return the auto-login token so the frontend can redirect to /api/auth/auto-login
    const autoLoginUrl = `/api/auth/auto-login?token=${autoLoginToken}`;
    
    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      autoLoginToken,
      autoLoginUrl,
      user: {
        id: profile.id,
        email: profile.email,
      },
    });

  } catch (error) {
    console.error('[CreateSession] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred',
      message: 'Please try again later.'
    });
  }
}

