/**
 * Duplicate document-email guard (ClickUp 14ypaj0jz6v).
 *
 * Requesters were receiving the same documents email several times because staff re-clicked
 * "Send Email" after it had already gone out. Once a document email is recorded as sent
 * (email_completed_at on the application or property group), the send endpoints refuse to send
 * again unless the request carries `resend: true`, which the admin UI only sets after the user
 * confirms in ResendConfirmModal. Safe to import from both API routes and client components.
 *
 * Note: "Mark Done" on the email task also sets email_completed_at, so the wording is neutral.
 */

export const EMAIL_ALREADY_SENT_ERROR = 'EMAIL_ALREADY_SENT';

// email_completed_at is `timestamp without time zone` holding UTC, so PostgREST returns it with
// no offset ("2026-10-14T20:09:38.974"). Browsers would parse that as local time; force UTC.
const parseUtc = (value) =>
  new Date(typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? `${value}Z` : value);

export const formatSentAt = (sentAt) =>
  parseUtc(sentAt).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' ET';

/** 409 body returned by a send endpoint when the email task is already complete. */
export function alreadySentErrorBody(sentAt) {
  return {
    code: EMAIL_ALREADY_SENT_ERROR,
    error: `This email was already sent (or marked done) on ${formatSentAt(sentAt)}. Confirm to resend.`,
    sentAt,
  };
}

/** True when an endpoint should refuse the send: already complete and not an explicit resend. */
export function isBlockedResend(sentAt, body) {
  return !!sentAt && body?.resend !== true;
}

const parseEmailList = (value) =>
  (value || '').split(',').map((e) => e.trim()).filter(Boolean);

/**
 * Who a document email goes to, mirroring the send endpoints: Info Packet is addressed to the
 * buyer (requester CC'd); every other flow goes to the requester with buyers CC'd.
 * @returns {{ to: string, cc: string[] }}
 */
export function getDocumentEmailRecipients(application) {
  const buyers = parseEmailList(application?.buyer_email);
  const submitter = application?.submitter_email || '';
  if (application?.application_type === 'info_packet' && buyers.length > 0) {
    return { to: buyers[0], cc: [...buyers.slice(1), submitter].filter(Boolean) };
  }
  return { to: submitter, cc: buyers };
}
