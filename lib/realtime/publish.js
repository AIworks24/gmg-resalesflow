/**
 * Server-side publisher for realtime events (worker: party/server.js).
 * Best effort: never throws, and is a no-op when the realtime server isn't configured.
 *
 * Env: REALTIME_HOST (e.g. gmg-resalesflow-party-test.<account>.workers.dev or localhost:1999),
 *      REALTIME_PUBLISH_SECRET (must match the worker's secret).
 */
import { EVENT_TYPES, propertyRoom } from './events';

const PUBLISH_TIMEOUT_MS = 2000;

export function realtimeHttpBase(host) {
  if (!host) return null;
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return `${isLocal ? 'http' : 'https'}://${host}`;
}

async function publishRoomEvent(room, event) {
  const baseUrl = realtimeHttpBase(process.env.REALTIME_HOST);
  const secret = process.env.REALTIME_PUBLISH_SECRET;
  if (!baseUrl || !secret) return false;

  try {
    const res = await fetch(`${baseUrl}/parties/main/${room}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`[realtime] publish to ${room} failed: ${res.status}`);
    return res.ok;
  } catch (error) {
    console.warn(`[realtime] publish to ${room} failed:`, error.message);
    return false;
  }
}

/** A property was published or moved to draft — notify admins working on it. */
export function publishPropertyStatusChanged({ propertyId, propertyName, status, actorId, actorName }) {
  return publishRoomEvent(propertyRoom(propertyId), {
    type: EVENT_TYPES.PROPERTY_STATUS_CHANGED,
    propertyId,
    propertyName,
    status,
    actorId,
    actorName,
    at: new Date().toISOString(),
  });
}
