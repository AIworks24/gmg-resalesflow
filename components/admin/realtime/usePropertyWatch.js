import { useContext, useEffect } from 'react';
import { RealtimeContext } from './RealtimeContext';

/**
 * Subscribe the current screen to realtime events for these properties (e.g. another admin
 * publishing it or moving it to Draft). Safe to call with an empty/partial list.
 */
export default function usePropertyWatch(propertyIds) {
  const { watchProperties } = useContext(RealtimeContext);
  const key = [...new Set((propertyIds || []).filter(Boolean).map(String))].sort().join(',');

  useEffect(() => {
    if (!key) return undefined;
    return watchProperties(key.split(','));
  }, [key, watchProperties]);
}
