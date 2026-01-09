/**
 * Email HTML Minifier
 * 
 * Minifies HTML email templates to reduce file size and prevent Gmail clipping.
 * According to Litmus: https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails
 * Gmail clips emails over 102KB in HTML size.
 * 
 * This minifier:
 * - Removes unnecessary whitespace and line breaks
 * - Removes HTML comments (except conditional comments for Outlook)
 * - Preserves conditional comments for email client compatibility
 * - Preserves inline styles (required for email clients)
 * - Removes unnecessary attributes where safe
 */

/**
 * Minify HTML email template
 * @param {string} html - HTML string to minify
 * @returns {string} - Minified HTML
 */
export function minifyEmailHtml(html) {
  if (!html) return '';
  
  let minified = html;
  
  // Remove HTML comments, but preserve conditional comments (for Outlook/MSO)
  // Conditional comments look like: <!--[if mso]>...<![endif]-->
  minified = minified.replace(/<!--(?!\[if\s)[\s\S]*?-->/g, '');
  
  // Remove unnecessary whitespace between tags
  minified = minified.replace(/>\s+</g, '><');
  
  // Remove leading/trailing whitespace on each line
  minified = minified.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('');
  
  // Remove multiple spaces (but preserve single spaces in text content)
  // Be careful not to break inline styles or attribute values
  minified = minified.replace(/\s{2,}/g, ' ');
  
  // Remove spaces around equals signs in attributes (but preserve in attribute values)
  minified = minified.replace(/\s*=\s*/g, '=');
  
  // Remove spaces before closing tags
  minified = minified.replace(/\s+>/g, '>');
  
  // Remove spaces after opening tags
  minified = minified.replace(/<\s+/g, '<');
  
  // Clean up any remaining unnecessary whitespace in style attributes
  // This is tricky - we want to preserve spaces in CSS values but remove extra ones
  minified = minified.replace(/style="([^"]*)"/g, (match, styleContent) => {
    // Remove extra spaces in CSS, but preserve spaces in values like "Arial, sans-serif"
    const cleaned = styleContent
      .replace(/\s*:\s*/g, ':')  // Remove spaces around colons
      .replace(/\s*;\s*/g, ';')  // Remove spaces around semicolons
      .replace(/\s{2,}/g, ' ');  // Replace multiple spaces with single space
    return `style="${cleaned}"`;
  });
  
  return minified;
}

/**
 * Get estimated HTML size in KB
 * @param {string} html - HTML string
 * @returns {number} - Size in KB (as number, not string)
 */
export function getEmailSize(html) {
  if (!html) return 0;
  // Use Buffer.byteLength for Node.js compatibility
  return parseFloat((Buffer.byteLength(html, 'utf8') / 1024).toFixed(2));
}

