/**
 * Puppeteer PDF Service - HTML to PDF conversion using Puppeteer
 * Replaces PDF.co HTML-to-PDF functionality
 * Configured for Vercel serverless deployment using puppeteer-core and @sparticuz/chromium
 * Based on: https://vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel
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
    // Configure Chromium for Vercel serverless environment
    // In production (Vercel), use @sparticuz/chromium
    // In development, use local Chrome/Chromium if available
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    
    let executablePath;
    let args;
    
    if (isProduction) {
      // Use @sparticuz/chromium for Vercel
      executablePath = await chromium.executablePath();
      args = chromium.args;
    } else {
      // Development: try to use local Chrome/Chromium
      // You can set PUPPETEER_EXECUTABLE_PATH in .env.local for local development
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
        (process.platform === 'win32' 
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/chromium-browser');
      
      args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ];
    }
    
    // Launch browser with optimized settings for server environments
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args
    });

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
