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
  const trimmed = email.trim();
  if (!trimmed) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
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

/**
 * Convert old format (separate name/email/phone fields) to new format (array of owner objects)
 * Handles backward compatibility with existing database structure
 * 
 * @param {string} name - Owner name (single or comma-separated)
 * @param {string|string[]} emails - Owner emails (comma-separated string or array)
 * @param {string} phone - Owner phone (single or comma-separated)
 * @returns {Array<{name: string, email: string, phone: string}>} Array of owner objects
 */
export function convertToOwnersArray(name, emails, phone) {
  const emailArray = parseEmails(emails);
  const nameArray = name ? name.split(',').map(n => n.trim()).filter(n => n) : [];
  const phoneArray = phone ? phone.split(',').map(p => p.trim()).filter(p => p) : [];
  
  // If we have emails, create owners based on email count
  if (emailArray.length > 0) {
    return emailArray.map((email, index) => ({
      name: nameArray[index] || nameArray[0] || '', // Use corresponding name or first name
      email: email,
      phone: phoneArray[index] || phoneArray[0] || phone || '' // Use corresponding phone or first phone
    }));
  }
  
  // If no emails but we have a name, create a single owner
  if (nameArray.length > 0 || name) {
    return [{
      name: nameArray[0] || name || '',
      email: emailArray[0] || '',
      phone: phoneArray[0] || phone || ''
    }];
  }
  
  // Default: return empty array or single empty owner
  return [];
}

/**
 * Convert new format (array of owner objects) to old format for database storage
 * Maintains backward compatibility with existing database schema
 * 
 * @param {Array<{name: string, email: string, phone: string}>} owners - Array of owner objects
 * @returns {{name: string, email: string, phone: string}} Object with old format fields
 */
export function convertFromOwnersArray(owners) {
  if (!owners || !Array.isArray(owners) || owners.length === 0) {
    return {
      name: '',
      email: '',
      phone: ''
    };
  }
  
  // For backward compatibility, we'll store:
  // - name: first owner's name (or comma-separated if multiple)
  // - email: comma-separated emails
  // - phone: first owner's phone (or comma-separated if multiple)
  const names = owners.map(o => o.name?.trim()).filter(n => n);
  const emails = owners.map(o => o.email?.trim()).filter(e => e);
  const phones = owners.map(o => o.phone?.trim()).filter(p => p);
  
  return {
    name: names.length > 0 ? names.join(', ') : '',
    email: formatEmailsForStorage(emails),
    phone: phones.length > 0 ? phones.join(', ') : ''
  };
}

/**
 * Validate owners array
 * 
 * @param {Array<{name: string, email: string, phone: string}>} owners - Array of owner objects
 * @param {boolean} required - Whether at least one owner is required
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateOwners(owners, required = false) {
  if (!owners || !Array.isArray(owners)) {
    return { valid: false, errors: ['Owners must be an array'] };
  }
  
  if (required && owners.length === 0) {
    return { valid: false, errors: ['At least one property owner is required'] };
  }
  
  const errors = [];
  const seenEmails = new Set();
  
  owners.forEach((owner, index) => {
    const ownerNum = index + 1;
    
    if (required && !owner.name?.trim()) {
      errors.push(`Owner ${ownerNum}: Name is required`);
    }
    
    if (required && !owner.email?.trim()) {
      errors.push(`Owner ${ownerNum}: Email is required`);
    } else if (owner.email?.trim()) {
      // Use isValidEmail directly for single email validation (better error messages)
      const trimmedEmail = owner.email.trim();
      if (!isValidEmail(trimmedEmail)) {
        errors.push(`Owner ${ownerNum}: Invalid email format`);
      } else {
        const normalized = normalizeEmail(trimmedEmail);
        if (seenEmails.has(normalized)) {
          errors.push(`Owner ${ownerNum}: Duplicate email address`);
        }
        seenEmails.add(normalized);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// CommonJS export for Node.js modules that use require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseEmails,
    formatEmailsForStorage,
    isValidEmail,
    validateEmails,
    normalizeEmail,
    emailInArray,
    convertToOwnersArray,
    convertFromOwnersArray,
    validateOwners
  };
}

