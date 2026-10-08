import { parseRoom, sanitizeEvent, EVENT_TYPES } from '../lib/realtime/events';

const validEvent = {
  type: EVENT_TYPES.PROPERTY_STATUS_CHANGED,
  propertyId: 42,
  propertyName: 'Oak Ridge HOA',
  status: 'draft',
  actorId: 'user-1',
  actorName: 'Jane Cox',
  at: '2026-09-25T12:00:00.000Z',
};

describe('parseRoom', () => {
  it('accepts known room shapes', () => {
    expect(parseRoom('property-42')).toEqual({ kind: 'property', id: 42 });
    expect(parseRoom('application-7')).toEqual({ kind: 'application', id: 7 });
  });

  it('rejects anything else', () => {
    ['', 'property-', 'property-abc', 'admin', 'property-1/../x', 'property-12345678901'].forEach((room) => {
      expect(parseRoom(room)).toBeNull();
    });
  });
});

describe('sanitizeEvent', () => {
  it('returns only whitelisted fields for a valid event', () => {
    expect(sanitizeEvent({ ...validEvent, injected: '<script>' }, 'property-42')).toEqual(validEvent);
  });

  it('rejects unknown types and statuses', () => {
    expect(sanitizeEvent({ ...validEvent, type: 'drop_tables' }, 'property-42')).toBeNull();
    expect(sanitizeEvent({ ...validEvent, status: 'deleted' }, 'property-42')).toBeNull();
  });

  it('rejects an event whose property does not match the room', () => {
    expect(sanitizeEvent(validEvent, 'property-43')).toBeNull();
    expect(sanitizeEvent(validEvent, 'application-42')).toBeNull();
  });

  it('requires an actor id', () => {
    expect(sanitizeEvent({ ...validEvent, actorId: '' }, 'property-42')).toBeNull();
  });

  it('caps long names', () => {
    const long = 'x'.repeat(500);
    const event = sanitizeEvent({ ...validEvent, actorName: long, propertyName: long }, 'property-42');
    expect(event.actorName).toHaveLength(200);
    expect(event.propertyName).toHaveLength(200);
  });
});
