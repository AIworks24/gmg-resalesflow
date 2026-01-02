/**
 * Load GMG company logo for PDF generation
 * Works both server-side and client-side
 */

/**
 * Load logo as base64 string
 * @returns {Promise<string|null>} - Base64 encoded logo or null
 */
export async function loadGMGLogo() {
  try {
    // Server-side: Load from assets folder
    if (typeof window === 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
      
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
      
      // Try alternative path
      const altPath = path.join(process.cwd(), 'public', 'company_logo.png');
      if (fs.existsSync(altPath)) {
        const logoBuffer = fs.readFileSync(altPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
      
      return null;
    }
    
    // Client-side: Load from public folder
    try {
      // Try public folder first (standard Next.js location)
      const response = await fetch('/company_logo.png');
      if (response.ok) {
        const blob = await response.blob();
        return await blobToBase64(blob);
      }
      
      // If not found, try alternative paths
      const altPaths = [
        '/assets/company_logo.png',
        '/company_logo_white.png' // Fallback to white logo if available
      ];
      
      for (const path of altPaths) {
        try {
          const altResponse = await fetch(path);
          if (altResponse.ok) {
            const blob = await altResponse.blob();
            return await blobToBase64(blob);
          }
        } catch (e) {
          // Continue to next path
        }
      }
      
      console.warn('Logo not found in any expected location');
      return null;
    } catch (error) {
      console.warn('Could not load logo from public folder:', error);
      return null;
    }
  } catch (error) {
    console.warn('Could not load GMG logo:', error);
    return null;
  }
}

/**
 * Convert blob to base64
 * @param {Blob} blob - Image blob
 * @returns {Promise<string>} - Base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

