/**
 * Fetch wrapper that adds X-Impersonate-User-ID when impersonation is active.
 * Use this for API calls from the applicant portal when admin is impersonating.
 */

import useImpersonationStore from '../stores/impersonationStore';

export function getImpersonationHeaders() {
  const { isImpersonating, impersonatedUser } = useImpersonationStore.getState();
  const headers = {};
  if (isImpersonating && impersonatedUser?.id) {
    headers['X-Impersonate-User-ID'] = impersonatedUser.id;
  }
  return headers;
}

/**
 * Same as fetch but merges in impersonation header when active.
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - fetch options (headers merged with impersonation header)
 * @returns {Promise<Response>}
 */
export async function fetchWithImpersonation(url, options = {}) {
  const impersonationHeaders = getImpersonationHeaders();
  const headers = {
    ...(options.headers || {}),
    ...impersonationHeaders,
  };
  return fetch(url, { ...options, headers });
}
