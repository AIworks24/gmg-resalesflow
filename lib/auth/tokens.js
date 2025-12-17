/**
 * Token Generation and Validation Utilities
 * 
 * This module provides cryptographically secure token generation and validation
 * for email verification and auto-login flows.
 * 
 * Security Features:
 * - Uses crypto.randomBytes for cryptographically secure random tokens
 * - SHA-256 hashing for token storage (tokens stored hashed, never plaintext)
 * - URL-safe base64 encoding (no special characters that break URLs)
 * - Token format validation to prevent injection attacks
 * 
 * @module lib/auth/tokens
 */

import crypto from 'crypto';

// =====================================================
// CONSTANTS
// =====================================================

/**
 * Number of random bytes to generate for tokens
 * 32 bytes = 256 bits of entropy (very secure)
 */
export const TOKEN_BYTE_LENGTH = 32;

/**
 * Email verification token expiry time (in hours)
 */
export const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

/**
 * Auto-login token expiry time (in minutes)
 * Short-lived for security - user must use immediately after email verification
 */
export const AUTO_LOGIN_TOKEN_EXPIRY_MINUTES = 5;

/**
 * Minimum expected token length after base64url encoding
 * 32 bytes = ~43 characters in base64url
 */
const MIN_TOKEN_LENGTH = 32;

/**
 * Maximum reasonable token length (prevents DoS attacks via huge strings)
 */
const MAX_TOKEN_LENGTH = 256;

/**
 * Regex pattern for valid base64url characters
 * Only allows: A-Z, a-z, 0-9, hyphen, underscore
 */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// =====================================================
// TOKEN GENERATION
// =====================================================

/**
 * Generate a cryptographically secure verification token
 * 
 * This function creates a random token and returns both the plaintext version
 * (to send to user) and the hashed version (to store in database).
 * 
 * Security Note:
 * - Only the hash is stored in the database
 * - The plaintext token is sent once via email and never stored
 * - This prevents token theft if database is compromised
 * 
 * @returns {Object} Object containing both token and hash
 * @returns {string} token - Plaintext token (URL-safe base64, send to user)
 * @returns {string} tokenHash - SHA-256 hash (store in database)
 * 
 * @example
 * const { token, tokenHash } = generateVerificationToken();
 * // token: "xY9kPm3vN2aQ7uT5wR8eF4gH6jK1lM0nB" (send in email)
 * // tokenHash: "5d41402abc4b2a76b9719d911017c592..." (store in DB)
 */
