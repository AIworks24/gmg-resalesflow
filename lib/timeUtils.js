/**
 * Time Utilities - Reusable time formatting functions
 * 
 * IMPORTANT: All timestamps use SERVER TIME displayed in USER'S TIMEZONE
 * - Server time ensures accuracy (not affected by client clock)
 * - User timezone ensures proper display for each user
 * - Smart update intervals (frequent for recent, less frequent for old)
 * 
 * @param {Date} serverTime - Current server time (from useServerTime hook)
 */

/**
 * Format time as "time ago" (e.g., "8h ago", "2d ago")
 * This is the standard approach used by Facebook, Twitter, etc.
 * 
 * @param {string|Date} dateString - ISO date string or Date object
 * @param {Date} serverTime - Current server time (should be from useServerTime hook)
 * @returns {string} Formatted time ago string
 */
export const getTimeAgo = (dateString, serverTime = new Date()) => {
  if (!dateString) return '';
  
  try {
    // Parse the date string - handle various formats
    let date;
    
    // If it's already a Date object, use it
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      // Supabase returns ISO strings from TIMESTAMP WITH TIME ZONE
      // Ensure proper UTC parsing
      let isoString = dateString.trim();
      
      // If missing timezone indicator, assume UTC
      if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
          !isoString.endsWith('Z') && 
          !isoString.match(/[+-]\d{2}:\d{2}$/)) {
        isoString = isoString + 'Z';
      }
      
      date = new Date(isoString);
      
      // If parsing failed, try alternative formats
      if (isNaN(date.getTime())) {
        // Try parsing as timestamp
        const timestamp = Date.parse(dateString);
        if (!isNaN(timestamp)) {
          date = new Date(timestamp);
        } else {
          console.warn('Invalid date string:', dateString);
          return '';
        }
      }
    } else {
      console.warn('Invalid date value type:', typeof dateString);
      return '';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date after parsing:', dateString);
      return '';
    }
    
    // Calculate difference in milliseconds (timezone-independent)
    // Use server time for accurate calculations
    const diffInMilliseconds = serverTime.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMilliseconds / 1000);

    // Handle edge cases
    if (diffInSeconds < 0) {
      // Future date - shouldn't happen, but show "just now" to avoid confusion
      return 'just now';
    }
    
    if (diffInSeconds < 60) {
      return 'just now';
    }
    
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    }
    
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    }
    
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
    
    // For older than a week, show weeks
    const weeks = Math.floor(diffInSeconds / 604800);
    if (weeks < 4) {
      return `${weeks}w ago`;
    }
    
    const months = Math.floor(diffInSeconds / 2592000); // ~30 days
    if (months < 12) {
      return `${months}mo ago`;
    }
    
    const years = Math.floor(diffInSeconds / 31536000); // ~365 days
    return `${years}y ago`;
  } catch (error) {
    console.error('Error formatting time ago:', error, dateString);
    return '';
  }
};

/**
 * Calculate the optimal update interval based on time age
 * Facebook/Twitter use smart intervals:
 * - Recent (< 1 hour): Update every 30 seconds
 * - Recent (< 1 day): Update every 5 minutes
 * - Older: Update every hour or on visibility change
 * 
 * @param {string|Date} dateString - The date to calculate interval for
 * @returns {number} Interval in milliseconds
 */
export const getOptimalUpdateInterval = (dateString, serverTime = new Date()) => {
  if (!dateString) return 60000; // Default 1 minute
  
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return 60000;
    
    // Use server time for accurate calculations
    const diffInSeconds = Math.floor((serverTime.getTime() - date.getTime()) / 1000);
    
    // Recent (< 1 hour): Update every 30 seconds
    if (diffInSeconds < 3600) {
      return 30000; // 30 seconds
    }
    
    // Recent (< 1 day): Update every 5 minutes
    if (diffInSeconds < 86400) {
      return 300000; // 5 minutes
    }
    
    // Older: Update every hour
    return 3600000; // 1 hour
  } catch (error) {
    return 60000; // Default fallback
  }
};

// Note: React hooks are in hooks/useTimeAgo.js
// This file contains only pure utility functions

