/**
 * Rate Limiting Configuration for Authentication Endpoints
 * 
 * This module provides rate limiting to prevent:
 * - Spam registrations
 * - Brute-force attacks on verification endpoints
 * - Email flooding (resend verification abuse)
 * - Auto-login token brute-forcing
 * 
 * Uses Upstash Redis with @upstash/ratelimit for distributed rate limiting
 * across multiple server instances.
 * 
 * Security: Fails closed (blocks requests) if Redis is unavailable
 * 
 * @module lib/ratelimit
 */

import { Ratelimit } from '@upstash/ratelimit';
import redis from './redis';

// =====================================================
// RATE LIMITER INSTANCES
// =====================================================

/**
 * Registration Rate Limiter
 * Limit: 5 registration attempts per hour per IP address
 * 
 * Purpose: Prevent spam account creation and automated bot registrations
 * Uses: IP address as identifier
 */
export const registrationLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
  prefix: 'ratelimit:registration',
}) : null;

/**
 * Email Confirmation Rate Limiter
 * Limit: 10 confirmation attempts per hour per IP address
 * 
 * Purpose: Prevent brute-force token guessing attacks
 * Uses: IP address as identifier
 * 
 * Note: Higher limit than registration because legitimate users might
 * mistype or have issues requiring multiple attempts
 */
export const confirmationLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
  prefix: 'ratelimit:confirmation',
}) : null;

/**
 * Resend Verification Rate Limiter - Daily Limit
 * Limit: 5 resend requests per 24 hours per email address
 * 
 * Purpose: Prevent email flooding and abuse
 * Uses: Email address as identifier (not IP, to prevent multi-IP abuse)
 */
export const resendDailyLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '24 h'),
  analytics: true,
  prefix: 'ratelimit:resend:daily',
}) : null;

/**
 * Resend Verification Rate Limiter - Cooldown
 * Limit: 1 request per 2 minutes per email address
 * 
 * Purpose: Enforce minimum time between resend requests (anti-spam)
 * Uses: Email address as identifier
 * 
 * Note: This works in conjunction with daily limiter - both must pass
 */
export const resendCooldownLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, '2 m'),
  analytics: true,
  prefix: 'ratelimit:resend:cooldown',
}) : null;

/**
 * Auto-Login Rate Limiter
 * Limit: 10 auto-login attempts per hour per IP address
 * 
 * Purpose: Prevent brute-force attacks on auto-login tokens
 * Uses: IP address as identifier
 */
export const autoLoginLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
  prefix: 'ratelimit:autologin',
}) : null;

// =====================================================
// RATE LIMIT TYPES (for auto-detection)
// =====================================================

/**
 * Valid rate limiter types
 */
export const LIMITER_TYPES = {
  REGISTRATION: 'registration',
  CONFIRMATION: 'confirmation',
  RESEND: 'resend',
  AUTO_LOGIN: 'autologin',
};

// =====================================================
// HELPER FUNCTION
// =====================================================

/**
 * Check rate limit for a given identifier and limiter type
 * 
 * This function automatically:
 * - Detects the appropriate identifier (IP or email) based on limiter type
 * - Selects the correct rate limiter
 * - Handles resend verification's dual-limit (daily + cooldown)
 * - Fails closed if Redis is unavailable (security-first)
 * 
 * @param {Object} identifier - Object containing ip and/or email
 * @param {string} identifier.ip - IP address (required for most limiters)
 * @param {string} identifier.email - Email address (required for resend limiter)
 * @param {string} limiterType - Type of limiter to check (use LIMITER_TYPES constants)
 * 
 * @returns {Promise<Object>} Rate limit result
 * @returns {boolean} success - True if request is allowed, false if rate limited
 * @returns {number} remaining - Number of requests remaining in window
 * @returns {number} reset - Unix timestamp (ms) when limit resets
 * @returns {string} [error] - Error message if rate limit check fails
 * 
 * @example
 * // Check registration rate limit
 * const result = await checkRateLimit(
 *   { ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress },
 *   LIMITER_TYPES.REGISTRATION
 * );
 * 
 * if (!result.success) {
 *   return res.status(429).json({ 
 *     error: 'Too many requests',
 *     resetAt: result.reset 
 *   });
 * }
 * 
 * @example
 * // Check resend verification (uses email + dual limits)
 * const result = await checkRateLimit(
 *   { email: 'user@example.com' },
 *   LIMITER_TYPES.RESEND
 * );
 */
