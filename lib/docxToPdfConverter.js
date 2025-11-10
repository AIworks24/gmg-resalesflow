/**
 * DOCX to PDF Converter
 * Converts DOCX/DOC files to PDF using Mammoth (DOCX to HTML) and Puppeteer (HTML to PDF)
 */

const fs = require('fs');
const path = require('path');
const { htmlToPdf } = require('./puppeteerPdfService');

/**
 * Convert DOCX file to PDF
 * @param {string} docxFilePath - Path to the DOCX file
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function convertDocxToPdf(docxFilePath) {
  try {
    // Import mammoth dynamically
    const mammoth = require('mammoth');
    
    // Read DOCX file
    const docxBuffer = fs.readFileSync(docxFilePath);
    
    // Convert DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer: docxBuffer });
    const html = result.value;
    
    // Get any messages from conversion
    if (result.messages.length > 0) {
      console.warn('DOCX conversion messages:', result.messages);
    }
    
    // Create styled HTML content for PDF conversion
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            line-height: 1.6;
            color: #000;
        }
        p {
            margin: 10px 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 15px 0;
        }
        table, th, td {
            border: 1px solid #ddd;
        }
        th, td {
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        ul, ol {
            margin: 10px 0;
            padding-left: 30px;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        h1, h2, h3, h4, h5, h6 {
            margin: 15px 0 10px 0;
        }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
    
    // Convert HTML to PDF using Puppeteer
    const pdfBuffer = await htmlToPdf(htmlContent, {
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error converting DOCX to PDF:', error);
    throw new Error(`Failed to convert DOCX to PDF: ${error.message}`);
  }
}

/**
 * Convert DOC file to PDF
 * Note: DOC files (older Word format) are binary and more complex to convert.
 * This attempts to use LibreOffice if available, otherwise suggests conversion.
 * @param {string} docFilePath - Path to the DOC file
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function convertDocToPdf(docFilePath) {
  // Try to use LibreOffice if available (common on Linux servers)
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  const path = require('path');
  const fs = require('fs');
  
  try {
    // Check if LibreOffice is available
    await execPromise('which libreoffice || which soffice');
    
    // Create temporary directory for conversion
    const tempDir = path.join(process.cwd(), 'temp_conversion');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const outputDir = path.join(tempDir, Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Convert DOC to PDF using LibreOffice
    const outputFile = path.join(outputDir, 'output.pdf');
    await execPromise(
      `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${docFilePath}"`
    );
    
    // Check if PDF was created
    const pdfFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      throw new Error('LibreOffice conversion did not produce a PDF file');
    }
    
    const convertedPdfPath = path.join(outputDir, pdfFiles[0]);
    const pdfBuffer = fs.readFileSync(convertedPdfPath);
    
    // Cleanup temporary files
    try {
      fs.unlinkSync(convertedPdfPath);
      fs.rmdirSync(outputDir);
    } catch (cleanupError) {
      console.warn('Error cleaning up temporary files:', cleanupError);
    }
    
    return pdfBuffer;
  } catch (libreOfficeError) {
    // LibreOffice is not available or conversion failed
    console.warn('LibreOffice conversion failed or not available:', libreOfficeError.message);
    
    // Fallback: Provide helpful error message
    throw new Error(
      'DOC file conversion requires LibreOffice to be installed on the server. ' +
      'Please convert the DOC file to DOCX or PDF format before uploading. ' +
      'DOC files are in an older binary format that requires specialized conversion tools.'
    );
  }
}

/**
 * Convert Office document (DOCX/DOC) to PDF
 * @param {string} filePath - Path to the office document file
 * @param {string} fileExtension - File extension (.docx, .doc)
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function convertOfficeToPdf(filePath, fileExtension) {
  const ext = fileExtension.toLowerCase();
  
  if (ext === '.docx') {
    return await convertDocxToPdf(filePath);
  } else if (ext === '.doc') {
    return await convertDocToPdf(filePath);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Only .docx and .doc are supported.`);
  }
}

module.exports = {
  convertDocxToPdf,
  convertDocToPdf,
  convertOfficeToPdf
};

