/**
 * Impersonation: resolve acting user for the request.
 * When an admin sends X-Impersonate-User-ID, we treat the request as the target user
 * with requester-only permissions and force payment test mode.
 */

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const IMPERSONATE_HEADER = 'x-impersonate-user-id';

/**
 * Resolve who is acting in this request (for ownership and permissions).
 *
 * @param {object} req - Next.js request
 * @param {object} res - Next.js response
 * @returns {Promise<{
 *   authenticated: boolean,
 *   actingUserId: string | null,
 *   adminUserId: string | null,
 *   isImpersonating: boolean,
 *   effectiveRole: string | null,
 *   profile: object | null,
 *   adminProfile: object | null,
 *   session: object | null
 * }>}
 */
export async function resolveActingUser(req, res) {
  const supabase = createPagesServerClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      authenticated: false,
      actingUserId: null,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: null,
      profile: null,
      adminProfile: null,
      session: null,
    };
  }

  const rawHeader = req.headers[IMPERSONATE_HEADER] ?? req.headers['X-Impersonate-User-ID'];
  const impersonateUserId = typeof rawHeader === 'string' ? rawHeader.trim() : null;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: adminProfile, error: adminError } = await serviceSupabase
    .from('profiles')
    .select('id, email, role, first_name, last_name')
    .eq('id', session.user.id)
    .single();

  if (adminError || !adminProfile) {
    return {
      authenticated: true,
      actingUserId: session.user.id,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: adminProfile?.role ?? null,
      profile: adminProfile,
      adminProfile: null,
      session,
    };
  }

  const isAdmin = adminProfile.role === 'admin';

  if (!impersonateUserId) {
    return {
      authenticated: true,
      actingUserId: session.user.id,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: adminProfile.role,
      profile: adminProfile,
      adminProfile: null,
      session,
    };
  }

  if (!isAdmin) {
    if (impersonateUserId) {
      console.error('[SECURITY] Non-admin attempted impersonation:', {
        userId: session.user.id,
        targetUserId: impersonateUserId,
        ip: req.headers['x-forwarded-for'],
      });
    }
    return {
      authenticated: true,
      actingUserId: session.user.id,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: adminProfile.role,
      profile: adminProfile,
      adminProfile: null,
      session,
    };
  }

  const { data: targetProfile, error: targetError } = await serviceSupabase
    .from('profiles')
    .select('id, email, role, first_name, last_name')
    .eq('id', impersonateUserId)
    .single();

  if (targetError || !targetProfile) {
    console.warn('[Impersonation] Target user not found:', impersonateUserId);
    return {
      authenticated: true,
      actingUserId: session.user.id,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: adminProfile.role,
      profile: adminProfile,
      adminProfile: null,
      session,
    };
  }

  const allowedTargetRoles = ['requester', null];
  const targetRole = targetProfile.role ?? null;
  if (!allowedTargetRoles.includes(targetRole)) {
    console.warn('[Impersonation] Target is not a requester:', { targetUserId: impersonateUserId, role: targetRole });
    return {
      authenticated: true,
      actingUserId: session.user.id,
      adminUserId: null,
      isImpersonating: false,
      effectiveRole: adminProfile.role,
      profile: adminProfile,
      adminProfile: null,
      session,
    };
  }

  return {
    authenticated: true,
    actingUserId: impersonateUserId,
    adminUserId: session.user.id,
    isImpersonating: true,
    effectiveRole: 'requester',
    profile: targetProfile,
    adminProfile: adminProfile,
    session,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveActingUser };
}
