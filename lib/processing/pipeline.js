/**
 * Per-application-type processing pipelines + retry/backoff policy.
 *
 * A pipeline is an ordered list of step keys (see lib/processing/steps.js). The worker
 * seeds one application_job_steps row per key and runs them in order, skipping any already
 * `succeeded`. Ordering matters: notify_owners always runs after status has advanced past
 * pending_payment (auto_submit / create_mc_groups), so createNotifications no longer skips.
 */

export const MAX_ATTEMPTS = 5;

// Exponential-ish backoff between job attempts. Index = attempt number - 1.
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 10_800_000]; // 1m, 5m, 15m, 1h, 3h

export function backoffMs(attempts) {
  const i = Math.max(0, Math.min(attempts - 1, BACKOFF_MS.length - 1));
  return BACKOFF_MS[i];
}

export function nextRunAt(attempts) {
  return new Date(Date.now() + backoffMs(attempts)).toISOString();
}

/**
 * Resolve the ordered step keys for an application.
 * @param {Object} p
 * @param {string} p.applicationType
 * @param {boolean} p.isMultiCommunity - true for MC properties (orthogonal to type)
 * @param {boolean} p.isFree - true for free flows (e.g. standard settlement_va) → no receipt
 * @returns {string[]}
 */
export function resolvePipeline({ applicationType, isMultiCommunity = false, isFree = false }) {
  const receipt = isFree ? [] : ['send_receipt'];

  if (applicationType === 'public_offering') {
    return [...receipt, 'deliver_documents'];
  }
  if (applicationType === 'info_packet') {
    return [...receipt, 'deliver_documents', 'notify_owners'];
  }
  if (applicationType === 'lender_questionnaire') {
    return [...receipt, 'mark_payment_confirmed'];
  }
  if (isMultiCommunity) {
    return [...receipt, 'create_mc_groups', 'notify_owners', 'auto_submit'];
  }
  // single_property, settlement_va, settlement_nc (single-community)
  return [...receipt, 'create_forms', 'auto_submit', 'notify_owners'];
}

export { STEP_HANDLERS } from './steps';