export async function checkRateLimit(identifier, limiterType) {
  // Security: Fail closed if Redis is not available
  if (!redis) {
    console.error('[RateLimit] Redis not configured - blocking request for security');
    return {
      success: false,
      remaining: 0,
      reset: Date.now(),
      error: 'Rate limiting service unavailable. Please try again later.',
    };
  }

  try {
    // Auto-detect identifier and limiter based on type
    let limiter;
    let rateLimitKey;

    switch (limiterType) {
      case LIMITER_TYPES.REGISTRATION:
        if (!identifier.ip) {
          throw new Error('IP address required for registration rate limit');
        }
        limiter = registrationLimiter;
        rateLimitKey = identifier.ip;
        break;

      case LIMITER_TYPES.CONFIRMATION:
        if (!identifier.ip) {
          throw new Error('IP address required for confirmation rate limit');
        }
        limiter = confirmationLimiter;
        rateLimitKey = identifier.ip;
        break;

      case LIMITER_TYPES.RESEND:
        if (!identifier.email) {
          throw new Error('Email address required for resend rate limit');
        }
        
        // Resend has TWO limits: daily limit + cooldown
        // Both must pass for request to be allowed
        
        // Check daily limit first
        const dailyResult = await resendDailyLimiter.limit(identifier.email);
        if (!dailyResult.success) {
          return {
            success: false,
            remaining: dailyResult.remaining,
            reset: dailyResult.reset,
            error: `Daily limit exceeded. You can resend ${dailyResult.remaining} more times today. Reset at: ${new Date(dailyResult.reset).toLocaleString()}`,
          };
        }
        
        // Check cooldown (2-minute minimum between resends)
        const cooldownResult = await resendCooldownLimiter.limit(identifier.email);
        if (!cooldownResult.success) {
          const secondsRemaining = Math.ceil((cooldownResult.reset - Date.now()) / 1000);
          return {
            success: false,
            remaining: 0,
            reset: cooldownResult.reset,
            error: `Please wait ${secondsRemaining} seconds before requesting another verification email.`,
          };
        }
        
        // Both limits passed
        return {
          success: true,
          remaining: Math.min(dailyResult.remaining, cooldownResult.remaining),
          reset: Math.max(dailyResult.reset, cooldownResult.reset),
        };

      case LIMITER_TYPES.AUTO_LOGIN:
        if (!identifier.ip) {
          throw new Error('IP address required for auto-login rate limit');
        }
        limiter = autoLoginLimiter;
        rateLimitKey = identifier.ip;
        break;

      default:
        throw new Error(`Invalid limiter type: ${limiterType}`);
    }

    // Check rate limit (for non-resend types)
    if (limiterType !== LIMITER_TYPES.RESEND) {
      const result = await limiter.limit(rateLimitKey);
      
      return {
        success: result.success,
        remaining: result.remaining,
        reset: result.reset,
        ...(result.success ? {} : { 
          error: `Rate limit exceeded. Please try again later. Reset at: ${new Date(result.reset).toLocaleString()}` 
        }),
      };
    }
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error);
    
    // Fail closed on errors (security-first approach)
    return {
      success: false,
      remaining: 0,
      reset: Date.now(),
      error: 'Rate limit check failed. Please try again.',
    };
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get client IP address from Next.js request object
 * 
 * Checks multiple headers for IP (handles proxies/load balancers):
 * 1. x-forwarded-for (most common with proxies)
 * 2. x-real-ip (nginx proxy)
 * 3. cf-connecting-ip (Cloudflare)
 * 4. req.socket.remoteAddress (direct connection)
 * 
 * @param {Object} req - Next.js API request object
 * @returns {string} IP address
 * 
 * @example
 * const ip = getClientIp(req);
 * const result = await checkRateLimit({ ip }, LIMITER_TYPES.REGISTRATION);
 */
export function getClientIp(req) {
  // Check for IP in various headers (proxy/load balancer scenarios)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, use the first one
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) {
    return cfIp;
  }
  
  // Fallback to socket remote address
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Format reset timestamp for user-friendly display
 * 
 * @param {number} resetTimestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable time until reset
 * 
 * @example
 * const resetTime = formatResetTime(result.reset);
 * // Returns: "in 45 minutes" or "in 2 hours"
 */
export function formatResetTime(resetTimestamp) {
  const now = Date.now();
  const diffMs = resetTimestamp - now;
  
  if (diffMs <= 0) {
    return 'now';
  }
  
  const diffMinutes = Math.ceil(diffMs / 1000 / 60);
  
  if (diffMinutes < 60) {
    return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
  
  const diffHours = Math.ceil(diffMinutes / 60);
  return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
}



