import { createContext } from 'react';

/** watchProperties(ids) subscribes to property-{id} rooms and returns an unsubscribe function. */
export const RealtimeContext = createContext({ watchProperties: () => () => {} });
