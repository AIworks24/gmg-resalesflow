/**
 * Puppeteer PDF Service - HTML to PDF conversion using Puppeteer
 * Replaces PDF.co HTML-to-PDF functionality
 * 
 * Supports both local development (using puppeteer) and Vercel deployment
 * (using puppeteer-core with @sparticuz/chromium-min)
 */

// Detect if we're running on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// Use puppeteer-core on Vercel, regular puppeteer locally
let puppeteer;
let chromium;

if (isVercel) {
  // On Vercel, use puppeteer-core with @sparticuz/chromium-min
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium-min');
} else {
  // Local development - use regular puppeteer with bundled Chromium
  puppeteer = require('puppeteer');
}

/**
 * Convert HTML string to PDF buffer using Puppeteer
 * @param {string} htmlContent - HTML content to convert
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function htmlToPdf(htmlContent, options = {}) {
  let browser;
  
  try {
    // Prepare launch options
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };

    // On Vercel, use Chromium from @sparticuz/chromium-min
    if (isVercel) {
      // Get executable path - this will download the binary if needed
      // If CHROMIUM_REMOTE_EXEC_PATH is set, use it; otherwise let chromium download automatically
      const chromiumPath = process.env.CHROMIUM_REMOTE_EXEC_PATH 
        ? await chromium.executablePath(process.env.CHROMIUM_REMOTE_EXEC_PATH)
        : await chromium.executablePath();
      
      launchOptions.executablePath = chromiumPath;
      
      // Use Chromium's recommended args for serverless environments
      launchOptions.args = chromium.args;
      
      // Set default viewport from Chromium
      launchOptions.defaultViewport = chromium.defaultViewport;
      launchOptions.headless = chromium.headless;
    } else {
      // Local development - use regular puppeteer or custom path if set
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
    }

    // Launch browser with optimized settings for server environments
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

