/**
 * Process History — the admin timeline shown on an application.
 *
 * There is no history table. The timeline is derived entirely from the free-text
 * `applications.notes` column: every `\n\n`-separated chunk that begins with an
 * ISO-8601 timestamp in square brackets is an audit entry, and everything else is
 * operator free text shown in the Comments & Notes box.
 *
 * This module is the single place that knows that format. It is intentionally
 * pure and isomorphic (no Supabase, no next/headers) so it can be imported by
 * both the admin component and the API routes, and unit tested with no mocks.
 * Server-only helpers live in ./processHistoryServer.
 */

/** Marks a notes chunk as an audit entry rather than operator free text. */
export const AUDIT_NOTE_PATTERN = /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]/;

/** Captures the timestamp and message out of a single audit chunk. */
const AUDIT_NOTE_CAPTURE = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]\s*([\s\S]*)/;

/**
 * Format a message as a process-history chunk.
 *
 * Internal newlines are collapsed to spaces: a `\n\n` inside the message would
 * split it into two chunks, and the second would fail AUDIT_NOTE_PATTERN — it
 * would vanish from the timeline and leak into the Comments & Notes textarea.
 *
 * @param {string} message Note text without the timestamp prefix.
 * @param {string} [timestamp] ISO-8601 string. Defaults to now.
 * @returns {string}
 */
export function buildProcessNote(message, timestamp) {
  const ts = timestamp || new Date().toISOString();
  const clean = String(message == null ? '' : message).replace(/\s*\n\s*/g, ' ').trim();
  return `[${ts}] ${clean}`;
}

/**
 * Split `applications.notes` into its audit entries, discarding free text.
 *
 * @param {string|null|undefined} notes
 * @returns {Array<{ timestamp: string, message: string }>} In stored order.
 */
export function parseProcessNotes(notes) {
  return String(notes || '')
    .split('\n\n')
    .filter(chunk => AUDIT_NOTE_PATTERN.test(chunk.trim()))
    .map(chunk => chunk.trim().match(AUDIT_NOTE_CAPTURE))
    .filter(Boolean)
    .map(([, timestamp, message]) => ({ timestamp, message }));
}

/**
 * Split `applications.notes` into audit entries and operator free text.
 * Used by the Comments & Notes editor, which must show only the free text but
 * re-attach the audit entries verbatim when saving.
 *
 * @param {string|null|undefined} notes
 * @returns {{ auditChunks: string[], freeText: string }}
 */
export function splitProcessNotes(notes) {
  const chunks = String(notes || '').split('\n\n');
  return {
    auditChunks: chunks.filter(c => AUDIT_NOTE_PATTERN.test(c.trim())),
    freeText: chunks.filter(c => !AUDIT_NOTE_PATTERN.test(c.trim())).join('\n\n'),
  };
}

/**
 * Map an audit message to an event type, used to pick its icon and colour.
 *
 * Matching is substring-based on the lowercased message, so ORDER MATTERS and
 * new rules go at the end — see the lender questionnaire block below.
 *
 * @param {string} message
 * @returns {string} Event type key.
 */
export function classifyProcessNote(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('property corrected') || m.includes('correct property') || m.includes('correct primary')) return 'correction';
  if (m.includes('rush upgrade invoice') || m.includes('upgrade invoice')) return 'rush_invoice';
  if (m.includes('package upgraded') || m.includes('upgraded to rush') || m.includes('upgrade to rush')) return 'rush_upgrade';
  if (m.includes('application rejected') || m.includes('application cancelled')) return 'rejected';
  if (m.includes('task completed') || m.includes('was completed')) return 'task';
  if (m.includes('assigned to') || m.includes('re-assigned') || m.includes('reassigned')) return 'assigned';
  if (m.includes('invoice paid') || m.includes('payment received') || m.includes('payment confirmed')) return 'paid';
  if (m.includes('details updated') || m.includes('details was updated')) return 'details';
  if (m.includes('email sent') || m.includes('emailed to') || m.includes('resend') || m.includes('send to email')) return 'email';
  // Lender questionnaire milestones. These are LAST on purpose: the Step 3 note
  // is worded "...emailed to <address> by <admin>" so that it falls into the
  // 'email' rule above and looks identical to a resale certificate email entry.
  if (m.includes('lq file uploaded')) return 'lq_original';
  if (m.includes('lender questionnaire downloaded')) return 'lq_download';
  if (m.includes('lender questionnaire uploaded')) return 'lq_upload';
  if (m.includes('lender questionnaire edited')) return 'lq_edit';
  return 'default';
}