/**
 * Format date for display (fallback for very old dates)
 * Shows actual date instead of "time ago" for dates older than 1 year
 * Uses server time but displays in user's timezone
 * 
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    let date;
    
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      // Supabase returns ISO strings from TIMESTAMP WITH TIME ZONE
      // Ensure proper UTC parsing
      let isoString = dateString.trim();
      
      // If missing timezone indicator, assume UTC
      if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
          !isoString.endsWith('Z') && 
          !isoString.match(/[+-]\d{2}:\d{2}$/)) {
        isoString = isoString + 'Z';
      }
      
      date = new Date(isoString);
      
      if (isNaN(date.getTime())) {
        date = new Date(dateString);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date string:', dateString);
          return '';
        }
      }
    } else {
      console.warn('Invalid date value type:', typeof dateString);
      return '';
    }
    
    if (isNaN(date.getTime())) return '';
    
    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Format in user's timezone (date is already in UTC from server)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: userTimezone
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Format date and time for display
 * Uses server time but displays in user's timezone
 * 
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  
  try {
    let date;
    
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      // Supabase returns ISO strings from TIMESTAMP WITH TIME ZONE
      // Ensure proper UTC parsing
      let isoString = dateString.trim();
      
      // If missing timezone indicator, assume UTC
      if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
          !isoString.endsWith('Z') && 
          !isoString.match(/[+-]\d{2}:\d{2}$/)) {
        isoString = isoString + 'Z';
      }
      
      date = new Date(isoString);
      
      if (isNaN(date.getTime())) {
        date = new Date(dateString);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date string:', dateString);
          return '';
        }
      }
    } else {
      console.warn('Invalid date value type:', typeof dateString);
      return '';
    }
    
    if (isNaN(date.getTime())) return '';
    
    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Format in user's timezone (date is already in UTC from server)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone
    });
  } catch (error) {
    console.error('Error formatting date/time:', error);
    return '';
  }
};

/**
 * Format date and time with full timestamp
 * Uses server time but displays in user's timezone
 * 
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date and time string with seconds
 */
export const formatDateTimeFull = (dateString) => {
  if (!dateString) return '';
  
  try {
    let date;
    
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      // Supabase returns ISO strings from TIMESTAMP WITH TIME ZONE
      // Ensure proper UTC parsing
      let isoString = dateString.trim();
      
      // If missing timezone indicator, assume UTC
      if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
          !isoString.endsWith('Z') && 
          !isoString.match(/[+-]\d{2}:\d{2}$/)) {
        isoString = isoString + 'Z';
      }
      
      date = new Date(isoString);
      
      if (isNaN(date.getTime())) {
        date = new Date(dateString);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date string:', dateString);
          return '';
        }
      }
    } else {
      console.warn('Invalid date value type:', typeof dateString);
      return '';
    }
    
    if (isNaN(date.getTime())) return '';
    
    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Format in user's timezone (date is already in UTC from server)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: userTimezone
    });
  } catch (error) {
    console.error('Error formatting date/time:', error);
    return '';
  }
};

/**
 * Format date and time in a specific timezone (for server-side use)
 * This is used when generating PDFs on the server where we need to format
 * timestamps in the user's timezone rather than the server's timezone
 * 
 * @param {Date|string} date - Date object or ISO string
 * @param {string} timezone - IANA timezone string (e.g., 'America/New_York')
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date and time string
 */
export const formatDateTimeInTimezone = (date, timezone, options = {}) => {
  if (!date) return '';
  
  try {
    let dateObj;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      // Ensure proper UTC parsing
      let isoString = date.trim();
      if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
          !isoString.endsWith('Z') && 
          !isoString.match(/[+-]\d{2}:\d{2}$/)) {
        isoString = isoString + 'Z';
      }
      dateObj = new Date(isoString);
    } else {
      dateObj = new Date(date);
    }
    
    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date:', date);
      return '';
    }
    
    // Default format options
    const defaultOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC'
    };
    
    // Merge with provided options
    const formatOptions = { ...defaultOptions, ...options };
    
    return dateObj.toLocaleString('en-US', formatOptions);
  } catch (error) {
    console.error('Error formatting date/time in timezone:', error);
    return '';
  }
};