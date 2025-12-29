/**
 * Utility functions for handling property owner emails
 * Supports both single email (string) and multiple emails (array or comma-separated string)
 */

/**
 * Parse email value from database into array
 * Handles backward compatibility with single email strings
 * 
 * @param {string|string[]|null|undefined} emailValue - Email value from database
 * @returns {string[]} Array of email addresses
 */
export function parseEmails(emailValue) {
  if (!emailValue) return [];
  
  // If already an array, return it
  if (Array.isArray(emailValue)) {
    return emailValue.filter(email => email && email.trim());
  }
  
  // If string, split by comma and clean
  if (typeof emailValue === 'string') {
    return emailValue
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);
  }
  
  return [];
}

/**
 * Format email array for database storage
 * Stores as comma-separated string for backward compatibility
 * 
 * @param {string[]} emails - Array of email addresses
 * @returns {string} Comma-separated string of emails
 */
export function formatEmailsForStorage(emails) {
  if (!emails || !Array.isArray(emails)) return '';
  return emails
    .map(email => email.trim())
    .filter(email => email.length > 0)
    .join(',');
}

/**
 * Validate email format
 * 
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate array of emails
 * 
 * @param {string[]} emails - Array of email addresses
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateEmails(emails) {
  if (!emails || !Array.isArray(emails)) {
    return { valid: false, errors: ['Emails must be an array'] };
  }
  
  if (emails.length === 0) {
    return { valid: false, errors: ['At least one email is required'] };
  }
  
  const errors = [];
  const seen = new Set();
  
  emails.forEach((email, index) => {
    const trimmed = email.trim();
    
    if (!trimmed) {
      errors.push(`Email at position ${index + 1} is empty`);
      return;
    }
    
    if (!isValidEmail(trimmed)) {
      errors.push(`Email at position ${index + 1} is invalid: ${trimmed}`);
      return;
    }
    
    const lowerEmail = trimmed.toLowerCase();
    if (seen.has(lowerEmail)) {
      errors.push(`Duplicate email: ${trimmed}`);
      return;
    }
    
    seen.add(lowerEmail);
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalize email (lowercase, trim)
 * 
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Check if email matches any in the array (case-insensitive)
 * 
 * @param {string} email - Email to check
 * @param {string[]} emailArray - Array of emails to check against
 * @returns {boolean} True if email is in array
 */
export function emailInArray(email, emailArray) {
  if (!email || !emailArray || !Array.isArray(emailArray)) return false;
  const normalized = normalizeEmail(email);
  return emailArray.some(e => normalizeEmail(e) === normalized);
}

// CommonJS export for Node.js modules that use require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseEmails,
    formatEmailsForStorage,
    isValidEmail,
    validateEmails,
    normalizeEmail,
    emailInArray
  };
}

