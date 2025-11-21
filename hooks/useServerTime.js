import { useState, useEffect, useRef } from 'react';

/**
 * React hook to get and maintain server time
 * Fetches server time on mount and syncs periodically
 * 
 * This ensures all timestamps use server time (not client time)
 * while still displaying in the user's timezone
 * 
 * @returns {Date} Current server time as a Date object
 * 
 * @example
 *   const serverTime = useServerTime();
 *   const timeAgo = getTimeAgo(dateString, serverTime);
 */
export const useServerTime = () => {
  const [serverTime, setServerTime] = useState(null);
  const [offset, setOffset] = useState(0); // Offset between server and client time
  const intervalRef = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    let mounted = true;

    const fetchServerTime = async () => {
      try {
        const clientTimeBefore = Date.now();
        const response = await fetch('/api/server-time');
        
        if (!response.ok) {
          throw new Error('Failed to fetch server time');
        }
        
        const data = await response.json();
        const clientTimeAfter = Date.now();
        
        // Calculate network latency (half of round trip)
        const networkLatency = (clientTimeAfter - clientTimeBefore) / 2;
        
        // Calculate server time accounting for latency
        const serverTimestamp = new Date(data.serverTime).getTime() + networkLatency;
        const clientTimestamp = clientTimeBefore + networkLatency;
        
        // Calculate offset between server and client
        const timeOffset = serverTimestamp - clientTimestamp;
        
        if (mounted) {
          setOffset(timeOffset);
          setServerTime(new Date(serverTimestamp));
          isInitialized.current = true;
        }
      } catch (error) {
        console.error('Error fetching server time:', error);
        // Fallback to client time if server time fetch fails
        if (mounted && !isInitialized.current) {
          setServerTime(new Date());
          setOffset(0);
          isInitialized.current = true;
        }
      }
    };

    // Fetch server time immediately
    fetchServerTime();

    // Sync with server every 5 minutes to account for clock drift
    intervalRef.current = setInterval(() => {
      fetchServerTime();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Return current server time (client time + offset)
  // This updates every render, but offset is only updated periodically
  if (!serverTime || offset === 0) {
    // Return client time as fallback until server time is fetched
    // This ensures we always have a valid Date object
    return new Date();
  }

  // Return server time by adding offset to current client time
  // This gives us accurate server time without constant API calls
  // The offset accounts for the difference between server and client clocks
  return new Date(Date.now() + offset);
};

/**
 * Get server time synchronously (uses cached offset)
 * Use this when you need server time but can't use the hook
 * 
 * @param {number} offset - Time offset from useServerTime hook
 * @returns {Date} Current server time
 */
export const getServerTime = (offset = 0) => {
  return new Date(Date.now() + offset);
};