export function generateVerificationToken() {
  try {
    // Generate 32 random bytes (256 bits of entropy)
    const randomBytes = crypto.randomBytes(TOKEN_BYTE_LENGTH);
    
    // Convert to base64 and make URL-safe
    const token = randomBytes
      .toString('base64')
      .replace(/\+/g, '-')  // Replace + with -
      .replace(/\//g, '_')  // Replace / with _
      .replace(/=/g, '');   // Remove padding =
    
    // Hash the token for database storage
    const tokenHash = hashToken(token);
    
    return {
      token,      // Send this to the user
      tokenHash   // Store this in the database
    };
  } catch (error) {
    // Crypto operations can fail in rare cases (e.g., insufficient entropy)
    throw new Error(`Failed to generate verification token: ${error.message}`);
  }
}

// =====================================================
// TOKEN HASHING
// =====================================================

/**
 * Hash a plaintext token using SHA-256
 * 
 * This function is used to:
 * 1. Hash tokens before storing in database (during generation)
 * 2. Hash user-provided tokens for comparison (during verification)
 * 
 * Security Note:
 * - SHA-256 is one-way (cannot reverse the hash to get original token)
 * - Same token always produces same hash (allows verification)
 * - Different tokens produce completely different hashes
 * 
 * @param {string} token - Plaintext token to hash
 * @returns {string} Hexadecimal SHA-256 hash (64 characters)
 * @throws {Error} If token is invalid or hashing fails
 * 
 * @example
 * const hash = hashToken("xY9kPm3vN2aQ7uT5wR8eF4gH6jK1lM0nB");
 * // Returns: "5d41402abc4b2a76b9719d911017c592..."
 */
export function hashToken(token) {
  // Validate token format before hashing
  const validation = validateTokenFormat(token);
  if (!validation.valid) {
    throw new Error(`Cannot hash invalid token: ${validation.error}`);
  }
  
  try {
    // Create SHA-256 hash
    const hash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    return hash;
  } catch (error) {
    throw new Error(`Failed to hash token: ${error.message}`);
  }
}

// =====================================================
// TOKEN VALIDATION
// =====================================================

/**
 * Validate that a token string has the correct format
 * 
 * This function checks if a token:
 * - Is a non-empty string
 * - Has reasonable length (not too short or too long)
 * - Contains only valid base64url characters (A-Z, a-z, 0-9, -, _)
 * 
 * Use this to validate user input before attempting database lookups
 * or hashing operations.
 * 
 * @param {string} token - Token string to validate
 * @returns {Object} Validation result
 * @returns {boolean} valid - True if token format is valid
 * @returns {string} [error] - Error message if invalid (only present if valid=false)
 * 
 * @example
 * // Valid token
 * validateTokenFormat("xY9kPm3vN2aQ7uT5wR8eF4gH6jK1lM0nB");
 * // Returns: { valid: true }
 * 
 * @example
 * // Invalid token (too short)
 * validateTokenFormat("abc");
 * // Returns: { valid: false, error: "Token too short (minimum 32 characters)" }
 * 
 * @example
 * // Invalid token (contains illegal characters)
 * validateTokenFormat("abc+def/xyz=");
 * // Returns: { valid: false, error: "Token contains invalid characters..." }
 */
export function validateTokenFormat(token) {
  // Check if token exists and is a string
  if (!token) {
    return { 
      valid: false, 
      error: 'Token is required' 
    };
  }
  
  if (typeof token !== 'string') {
    return { 
      valid: false, 
      error: 'Token must be a string' 
    };
  }
  
  // Check minimum length (prevent brute force with short tokens)
  if (token.length < MIN_TOKEN_LENGTH) {
    return { 
      valid: false, 
      error: `Token too short (minimum ${MIN_TOKEN_LENGTH} characters)` 
    };
  }
  
  // Check maximum length (prevent DoS attacks with huge strings)
  if (token.length > MAX_TOKEN_LENGTH) {
    return { 
      valid: false, 
      error: `Token too long (maximum ${MAX_TOKEN_LENGTH} characters)` 
    };
  }
  
  // Check for valid base64url characters only
  if (!BASE64URL_PATTERN.test(token)) {
    return { 
      valid: false, 
      error: 'Token contains invalid characters (only A-Z, a-z, 0-9, -, _ allowed)' 
    };
  }
  
  // All checks passed
  return { valid: true };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate expiry timestamp for verification tokens
 * 
 * @returns {Date} Timestamp 24 hours from now
 * 
 * @example
 * const expiresAt = getVerificationTokenExpiry();
 * // Returns: Date object 24 hours in the future
 */
export function getVerificationTokenExpiry() {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);
  return expiry;
}

/**
 * Calculate expiry timestamp for auto-login tokens
 * 
 * @returns {Date} Timestamp 5 minutes from now
 * 
 * @example
 * const expiresAt = getAutoLoginTokenExpiry();
 * // Returns: Date object 5 minutes in the future
 */
export function getAutoLoginTokenExpiry() {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + AUTO_LOGIN_TOKEN_EXPIRY_MINUTES);
  return expiry;
}

/**
 * Check if a token has expired
 * 
 * @param {Date|string} expiresAt - Expiry timestamp (Date object or ISO string)
 * @returns {boolean} True if token has expired
 * 
 * @example
 * const isExpired = isTokenExpired('2024-01-15T10:00:00Z');
 * // Returns: true or false
 */
export function isTokenExpired(expiresAt) {
  const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return expiryDate < new Date();
}



