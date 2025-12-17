/**
 * Auto-Login API Endpoint
 * 
 * This endpoint handles secure auto-login after email verification:
 * - Validates one-time use tokens (5-minute expiry)
 * - Creates Supabase session with secure cookies
 * - Prevents replay attacks (token marked as used)
 * - Rate limited to prevent brute-force attacks
 * 
 * Flow:
 * 1. User clicks email verification link
 * 2. Email is verified, auto-login token generated
 * 3. User redirected to this endpoint with token
 * 4. Token validated, session created, user logged in
 * 
 * Security Features:
 * - SHA-256 hashed tokens
 * - One-time use (marked as used after consumption)
 * - 5-minute expiration window
 * - Rate limiting (10 attempts per hour per IP)
 * - HttpOnly, Secure, SameSite cookies
 * 
 * @route GET /api/auth/auto-login?token=xxx
 */

import { createClient } from '@supabase/supabase-js';
import { serialize } from 'cookie';
import { 
  hashToken, 
  validateTokenFormat,
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

const MAX_AUTO_LOGIN_ATTEMPTS = 5;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate error HTML page for display
 */
const generateErrorPage = (title, message, redirectUrl = '/') => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          padding: 48px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 24px;
        }
        h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 16px;
        }
        p {
          font-size: 16px;
          color: #6b7280;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .button {
          display: inline-block;
          background: #166534;
          color: white;
          text-decoration: none;
          padding: 14px 32px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          transition: background 0.3s;
        }
        .button:hover {
          background: #15803d;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">⚠️</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="${redirectUrl}" class="button">Return to Home</a>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate success HTML page with auto-redirect
 */
const generateSuccessPage = (redirectUrl = '/') => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      <title>Login Successful</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          padding: 48px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 24px;
          animation: checkmark 0.5s ease-in-out;
        }
        @keyframes checkmark {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        h1 {
          font-size: 28px;
          font-weight: 700;
          color: #166534;
          margin-bottom: 16px;
        }
        p {
          font-size: 16px;
          color: #6b7280;
          line-height: 1.6;
        }
        .spinner {
          margin-top: 32px;
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid #f3f4f6;
          border-top: 4px solid #166534;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Login Successful!</h1>
        <p>Redirecting you to the application...</p>
        <div class="spinner"></div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Set Supabase auth cookies
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  // Set access token cookie
  res.setHeader('Set-Cookie', [
    serialize('sb-access-token', accessToken, COOKIE_OPTIONS),
    serialize('sb-refresh-token', refreshToken, COOKIE_OPTIONS),
  ]);
};

// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(req, res) {
  // Only allow GET requests (accessed via URL redirect)
  if (req.method !== 'GET') {
    return res.status(405).send(
      generateErrorPage(
        'Method Not Allowed',
        'This endpoint only accepts GET requests.'
      )
    );
  }

  try {
    // ==========================================
    // 1. RATE LIMITING
    // ==========================================
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit({ ip: clientIp }, LIMITER_TYPES.AUTO_LOGIN);
    
    if (!rateLimit.success) {
      const resetTime = formatResetTime(rateLimit.reset);
      console.log(`[AutoLogin] Rate limit exceeded for IP: ${clientIp}`);
      
      return res.status(429).send(
        generateErrorPage(
          'Too Many Attempts',
          `You've made too many login attempts. Please try again ${resetTime}.`
        )
      );
    }

    // ==========================================
    // 2. INPUT VALIDATION
    // ==========================================
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(
        generateErrorPage(
          'Invalid Link',
          'This login link is missing required information. Please request a new verification email.'
        )
      );
    }

    // Validate token format
    const validation = validateTokenFormat(token);
    if (!validation.valid) {
      console.log(`[AutoLogin] Invalid token format: ${validation.error}`);
      return res.status(400).send(
        generateErrorPage(
          'Invalid Link',
          'This login link has an invalid format. Please request a new verification email.'
        )
      );
    }

    // ==========================================
    // 3. HASH TOKEN FOR LOOKUP
    // ==========================================
    let tokenHash;
    try {
      tokenHash = hashToken(token);
    } catch (hashError) {
      console.error('[AutoLogin] Error hashing token:', hashError);
      return res.status(400).send(
        generateErrorPage(
          'Invalid Link',
          'This login link could not be processed. Please request a new verification email.'
        )
      );
    }

    // ==========================================
    // 4. LOOKUP TOKEN IN DATABASE
    // ==========================================
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('auto_login_tokens')
      .select('id, user_id, expires_at, used_at, attempts')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord) {
      console.log('[AutoLogin] Token not found or invalid');
      return res.status(400).send(
        generateErrorPage(
          'Invalid Link',
          'This login link is invalid or has expired. Please request a new verification email.'
        )
      );
    }

    // ==========================================
    // 5. CHECK IF TOKEN ALREADY USED
    // ==========================================
    if (tokenRecord.used_at) {
      console.log(`[AutoLogin] Token already used at: ${tokenRecord.used_at}`);
      return res.status(400).send(
        generateErrorPage(
          'Link Already Used',
          'This login link has already been used. You can sign in from the home page.',
          '/'
        )
      );
    }

    // ==========================================
    // 6. CHECK IF TOKEN EXPIRED (5 minutes)
    // ==========================================
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);
    
    if (expiresAt < now) {
      console.log(`[AutoLogin] Token expired at: ${expiresAt}`);
      return res.status(400).send(
        generateErrorPage(
          'Link Expired',
          'This login link has expired (valid for 5 minutes). You can sign in from the home page.',
          '/'
        )
      );
    }

    // ==========================================
    // 7. CHECK ATTEMPTS LIMIT
    // ==========================================
    if (tokenRecord.attempts >= MAX_AUTO_LOGIN_ATTEMPTS) {
      console.log(`[AutoLogin] Max attempts (${MAX_AUTO_LOGIN_ATTEMPTS}) reached for token`);
      return res.status(400).send(
        generateErrorPage(
          'Too Many Attempts',
          'This login link has been used too many times. You can sign in from the home page.',
          '/'
        )
      );
    }

    // ==========================================
    // 8. INCREMENT ATTEMPTS COUNTER
    // ==========================================
    const { error: incrementError } = await supabaseAdmin
      .from('auto_login_tokens')
      .update({ 
        attempts: tokenRecord.attempts + 1 
      })
      .eq('id', tokenRecord.id);

    if (incrementError) {
      console.error('[AutoLogin] Error incrementing attempts:', incrementError);
      // Non-critical - continue with login
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
      console.error('[AutoLogin] User profile not found:', profileError);
      return res.status(400).send(
        generateErrorPage(
          'User Not Found',
          'Your account could not be found. Please contact support.'
        )
      );
    }

    // Verify email is confirmed
    if (!profile.email_confirmed_at) {
      console.log(`[AutoLogin] User email not confirmed: ${profile.id}`);
      return res.status(400).send(
        generateErrorPage(
          'Email Not Verified',
          'Your email address has not been verified yet. Please check your inbox for the verification email.'
        )
      );
    }

    // ==========================================
    // 10. MARK TOKEN AS USED
    // ==========================================
    const { error: markUsedError } = await supabaseAdmin
      .from('auto_login_tokens')
      .update({ 
        used_at: now.toISOString() 
      })
      .eq('id', tokenRecord.id);

    if (markUsedError) {
      console.error('[AutoLogin] Error marking token as used:', markUsedError);
      return res.status(500).send(
        generateErrorPage(
          'Server Error',
          'An error occurred while processing your login. Please return to the home page and try again.',
          '/'
        )
      );
    }

    // ==========================================
    // 11. GENERATE SUPABASE SESSION
    // ==========================================
    let accessToken = null;
    let refreshToken = null;

    try {
      // Step 1: Generate a magic link to get the hashed token
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: profile.email,
      });

      if (linkError || !linkData) {
        console.error('[AutoLogin] generateLink error:', linkError);
        throw new Error(`Failed to generate magic link: ${linkError?.message || 'Unknown error'}`);
      }

      // Extract the hashed token from the response
      const hashedToken = linkData.properties?.hashed_token;
      
      if (!hashedToken) {
        console.error('[AutoLogin] No hashed_token in generateLink response');
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AutoLogin] generateLink response:', JSON.stringify(linkData, null, 2));
        }
        throw new Error('Failed to generate authentication token');
      }

      console.log('[AutoLogin] Hashed token obtained, verifying OTP...');

      // Step 2: Create a temporary client to verify the OTP and get session
      // We use the anon key (not service key) because verifyOtp is a public operation
      const tempClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      // Step 3: Verify the OTP to get actual session tokens
      const { data: sessionData, error: sessionError } = await tempClient.auth.verifyOtp({
        token_hash: hashedToken,
        type: 'magiclink',
      });

      if (sessionError || !sessionData?.session) {
        console.error('[AutoLogin] verifyOtp error:', sessionError);
        throw new Error(`Failed to create session: ${sessionError?.message || 'No session returned'}`);
      }

      accessToken = sessionData.session.access_token;
      refreshToken = sessionData.session.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error('Session tokens not found in verifyOtp response');
      }

      console.log(`[AutoLogin] Session created successfully for user: ${profile.id}`);
    } catch (sessionError) {
      console.error('[AutoLogin] Error generating session:', sessionError);
      return res.status(500).send(
        generateErrorPage(
          'Login Failed',
          'We could not create your session. Please return to the home page and try again.',
          '/'
        )
      );
    }

    // ==========================================
    // 12. SET SECURE COOKIES
    // ==========================================
    try {
      setAuthCookies(res, accessToken, refreshToken);
      console.log(`[AutoLogin] Auth cookies set for user: ${profile.id}`);
    } catch (cookieError) {
      console.error('[AutoLogin] Error setting cookies:', cookieError);
      return res.status(500).send(
        generateErrorPage(
          'Login Failed',
          'We could not complete your login. Please return to the home page and try again.',
          '/'
        )
      );
    }

    // ==========================================
    // 13. SUCCESS RESPONSE WITH REDIRECT
    // ==========================================
    const redirectUrl = '/';
    
    // Return HTML page with auto-redirect
    res.status(200).send(generateSuccessPage(redirectUrl));

  } catch (error) {
    console.error('[AutoLogin] Unexpected error:', error);
    return res.status(500).send(
      generateErrorPage(
        'Unexpected Error',
        'An unexpected error occurred. Please return to the home page and try again.',
        '/'
      )
    );
  }
}

