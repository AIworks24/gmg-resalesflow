/**
 * Short-lived signed connection tickets for the realtime server (party/server.js).
 *
 * Our API (/api/admin/realtime-ticket) signs a ticket after checking the Supabase session and
 * role; the realtime worker verifies it locally. The user's Supabase token never leaves our API
 * and the worker needs no database credentials.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload part)).
 * Pure Web Crypto — runs unchanged in Node 18+ and Cloudflare Workers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const DEFAULT_TICKET_TTL_SECONDS = 60;

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * @param {{ sub: string, role: string, name?: string }} claims
 * @param {string} secret
 * @param {number} [ttlSeconds]
 * @returns {Promise<string>}
 */
export async function signTicket(claims, secret, ttlSeconds = DEFAULT_TICKET_TTL_SECONDS) {
  if (!secret) throw new Error('Ticket secret is not configured');
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds })));
  const key = await importKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/**
 * Verifies signature (constant-time, via crypto.subtle.verify) and expiry.
 * @returns {Promise<object|null>} the claims, or null when invalid/expired
 */
export async function verifyTicket(ticket, secret) {
  if (!secret || typeof ticket !== 'string' || ticket.length > 2048) return null;
  const [payload, signature, extra] = ticket.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;

    const claims = JSON.parse(decoder.decode(fromBase64Url(payload)));
    if (typeof claims?.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Constant-time comparison of two strings (HMAC both with a throwaway key, then verify). */
export async function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const macA = await crypto.subtle.sign('HMAC', key, encoder.encode(a));
  return crypto.subtle.verify('HMAC', key, macA, encoder.encode(b));
}
