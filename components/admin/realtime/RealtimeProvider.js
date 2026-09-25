import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import { RealtimeContext } from './RealtimeContext';
import RealtimeToasts from './RealtimeToasts';
import { EVENT_TYPES, propertyRoom } from '../../../lib/realtime/events';

/**
 * Realtime "who did what" notifications for the admin portal (server: party/server.js).
 *
 * Screens call usePropertyWatch(ids). The provider keeps one socket per watched room,
 * reference-counted across screens, and authenticates each (re)connect with a short-lived ticket
 * from /api/admin/realtime-ticket. Data refresh stays on Supabase Realtime, so when
 * NEXT_PUBLIC_REALTIME_HOST is unset this provider does nothing.
 */

const REALTIME_HOST = process.env.NEXT_PUBLIC_REALTIME_HOST;
const MAX_TOASTS = 3;

async function fetchTicket() {
  const res = await fetch('/api/admin/realtime-ticket', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`realtime ticket ${res.status}`);
  const { ticket } = await res.json();
  return ticket;
}

export default function RealtimeProvider({ children }) {
  const socketsRef = useRef(new Map()); // room -> { socket, count }
  const [toasts, setToasts] = useState([]);

  const handleMessage = useCallback((message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    if (event?.type !== EVENT_TYPES.PROPERTY_STATUS_CHANGED) return;

    const key = `${event.propertyId}:${event.status}:${event.at}`;
    setToasts((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { ...event, key }].slice(-MAX_TOASTS)));
  }, []);

  const watchProperties = useCallback((propertyIds) => {
    if (!REALTIME_HOST) return () => {};
    const sockets = socketsRef.current;
    const rooms = propertyIds.map(propertyRoom);

    rooms.forEach((room) => {
      const entry = sockets.get(room);
      if (entry) {
        entry.count += 1;
        return;
      }
      const socket = new PartySocket({
        host: REALTIME_HOST,
        room,
        // Fresh short-lived ticket on every (re)connect
        query: async () => ({ ticket: await fetchTicket() }),
      });
      socket.addEventListener('message', handleMessage);
      sockets.set(room, { socket, count: 1 });
    });

    return () => {
      rooms.forEach((room) => {
        const entry = sockets.get(room);
        if (!entry) return;
        entry.count -= 1;
        if (entry.count <= 0) {
          entry.socket.removeEventListener('message', handleMessage);
          entry.socket.close();
          sockets.delete(room);
        }
      });
    };
  }, [handleMessage]);

  // Close everything when leaving the admin area
  useEffect(() => {
    const sockets = socketsRef.current;
    return () => {
      sockets.forEach(({ socket }) => socket.close());
      sockets.clear();
    };
  }, []);

  const dismiss = useCallback((key) => setToasts((prev) => prev.filter((t) => t.key !== key)), []);
  const contextValue = useMemo(() => ({ watchProperties }), [watchProperties]);

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
      {toasts.length > 0 && <RealtimeToasts toasts={toasts} onDismiss={dismiss} />}
    </RealtimeContext.Provider>
  );
}
