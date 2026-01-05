/**
 * Label Formatter - Cleans and formats field labels for web forms
 * Handles concatenated words, excessive capitalization, and formatting issues
 */

/**
 * Format a label for web form display
 * @param {string} label - Raw label from PDF/AI
 * @returns {string} - Properly formatted label
 */
export function formatLabel(label) {
  if (!label || typeof label !== 'string') return label;
  
  let formatted = label.trim();
  
  // If label is all caps or mostly caps, convert to proper case
  const isAllCaps = formatted === formatted.toUpperCase() && formatted.length > 1;
  const capsRatio = (formatted.match(/[A-Z]/g) || []).length / formatted.length;
  const isMostlyCaps = capsRatio > 0.7 && formatted.length > 3;
  
  if (isAllCaps || isMostlyCaps) {
    // Convert to title case
    formatted = formatted.toLowerCase();
  }
  
  // Split concatenated words (e.g., "NAMEOFPURCHASER" -> "Name of Purchaser")
  // Look for patterns like: ALLCAPS followed by lowercase, or camelCase
  formatted = formatted
    // Split on capital letters that aren't at the start (camelCase)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split on sequences of uppercase letters followed by lowercase (e.g., "NAMEOF" -> "NAME OF")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    // Split on numbers
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2');
  
  // Handle common concatenated patterns
  const commonPatterns = [
    { pattern: /nameof/gi, replacement: 'Name of' },
    { pattern: /telephonenumber/gi, replacement: 'Telephone Number' },
    { pattern: /phonenumber/gi, replacement: 'Phone Number' },
    { pattern: /emailaddress/gi, replacement: 'Email Address' },
    { pattern: /streetaddress/gi, replacement: 'Street Address' },
    { pattern: /postalcode/gi, replacement: 'Postal Code' },
    { pattern: /zipcode/gi, replacement: 'Zip Code' },
    { pattern: /dateof/gi, replacement: 'Date of' },
    { pattern: /numberof/gi, replacement: 'Number of' },
    { pattern: /typeof/gi, replacement: 'Type of' },
    { pattern: /nameofpurchaser/gi, replacement: 'Name of Purchaser' },
    { pattern: /seller'spermit/gi, replacement: "Seller's Permit" },
    { pattern: /vendorsname/gi, replacement: "Vendor's Name" },
  ];
  
  commonPatterns.forEach(({ pattern, replacement }) => {
    formatted = formatted.replace(pattern, replacement);
  });
  
  // Convert to proper title case
  formatted = formatted
    .split(/\s+/)
    .map((word, index) => {
      // Skip articles, prepositions, and conjunctions (unless first word)
      const smallWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'];
      
      if (index > 0 && smallWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      
      // Capitalize first letter, lowercase the rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  // Handle special cases (proper nouns, acronyms)
  // Preserve common acronyms
  const acronyms = ['ID', 'SSN', 'EIN', 'TIN', 'PIN', 'VA', 'NC', 'CA', 'USA', 'CDTFA'];
  acronyms.forEach(acronym => {
    const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
    formatted = formatted.replace(regex, acronym);
  });
  
  // Handle possessive forms
  formatted = formatted.replace(/\b(\w+)'S\b/gi, "$1's");
  
  // Clean up multiple spaces
  formatted = formatted.replace(/\s+/g, ' ').trim();
  
  return formatted;
}

/**
 * Format multiple labels
 * @param {Array<string>} labels - Array of raw labels
 * @returns {Array<string>} - Array of formatted labels
 */
export function formatLabels(labels) {
  return labels.map(formatLabel);
}

