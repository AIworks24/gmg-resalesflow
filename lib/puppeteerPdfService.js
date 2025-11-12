/**
 * Puppeteer PDF Service - HTML to PDF conversion using Puppeteer
 * Replaces PDF.co HTML-to-PDF functionality
 * Uses @sparticuz/chromium for Vercel serverless compatibility
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

/**
 * Convert HTML string to PDF buffer using Puppeteer
 * @param {string} htmlContent - HTML content to convert
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function htmlToPdf(htmlContent, options = {}) {
  let browser;
  
  try {
    // Configure for Vercel serverless environment
    const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    let launchOptions;
    
    if (isVercel) {
      // Use @sparticuz/chromium for Vercel serverless
      chromium.setGraphicsMode(false); // Disable graphics for serverless
      
      launchOptions = {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      };
    } else {
      // Local development - use regular Puppeteer or custom path
      launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-default-apps',
          '--disable-features=TranslateUI',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--disable-translate',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--safebrowsing-disable-auto-update',
          '--enable-automation',
          '--password-store=basic',
          '--use-mock-keychain'
        ]
      };

      // Use custom executable path if provided via environment variable
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    // Set content with proper encoding
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0', // Wait until network is idle
      timeout: 30000 // 30 second timeout
    });

    // Generate PDF with options
    const pdfOptions = {
      format: options.format || 'Letter',
      printBackground: options.printBackground !== false, // Default true
      margin: options.margin || {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      },
      ...options.pdfOptions // Allow custom PDF options
    };

    const pdfBuffer = await page.pdf(pdfOptions);
    
    return Buffer.from(pdfBuffer);
  } catch (error) {
    throw error;
  } finally {
    // Always close browser to free resources
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Convert HTML string to PDF and upload to Supabase storage
 * @param {string} htmlContent - HTML content to convert
 * @param {string} outputPdfPath - Path in Supabase storage
 * @param {Object} supabase - Supabase client instance
 * @param {string} bucketName - Supabase storage bucket name
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<{publicURL: string, data: object}>} - Upload result with public URL
 */
async function htmlToPdfAndUpload(htmlContent, outputPdfPath, supabase, bucketName, options = {}) {
  try {
    // Convert HTML to PDF
    const pdfBuffer = await htmlToPdf(htmlContent, options);
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(outputPdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
    
    return { 
      data, 
      publicURL: publicUrl 
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  htmlToPdf,
  htmlToPdfAndUpload
};

