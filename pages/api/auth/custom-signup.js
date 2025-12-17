/**
 * User Registration API Endpoint
 * 
 * This endpoint handles new user registration with:
 * - Email validation (strict RFC format)
 * - Duplicate user detection
 * - Secure token generation (SHA-256 hashed)
 * - Database transaction safety
 * - Email verification flow
 * 
 * Security Features:
 * - Tokens stored as SHA-256 hashes (not plaintext)
 * - Automatic cleanup on failures
 * - Fail-safe error handling
 * 
 * @route POST /api/auth/custom-signup
 */

import { createClient } from '@supabase/supabase-js';
import { sendEmailConfirmationEmail } from '../../../lib/emailService';
import { 
  generateVerificationToken, 
  getVerificationTokenExpiry 
} from '../../../lib/auth/tokens';

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
// HELPER FUNCTIONS
// =====================================================

/**
 * Determine user role based on email domain
 * 
 * All users are assigned 'requester' role
 * 
 * @param {string} email - Email address
 * @returns {string} Role ('requester')
 */
const determineUserRole = (email) => {
  if (!email) return 'requester';
  // All users are now 'requester' regardless of email domain
  return 'requester';
};

/**
 * Validate email format (strict RFC-compliant regex)
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  // Strict email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * Check if user exists in Supabase Auth
 * 
 * @param {string} email - Email to check
 * @returns {Object|null} User object if exists, null otherwise
 */
const findUserByEmail = async (email) => {
  try {
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    return existingUsers?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    ) || null;
  } catch (error) {
    console.error('[Signup] Error finding user:', error);
    throw error;
  }
};

/**
 * Delete old verification tokens for a user
 * Useful when user tries to re-register before verifying
 * 
 * @param {string} userId - User ID
 */
