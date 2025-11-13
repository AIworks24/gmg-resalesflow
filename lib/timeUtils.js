/**
 * Time Utilities - Reusable time formatting functions
 * 
 * Best Practice Approach (used by Facebook, Twitter, etc.):
 * - Client-side calculation (no server load)
 * - Smart update intervals (frequent for recent, less frequent for old)
 * - No cron jobs needed (pure client-side)
 * 
 * Why not cron jobs?
 * - Cron jobs are for server-side scheduled tasks
 * - Time ago is a display concern, not a data concern
 * - Client-side is more efficient and responsive
 * - Works offline, no server round-trips needed
 */

/**
 * Format time as "time ago" (e.g., "8h ago", "2d ago")
 * This is the standard approach used by Facebook, Twitter, etc.
 * 
 * @param {string|Date} dateString - ISO date string or Date object
 * @param {Date} currentTime - Current time (for testing/consistency)
 * @returns {string} Formatted time ago string
 */
export const getTimeAgo = (dateString, currentTime = new Date()) => {
  if (!dateString) return '';
  
  try {
    // Parse the date string - handle various formats
    let date;
    
    // If it's already a Date object, use it
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      // Try parsing as ISO string (most common format from Supabase)
      date = new Date(dateString);
      
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
    const diffInMilliseconds = currentTime.getTime() - date.getTime();
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
export const getOptimalUpdateInterval = (dateString) => {
  if (!dateString) return 60000; // Default 1 minute
  
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return 60000;
    
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
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
 * 
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Format date and time for display
 * 
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date/time:', error);
    return '';
  }
};

