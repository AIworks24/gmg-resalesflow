/**
 * Realtime event contract, shared by the publisher (our API) and the realtime worker.
 * The worker re-validates and re-serialises only whitelisted fields before broadcasting.
 */

export const ROOM_PATTERN = /^(property|application)-(\d{1,10})$/;

export const EVENT_TYPES = {
  PROPERTY_STATUS_CHANGED: 'property_status_changed',
};

const PROPERTY_STATUSES = new Set(['draft', 'published']);
const MAX_TEXT = 200;

export const propertyRoom = (propertyId) => `property-${propertyId}`;

/** @returns {{ kind: 'property'|'application', id: number } | null} */
export function parseRoom(room) {
  const match = ROOM_PATTERN.exec(room || '');
  return match ? { kind: match[1], id: Number(match[2]) } : null;
}

const cleanText = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');

/**
 * Validate an event for a room. Returns a sanitised copy (only known fields) or null.
 * @param {unknown} event
 * @param {string} room
 */
export function sanitizeEvent(event, room) {
  const target = parseRoom(room);
  if (!target || !event || typeof event !== 'object') return null;

  if (event.type === EVENT_TYPES.PROPERTY_STATUS_CHANGED) {
    const propertyId = Number(event.propertyId);
    if (target.kind !== 'property' || propertyId !== target.id) return null;
    if (!PROPERTY_STATUSES.has(event.status)) return null;
    if (typeof event.actorId !== 'string' || !event.actorId) return null;

    const at = new Date(event.at);
    return {
      type: event.type,
      propertyId,
      propertyName: cleanText(event.propertyName),
      status: event.status,
      actorId: event.actorId.slice(0, 64),
      actorName: cleanText(event.actorName),
      at: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
    };
  }

  return null;
}
