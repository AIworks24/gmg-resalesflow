/**
 * React PDF Service - PDF generation using @react-pdf/renderer
 * Replaces Puppeteer HTML-to-PDF functionality
 * 
 * Uses React components for PDF generation, which is more efficient
 * and works better in serverless environments like Vercel
 */

import React from 'react';
import ReactPDF from '@react-pdf/renderer';

/**
 * Convert a React PDF component to PDF buffer
 * @param {React.Component} Component - React PDF component (using @react-pdf/renderer components)
 * @param {Object} props - Props to pass to the component
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function componentToPdf(Component, props = {}, options = {}) {
  try {
    const element = React.createElement(Component, props);
    
    // Use renderToStream and convert to buffer
    // This is more reliable across different versions
    const stream = await ReactPDF.renderToStream(element);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF from component:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

/**
 * Convert HTML string to PDF buffer using react-pdf/renderer
 * Note: This is a simplified HTML-to-PDF converter that handles basic HTML structures
 * For complex HTML, consider creating dedicated React PDF components
 * 
 * @param {string} htmlContent - HTML content to convert
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function htmlToPdf(htmlContent, options = {}) {
  try {
    // Import the HTML to React PDF converter component
    const { HtmlToPdfDocument } = await import('./components/HtmlToPdfDocument.js');
    
    const pdfBuffer = await componentToPdf(HtmlToPdfDocument, {
      htmlContent,
      ...options
    });
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error converting HTML to PDF:', error);
    throw new Error(`Failed to convert HTML to PDF: ${error.message}`);
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

export {
  componentToPdf,
  htmlToPdf,
  htmlToPdfAndUpload
};

