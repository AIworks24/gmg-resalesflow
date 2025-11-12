/**
 * PDF Service using pdf-lib - HTML to PDF conversion
 * Replaces Puppeteer for Vercel compatibility
 * Uses pdf-lib to create PDFs programmatically from HTML-like content
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Convert HTML-like content to PDF buffer using pdf-lib
 * @param {string} htmlContent - HTML content (we'll extract text and structure)
 * @param {Object} options - Optional PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function htmlToPdf(htmlContent, options = {}) {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add a page (Letter size by default)
    const page = pdfDoc.addPage([612, 792]); // Letter size in points (8.5 x 11 inches)
    
    // Parse HTML content and extract text
    const textContent = extractTextFromHTML(htmlContent);
    
    // Set up fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Draw content on PDF
    let yPosition = 750; // Start near top (PDF coordinates start at bottom-left)
    const margin = 50;
    const lineHeight = 14;
    const fontSize = 10;
    const boldFontSize = 12;
    
    // Draw title/header
    if (textContent.title) {
      page.drawText(textContent.title, {
        x: margin,
        y: yPosition,
        size: boldFontSize + 2,
        font: helveticaBoldFont,
        color: rgb(0.09, 0.40, 0.20), // #166534 green
      });
      yPosition -= lineHeight * 2;
    }
    
    // Draw header info
    if (textContent.header) {
      textContent.header.forEach(line => {
        if (yPosition < 50) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = 750;
          page = newPage;
        }
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: helveticaFont,
        });
        yPosition -= lineHeight;
      });
      yPosition -= lineHeight;
    }
    
    // Draw sections
    if (textContent.sections) {
      textContent.sections.forEach(section => {
        if (yPosition < 100) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = 750;
          page = newPage;
        }
        
        // Section title
        if (section.title) {
          page.drawText(section.title, {
            x: margin,
            y: yPosition,
            size: boldFontSize,
            font: helveticaBoldFont,
            color: rgb(0.02, 0.59, 0.41), // #059669 green
          });
          yPosition -= lineHeight * 1.5;
        }
        
        // Section content
        if (section.content) {
          section.content.forEach(line => {
            if (yPosition < 50) {
              const newPage = pdfDoc.addPage([612, 792]);
              yPosition = 750;
              page = newPage;
            }
            
            // Check if line is a label (bold)
            if (line.includes(':')) {
              const [label, value] = line.split(':');
              const labelWidth = helveticaBoldFont.widthOfTextAtSize(label + ':', boldFontSize);
              
              page.drawText(label + ':', {
                x: margin,
                y: yPosition,
                size: boldFontSize,
                font: helveticaBoldFont,
                color: rgb(0.22, 0.25, 0.32), // #374151 gray
              });
              
              if (value) {
                page.drawText(value.trim(), {
                  x: margin + labelWidth + 10,
                  y: yPosition,
                  size: fontSize,
                  font: helveticaFont,
                });
              }
            } else {
              page.drawText(line, {
                x: margin,
                y: yPosition,
                size: fontSize,
                font: helveticaFont,
              });
            }
            yPosition -= lineHeight;
          });
          yPosition -= lineHeight;
        }
      });
    }
    
    // Draw footer
    if (textContent.footer && yPosition > 100) {
      yPosition = 50;
      textContent.footer.forEach(line => {
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize - 2,
          font: helveticaFont,
          color: rgb(0.42, 0.45, 0.50), // #6b7280 gray
        });
        yPosition -= lineHeight;
      });
    }
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF with pdf-lib:', error);
    throw error;
  }
}

/**
 * Extract structured text content from HTML
 * @param {string} htmlContent - HTML content string
 * @returns {Object} - Structured text content
 */
function extractTextFromHTML(htmlContent) {
  // Remove script and style tags
  let text = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Extract title (h1)
  const titleMatch = text.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : null;
  
  // Extract header info
  const headerInfoMatch = text.match(/<div[^>]*class="header-info"[^>]*>([\s\S]*?)<\/div>/i);
  const headerLines = headerInfoMatch 
    ? extractLinesFromHTML(headerInfoMatch[1])
    : [];
  
  // Extract sections
  const sections = [];
  const sectionMatches = text.matchAll(/<div[^>]*class="section"[^>]*>([\s\S]*?)<\/div>/gi);
  for (const match of sectionMatches) {
    const sectionHTML = match[1];
    const sectionTitleMatch = sectionHTML.match(/<div[^>]*class="section-title"[^>]*>(.*?)<\/div>/i);
    const sectionTitle = sectionTitleMatch ? cleanText(sectionTitleMatch[1]) : null;
    
    const sectionContent = extractLinesFromHTML(sectionHTML);
    sections.push({
      title: sectionTitle,
      content: sectionContent,
    });
  }
  
  // Extract footer
  const footerMatch = text.match(/<div[^>]*class="footer"[^>]*>([\s\S]*?)<\/div>/i);
  const footerLines = footerMatch 
    ? extractLinesFromHTML(footerMatch[1])
    : [];
  
  return {
    title,
    header: headerLines,
    sections,
    footer: footerLines,
  };
}

/**
 * Extract text lines from HTML content
 * @param {string} html - HTML content
 * @returns {Array<string>} - Array of text lines
 */
function extractLinesFromHTML(html) {
  const lines = [];
  
  // Extract field labels and values
  const fieldMatches = html.matchAll(/<div[^>]*class="field"[^>]*>([\s\S]*?)<\/div>/gi);
  for (const match of fieldMatches) {
    const fieldHTML = match[1];
    const labelMatch = fieldHTML.match(/<span[^>]*class="label"[^>]*>(.*?)<\/span>/i);
    const valueMatch = fieldHTML.match(/<span[^>]*class="value"[^>]*>(.*?)<\/span>/i);
    
    if (labelMatch && valueMatch) {
      lines.push(`${cleanText(labelMatch[1])}: ${cleanText(valueMatch[1])}`);
    } else {
      // Fallback: extract all text
      const text = cleanText(fieldHTML);
      if (text) lines.push(text);
    }
  }
  
  // Extract paragraph text
  const pMatches = html.matchAll(/<p[^>]*>(.*?)<\/p>/gi);
  for (const match of pMatches) {
    const text = cleanText(match[1]);
    if (text && !text.match(/^<strong>/)) { // Skip if it's part of a field
      lines.push(text);
    }
  }
  
  return lines.filter(line => line.trim().length > 0);
}

/**
 * Clean HTML tags and decode entities
 * @param {string} html - HTML string
 * @returns {string} - Clean text
 */
function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
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

