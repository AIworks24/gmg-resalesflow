import { useState, useEffect } from 'react';
import { getTimeAgo, getOptimalUpdateInterval } from '../lib/timeUtils';
import { useServerTime } from './useServerTime';

/**
 * React hook for "time ago" display with smart update intervals
 * 
 * IMPORTANT: Uses SERVER TIME (not client time) for accurate timestamps
 * Displays in user's timezone automatically
 * 
 * This hook automatically updates the time display based on how old the date is:
 * - Recent (< 1 hour): Updates every 30 seconds
 * - Recent (< 1 day): Updates every 5 minutes  
 * - Older: Updates every hour
 * 
 * This is the same approach used by Facebook, Twitter, and other major platforms.
 * 
 * @param {string|Date} dateString - The date to format as "time ago"
 * @returns {string} Formatted time ago string (e.g., "8h ago", "2d ago")
 * 
 * @example
 *   const timeAgo = useTimeAgo(notification.created_at);
 *   <span>{timeAgo}</span>
 */
export const useTimeAgo = (dateString) => {
  const serverTime = useServerTime(); // Get server time
  const [timeAgo, setTimeAgo] = useState(() => {
    if (!dateString) return '';
    return getTimeAgo(dateString, serverTime);
  });
  
  useEffect(() => {
    if (!dateString) {
      setTimeAgo('');
      return;
    }
    
    // Calculate optimal interval based on date age
    // This ensures we don't waste resources updating old dates frequently
    const interval = getOptimalUpdateInterval(dateString, serverTime);
    
    // Update immediately on mount
    setTimeAgo(getTimeAgo(dateString, serverTime));
    
    // Set up interval for updates
    const timer = setInterval(() => {
      // Get fresh server time on each update
      const currentServerTime = new Date(Date.now() + (serverTime.getTime() - Date.now()));
      setTimeAgo(getTimeAgo(dateString, currentServerTime));
    }, interval);
    
    return () => clearInterval(timer);
  }, [dateString, serverTime]);
  
  return timeAgo;
};

/**
 * React hook for multiple "time ago" displays
 * More efficient when you have many timestamps to display
 * 
 * IMPORTANT: Uses SERVER TIME (not client time) for accurate timestamps
 * 
 * @param {Array<string|Date>} dateStrings - Array of dates to format
 * @returns {Array<string>} Array of formatted time ago strings
 * 
 * @example
 *   const timesAgo = useMultipleTimeAgo([
 *     notification1.created_at,
 *     notification2.created_at
 *   ]);
 */
export const useMultipleTimeAgo = (dateStrings) => {
  const serverTime = useServerTime(); // Get server time
  const [timesAgo, setTimesAgo] = useState(() => {
    if (!dateStrings || !Array.isArray(dateStrings)) return [];
    return dateStrings.map(date => date ? getTimeAgo(date, serverTime) : '');
  });
  
  useEffect(() => {
    if (!dateStrings || !Array.isArray(dateStrings)) {
      setTimesAgo([]);
      return;
    }
    
    // Find the most recent date to determine update interval
    const validDates = dateStrings.filter(d => d);
    if (validDates.length === 0) {
      setTimesAgo(dateStrings.map(() => ''));
      return;
    }
    
    // Use the most recent date to determine update frequency
    const mostRecent = validDates.reduce((latest, current) => {
      const latestDate = latest instanceof Date ? latest : new Date(latest);
      const currentDate = current instanceof Date ? current : new Date(current);
      return currentDate > latestDate ? current : latest;
    });
    
    const interval = getOptimalUpdateInterval(mostRecent, serverTime);
    
    // Update immediately
    setTimesAgo(dateStrings.map(date => date ? getTimeAgo(date, serverTime) : ''));
    
    // Set up interval
    const timer = setInterval(() => {
      // Get fresh server time on each update
      const currentServerTime = new Date(Date.now() + (serverTime.getTime() - Date.now()));
      setTimesAgo(dateStrings.map(date => date ? getTimeAgo(date, currentServerTime) : ''));
    }, interval);
    
    return () => clearInterval(timer);
  }, [dateStrings, serverTime]);
  
  return timesAgo;
};




