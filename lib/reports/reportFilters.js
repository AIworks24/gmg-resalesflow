/**
 * Shared scoping rules for the admin Reports feature.
 *
 * Keep reporting policy here rather than repeating raw `.neq()` calls at each
 * call site, so a new report inherits the same rules by importing them.
 */

/**
 * Drafts are applications the requester started but never submitted. They are
 * work-in-progress, not business activity, so no report counts them — not in
 * KPIs, not in revenue, not in exports.
 *
 * Note this is deliberately independent of `payment_status`: a draft can carry
 * a completed payment (an abandoned form after checkout), and those must still
 * stay out of revenue reporting.
 *
 * Apply to any `applications` query backing a report.
 */
export function excludeDrafts(query) {
  return query.neq('status', 'draft');
}

/**
 * Bump when a scoping rule here changes, so previously cached report payloads
 * built under the old rules are not served from Redis after a deploy.
 */
export const REPORT_SCOPE_VERSION = 'v2-nodraft';
