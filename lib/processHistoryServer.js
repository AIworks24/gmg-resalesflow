/**
 * Server-only Process History helpers. See ./processHistory for the format and
 * the pure parsing/classification functions.
 *
 * Kept separate from the pure module so that importing the parser into a client
 * component does not drag `createPagesServerClient` into the browser bundle.
 */
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { buildProcessNote } from './processHistory';

/**
 * Append one entry to an application's Process History.
 *
 * BEST EFFORT — this NEVER THROWS. An audit note must not fail the operation it
 * describes, so every error path is logged and returned rather than raised.
 * Callers should `await` it (the entry must be persisted before the endpoint
 * responds, or the admin UI's refetch can race the write and a later
 * "Save Comments" will clobber it) but must not branch on the result.
 *
 * Uses read-modify-write to match every other notes writer in the codebase
 * (complete-task, send-approval-email, the admin correction/rush/cancel routes,
 * the Stripe webhook). Two concurrent writers can therefore still drop an entry;
 * that is a pre-existing, repo-wide race and is out of scope here.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *        A SERVICE-ROLE client. Passed in so callers reuse the one they hold.
 * @param {string} applicationId
 * @param {string} message Note text without the timestamp prefix.
 * @returns {Promise<{ ok: boolean, note: string|null, error: Error|object|null }>}
 */
export async function appendProcessNote(supabase, applicationId, message) {
  if (!supabase || !applicationId || !message) {
    console.warn('[processHistory] skipped: missing supabase client, applicationId, or message');
    return { ok: false, note: null, error: new Error('invalid arguments') };
  }

  const note = buildProcessNote(message);

  try {
    const { data: row, error: readError } = await supabase
      .from('applications')
      .select('notes')
      .eq('id', applicationId)
      .single();

    if (readError) {
      console.warn(`[processHistory] read failed for ${applicationId}:`, readError.message);
      return { ok: false, note, error: readError };
    }

    const current = row?.notes || '';
    const { error: writeError } = await supabase
      .from('applications')
      .update({ notes: current ? `${current}\n\n${note}` : note, updated_at: new Date().toISOString() })
      .eq('id', applicationId);

    if (writeError) {
      console.warn(`[processHistory] write failed for ${applicationId}:`, writeError.message);
      return { ok: false, note, error: writeError };
    }

    return { ok: true, note, error: null };
  } catch (err) {
    console.warn(`[processHistory] unexpected error for ${applicationId}:`, err?.message);
    return { ok: false, note, error: err };
  }
}

/**
 * Resolve the display name of whoever is making the request, for audit notes.
 *
 * Mirrors the auth lookup in pages/api/complete-task.js but NEVER REJECTS: it
 * falls back to 'Admin' instead. Several of the lender questionnaire endpoints
 * have no auth gate today, and one of them (upload-lender-questionnaire-edited)
 * has no in-repo caller at all, so turning attribution into enforcement here
 * would risk breaking live traffic. Unauthenticated calls are logged by the
 * caller instead, as instrumentation for a follow-up hardening pass.
 *
 * Call this BEFORE parsing the request body — on routes with `bodyParser: false`
 * the body stream is consumed by formidable/readJsonBody.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ fallback?: string }} [options]
 * @returns {Promise<{ name: string, userId: string|null, role: string|null, authenticated: boolean }>}
 */
export async function resolveActorName(req, res, options = {}) {
  const fallback = options.fallback || 'Admin';

  try {
    const supabaseAuth = createPagesServerClient({ req, res });
    const { data: { session } } = await supabaseAuth.auth.getSession();

    if (!session) {
      return { name: fallback, userId: null, role: null, authenticated: false };
    }

    const { data: profile } = await supabaseAuth
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', session.user.id)
      .single();

    const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || fallback;
    return { name, userId: session.user.id, role: profile?.role || null, authenticated: true };
  } catch (err) {
    console.warn('[processHistory] resolveActorName failed:', err?.message);
    return { name: fallback, userId: null, role: null, authenticated: false };
  }
}