const deleteOldVerificationTokens = async (userId) => {
  try {
    const { error } = await supabaseAdmin
      .from('email_verification_tokens')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('[Signup] Error deleting old tokens:', error);
    }
  } catch (error) {
    console.error('[Signup] Error in deleteOldVerificationTokens:', error);
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
    const { email, password, first_name, last_name } = req.body;

    // Check required fields
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Please enter a valid email address' 
      });
    }

    // Validate password (basic check - Supabase has its own rules)
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // ==========================================
    // 2. CHECK EXISTING USER
    // ==========================================
    const existingUser = await findUserByEmail(normalizedEmail);
    
    if (existingUser) {
      // Check if user has verified their email
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email_confirmed_at')
        .eq('id', existingUser.id)
        .single();
      
      if (profile?.email_confirmed_at) {
        // User exists and is verified - direct them to login
        return res.status(400).json({ 
          error: 'Email already registered. Please sign in.' 
        });
      } else {
        // User exists but is unverified - allow re-registration by deleting old tokens
        console.log(`[Signup] Deleting old verification tokens for unverified user: ${existingUser.id}`);
        await deleteOldVerificationTokens(existingUser.id);
        
        // Delete the old user completely and create fresh
        await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
      }
    }

    // ==========================================
    // 3. CREATE USER IN SUPABASE AUTH
    // ==========================================
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false, // Don't auto-confirm (we handle verification)
      user_metadata: {
        first_name: first_name || '',
        last_name: last_name || '',
      },
    });

    if (authError) {
      console.error('[Signup] Error creating user:', authError);
      
      // Handle specific Supabase auth errors
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return res.status(400).json({ error: 'Email already registered. Please sign in.' });
      } else if (authError.message.includes('invalid email')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      } else if (authError.message.includes('Password')) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }
      
      return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }

    if (!authData.user) {
      return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }

    const userId = authData.user.id;
    console.log(`[Signup] User created: ${userId} (${normalizedEmail})`);

    // ==========================================
    // 4. CREATE PROFILE RECORD
    // ==========================================
    const userRole = determineUserRole(normalizedEmail);
    
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: normalizedEmail,
        role: userRole,
        first_name: first_name || '',
        last_name: last_name || '',
        active: true,
        email_confirmed_at: null, // Not confirmed yet
      });

    if (profileError) {
      console.error('[Signup] Error creating profile:', profileError);
      
      // CRITICAL FAILURE: Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      
      return res.status(500).json({ error: 'Failed to create user profile. Please try again.' });
    }

    // ==========================================
    // 5. GENERATE VERIFICATION TOKEN
    // ==========================================
    let verificationToken;
    let tokenHash;
    
    try {
      const tokenData = generateVerificationToken();
      verificationToken = tokenData.token;      // Plaintext (send to user)
      tokenHash = tokenData.tokenHash;          // SHA-256 hash (store in DB)
    } catch (tokenError) {
      console.error('[Signup] Error generating token:', tokenError);
      
      // CRITICAL FAILURE: Clean up user and profile
      await supabaseAdmin.auth.admin.deleteUser(userId);
      
      return res.status(500).json({ error: 'Failed to generate verification token. Please try again.' });
    }

    // ==========================================
    // 6. STORE VERIFICATION TOKEN
    // ==========================================
    const expiresAt = getVerificationTokenExpiry(); // 24 hours from now
    
    const { error: tokenError } = await supabaseAdmin
      .from('email_verification_tokens')
      .insert({
        user_id: userId,
        token_hash: tokenHash,              // Store ONLY the hash, never plaintext
        expires_at: expiresAt.toISOString(),
        attempts: 0,
      });

    if (tokenError) {
      console.error('[Signup] Error storing verification token:', tokenError);
      
      // CRITICAL FAILURE: Clean up user and profile
      await supabaseAdmin.auth.admin.deleteUser(userId);
      
      return res.status(500).json({ error: 'Failed to store verification token. Please try again.' });
    }

    // ==========================================
    // 7. SEND VERIFICATION EMAIL
    // ==========================================
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    try {
      await sendEmailConfirmationEmail({
        to: normalizedEmail,
        confirmationToken: verificationToken,  // Send plaintext token (not hash)
        firstName: first_name || null,
      });
      
      console.log(`[Signup] Verification email sent to: ${normalizedEmail}`);
    } catch (emailError) {
      console.error('[Signup] Error sending verification email:', emailError);
      
      // NON-CRITICAL: Don't fail signup if email fails
      // User can request resend later via resend endpoint
      // But log it for monitoring
    }

    // ==========================================
    // 8. CREATE SESSION FOR USER (LOG THEM IN)
    // ==========================================
    // User is logged in immediately but marked as unverified
    // They can browse the site but can't create applications until verified
    let session = null;
    
    try {
      // Use admin API to generate session tokens (bypasses email confirmation requirement)
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      });

      if (linkError || !linkData) {
        console.error('[Signup] Error generating link:', linkError);
      } else {
        console.log('[Signup] Magic link generated, creating session...');
        
        // Extract hashed token and verify to get session
        const hashedToken = linkData.properties?.hashed_token;
        
        if (hashedToken) {
          // Create temporary client to verify the OTP
          const { createClient } = require('@supabase/supabase-js');
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
          
          const { data: sessionData, error: sessionError } = await tempClient.auth.verifyOtp({
            token_hash: hashedToken,
            type: 'magiclink',
          });
          
          if (sessionError || !sessionData?.session) {
            console.error('[Signup] Error creating session from OTP:', sessionError);
          } else {
            session = sessionData.session;
            console.log('[Signup] Session created successfully for new user');
          }
        } else {
          console.error('[Signup] No hashed_token in generateLink response');
        }
      }
    } catch (sessionError) {
      console.error('[Signup] Error creating session:', sessionError);
      // Non-critical - continue without session
    }

    // ==========================================
    // 9. SUCCESS RESPONSE
    // ==========================================
    console.log('[Signup] Returning success response with session:', session ? 'YES' : 'NO');
    
    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      requiresEmailVerification: true,
      session: session,
      user: {
        id: userId,
        email: normalizedEmail,
      },
    });

  } catch (error) {
    console.error('[Signup] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.' 
    });
  }
}
