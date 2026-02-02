/**
 * Audit Logging Utility
 * 
 * Provides functions for logging all admin actions and user impersonation
 * to the audit_logs table for security and compliance.
 * 
 * SECURITY: All audit logging uses service role to bypass RLS and ensure
 * logs cannot be tampered with by users.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Get Supabase client with service role (bypasses RLS)
 * Only use for audit logging - never expose to client
 */
function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[AUDIT] Missing Supabase credentials - audit logging disabled');
    return null;
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

/**
 * Extract IP address from request
 */
function getIpAddress(req) {
  if (!req || !req.headers) return null;
  
  // Check common headers for proxied requests
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;
  
  // Fallback to socket address
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  
  return null;
}

/**
 * Extract user agent from request
 */
function getUserAgent(req) {
  if (!req || !req.headers) return null;
  return req.headers['user-agent'] || null;
}

/**
 * Log an audit event
 * 
 * @param {Object} options - Audit log options
 * @param {string} options.adminUserId - UUID of the admin performing the action (null for regular users)
 * @param {string} options.actingUserId - UUID of the user identity used (different from adminUserId during impersonation)
 * @param {string} options.action - Action performed (e.g., 'impersonation_started', 'update_application')
 * @param {string} options.resourceType - Type of resource (e.g., 'user', 'application', 'payment')
 * @param {string} [options.resourceId] - UUID of the affected resource
 * @param {Object} [options.metadata] - Additional context (will be stored as JSONB)
 * @param {Object} [options.req] - Express request object (for IP and user agent)
 * @param {string} [options.ipAddress] - Manual IP address (if req not available)
 * @param {string} [options.userAgent] - Manual user agent (if req not available)
 * @returns {Promise<string|null>} - UUID of created audit log entry, or null if failed
 */
export async function logAuditEvent({
  adminUserId,
  actingUserId,
  action,
  resourceType,
  resourceId = null,
  metadata = {},
  req = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    // Validate required fields
    if (!action || !resourceType) {
      console.error('[AUDIT] Missing required fields: action and resourceType are required');
      return null;
    }
    
    if (!adminUserId && !actingUserId) {
      console.error('[AUDIT] At least one of adminUserId or actingUserId must be provided');
      return null;
    }
    
    const supabase = getServiceClient();
    if (!supabase) {
      console.error('[AUDIT] Cannot log audit event - service client unavailable');
      return null;
    }
    
    // Extract IP and user agent from request if provided
    const finalIpAddress = ipAddress || getIpAddress(req);
    const finalUserAgent = userAgent || getUserAgent(req);
    
    // Ensure metadata is valid JSON
    let finalMetadata = metadata;
    if (typeof metadata !== 'object' || metadata === null) {
      finalMetadata = { raw: String(metadata) };
    }
    
    // Insert audit log (fire-and-forget: do not await so request returns immediately)
    const insertPromise = supabase
      .from('audit_logs')
      .insert({
        admin_user_id: adminUserId || null,
        acting_user_id: actingUserId || null,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        metadata: finalMetadata,
        ip_address: finalIpAddress,
        user_agent: finalUserAgent
      })
      .select('id')
      .single();

    // Resolve in background - never block the response
    insertPromise
      .then(({ data, error }) => {
        if (error) {
          console.error('[AUDIT] Failed to insert audit log:', error);
          return;
        }
        if (process.env.NODE_ENV === 'development' && data?.id) {
          console.log('[AUDIT]', { id: data.id, action, adminUserId, actingUserId, resourceType, resourceId });
        }
      })
      .catch((err) => console.error('[AUDIT] Exception:', err));

    // Return immediately; caller does not wait for DB write
    return null;
  } catch (error) {
    console.error('[AUDIT] Exception while logging audit event:', error);
    return null;
  }
}

/**
 * Convenience function: Log impersonation start
 */
export async function logImpersonationStart({
  adminUserId,
  targetUserId,
  adminEmail,
  targetEmail,
  req
}) {
  return logAuditEvent({
    adminUserId,
    actingUserId: targetUserId,
    action: 'impersonation_started',
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: {
      admin_email: adminEmail,
      target_email: targetEmail,
      timestamp: new Date().toISOString()
    },
    req
  });
}

/**
 * Convenience function: Log impersonation end
 */
export async function logImpersonationEnd({
  adminUserId,
  targetUserId,
  durationSeconds,
  req
}) {
  return logAuditEvent({
    adminUserId,
    actingUserId: targetUserId,
    action: 'impersonation_ended',
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: {
      duration_seconds: durationSeconds,
      timestamp: new Date().toISOString()
    },
    req
  });
}

/**
 * Convenience function: Log application update during impersonation
 */
export async function logApplicationUpdate({
  adminUserId,
  actingUserId,
  applicationId,
  changes,
  isImpersonating = false,
  req
}) {
  return logAuditEvent({
    adminUserId: isImpersonating ? adminUserId : null,
    actingUserId,
    action: isImpersonating ? 'impersonation_application_update' : 'application_update',
    resourceType: 'application',
    resourceId: applicationId,
    metadata: {
      changes,
      is_impersonating: isImpersonating,
      timestamp: new Date().toISOString()
    },
    req
  });
}

/**
 * Convenience function: Log payment creation during impersonation
 */
export async function logPaymentCreation({
  adminUserId,
  actingUserId,
  applicationId,
  amount,
  isTestMode,
  isImpersonating = false,
  req
}) {
  return logAuditEvent({
    adminUserId: isImpersonating ? adminUserId : null,
    actingUserId,
    action: isImpersonating ? 'impersonation_payment_created' : 'payment_created',
    resourceType: 'payment',
    resourceId: applicationId,
    metadata: {
      amount,
      is_test_mode: isTestMode,
      is_impersonating: isImpersonating,
      timestamp: new Date().toISOString()
    },
    req
  });
}

/**
 * Convenience function: Log admin user management action
 */
export async function logUserManagement({
  adminUserId,
  targetUserId,
  action,
  changes,
  req
}) {
  return logAuditEvent({
    adminUserId,
    actingUserId: targetUserId,
    action: `user_${action}`,
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: {
      changes,
      timestamp: new Date().toISOString()
    },
    req
  });
}

/**
 * Query audit logs for a specific user
 */
export async function queryAuditLogs({
  adminUserId = null,
  actingUserId = null,
  action = null,
  limit = 100,
  offset = 0
}) {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      console.error('[AUDIT] Cannot query audit logs - service client unavailable');
      return [];
    }
    
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (adminUserId) {
      query = query.eq('admin_user_id', adminUserId);
    }
    
    if (actingUserId) {
      query = query.eq('acting_user_id', actingUserId);
    }
    
    if (action) {
      query = query.eq('action', action);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[AUDIT] Failed to query audit logs:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[AUDIT] Exception while querying audit logs:', error);
    return [];
  }
}

/**
 * Query impersonation sessions
 */
export async function queryImpersonationSessions({
  adminUserId = null,
  limit = 50
}) {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      console.error('[AUDIT] Cannot query impersonation sessions - service client unavailable');
      return [];
    }
    
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'impersonation_started')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (adminUserId) {
      query = query.eq('admin_user_id', adminUserId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[AUDIT] Failed to query impersonation sessions:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[AUDIT] Exception while querying impersonation sessions:', error);
    return [];
  }
}

// Export all functions for CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    logAuditEvent,
    logImpersonationStart,
    logImpersonationEnd,
    logApplicationUpdate,
    logPaymentCreation,
    logUserManagement,
    queryAuditLogs,
    queryImpersonationSessions
  };
}
