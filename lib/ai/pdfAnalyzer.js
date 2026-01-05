/**
 * PDF Analyzer Service - Extract fields from PDF forms
 * Uses pdf-lib to extract form fields and metadata
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Extract PDF form fields and metadata
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} - Extracted fields and metadata
 */
export async function extractPDFFields(pdfBuffer) {
  try {
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    // Get page count
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    
    // Extract field information
    const extractedFields = fields.map((field, index) => {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      
      // Get field type string
      let type = 'text';
      if (fieldType.includes('CheckBox')) type = 'checkbox';
      else if (fieldType.includes('RadioGroup')) type = 'radio';
      else if (fieldType.includes('Dropdown')) type = 'select';
      else if (fieldType.includes('TextField')) type = 'text';
      
      // Try to get field value (if any)
      let value = null;
      try {
        if (type === 'checkbox') {
          value = field.isChecked();
        } else if (type === 'radio') {
          value = field.getSelected();
        } else if (type === 'select') {
          value = field.getSelected();
        } else if (type === 'text') {
          value = field.getText();
        }
      } catch (e) {
        // Field might not have a value, that's okay
      }
      
      return {
        id: `field-${index + 1}`,
        name: fieldName,
        type: type,
        pdfType: fieldType,
        value: value,
        required: false, // pdf-lib doesn't provide this, would need to check PDF structure
        page: 1 // Default to page 1, could be enhanced to detect actual page
      };
    });
    
    // Extract metadata
    const metadata = {
      totalPages: totalPages,
      totalFields: extractedFields.length,
      formTitle: pdfDoc.getTitle() || 'Untitled Form',
      author: pdfDoc.getAuthor() || null,
      subject: pdfDoc.getSubject() || null,
      creator: pdfDoc.getCreator() || null,
      producer: pdfDoc.getProducer() || null,
      creationDate: pdfDoc.getCreationDate() || null,
      modificationDate: pdfDoc.getModificationDate() || null
    };
    
    return {
      fields: extractedFields,
      metadata: metadata
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract PDF fields: ${error.message}`);
  }
}

/**
 * Get PDF metadata only (faster than full extraction)
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} - PDF metadata
 */
export async function getPDFMetadata(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    return {
      totalPages: pages.length,
      title: pdfDoc.getTitle() || 'Untitled Form',
      author: pdfDoc.getAuthor() || null,
      subject: pdfDoc.getSubject() || null,
      creationDate: pdfDoc.getCreationDate() || null,
      modificationDate: pdfDoc.getModificationDate() || null
    };
  } catch (error) {
    throw new Error(`Failed to get PDF metadata: ${error.message}`);
  }
}

/**
 * Validate PDF file
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @returns {Promise<boolean>} - True if valid PDF
 */
export async function validatePDF(pdfBuffer) {
  try {
    // Check if it starts with PDF magic bytes
    const header = pdfBuffer.slice(0, 4);
    const pdfHeader = Buffer.from('%PDF');
    
    if (!header.equals(pdfHeader)) {
      return false;
    }
    
    // Try to load it
    await PDFDocument.load(pdfBuffer);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get PDF file size in bytes
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @returns {number} - File size in bytes
 */
export function getPDFSize(pdfBuffer) {
  if (Buffer.isBuffer(pdfBuffer)) {
    return pdfBuffer.length;
  }
  if (pdfBuffer instanceof Uint8Array) {
    return pdfBuffer.length;
  }
  return 0;
}

/**
 * Convert PDF page to image buffer using pdfjs-dist
 * Note: Requires 'canvas' package to be installed (npm install canvas)
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @param {number} pageNum - Page number (1-indexed)
 * @param {number} scale - Scale factor for image (default: 2.0 for better quality)
 * @returns {Promise<Buffer>} - PNG image buffer
 */
export async function convertPDFPageToImage(pdfBuffer, pageNum = 1, scale = 2.0) {
  try {
    // Try to import canvas (use require for native modules in Node.js)
    let createCanvas;
    try {
      // Use require for native modules in Node.js environment
      if (typeof window === 'undefined') {
        // Node.js environment - use require
        const canvasModule = require('canvas');
        createCanvas = canvasModule.createCanvas;
      } else {
        // Browser environment - not supported
        throw new Error('Canvas is not available in browser environment');
      }
    } catch (canvasError) {
      if (canvasError.code === 'MODULE_NOT_FOUND' || canvasError.message.includes('Cannot find module')) {
        throw new Error('Canvas package not installed. Please run: npm install canvas');
      }
      throw canvasError;
    }
    
    // Dynamic import to avoid SSR issues
    // Try using the Node.js compatible build
    let pdfjsLib;
    try {
      // Try legacy build first
      pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (e) {
      // Fallback to regular build
      pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
    }
    
    // Set worker source - required by pdfjs-dist
    // In Node.js, we need to read the worker file and use it as a data URL or inline
    if (typeof window === 'undefined') {
      // Node.js environment - read worker file and use as data URL
      try {
        const path = require('path');
        const fs = require('fs');
        
        // Find the worker file
        let workerPath = null;
        try {
          const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
          const candidatePath = path.join(pdfjsDistPath, 'legacy/build/pdf.worker.mjs');
          if (fs.existsSync(candidatePath)) {
            workerPath = candidatePath;
          }
        } catch (e) {
          // Try from process.cwd()
          const candidatePath = path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
          if (fs.existsSync(candidatePath)) {
            workerPath = candidatePath;
          }
        }
        
        // Try to use minified worker first (smaller, faster to load)
        const minWorkerPath = workerPath ? workerPath.replace('.mjs', '.min.mjs') : path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
        
        let workerSrcSet = false;
        
        if (fs.existsSync(minWorkerPath)) {
          // Read worker file and create data URL (more reliable than file:// in ESM)
          try {
            const workerContent = fs.readFileSync(minWorkerPath, 'utf8');
            const base64Worker = Buffer.from(workerContent).toString('base64');
            const dataUrl = `data:application/javascript;base64,${base64Worker}`;
            pdfjsLib.GlobalWorkerOptions.workerSrc = dataUrl;
            workerSrcSet = true;
            console.log('PDF worker set to data URL (from minified worker)');
          } catch (dataUrlError) {
            // Fallback to file URL
            const absolutePath = path.resolve(minWorkerPath);
            const fileUrl = process.platform === 'win32' 
              ? `file:///${absolutePath.replace(/\\/g, '/')}`
              : `file://${absolutePath}`;
            pdfjsLib.GlobalWorkerOptions.workerSrc = fileUrl;
            workerSrcSet = true;
            console.log('PDF worker set to minified file URL:', fileUrl);
          }
        } else if (workerPath && fs.existsSync(workerPath)) {
          // Use regular worker as data URL
          try {
            const workerContent = fs.readFileSync(workerPath, 'utf8');
            const base64Worker = Buffer.from(workerContent).toString('base64');
            const dataUrl = `data:application/javascript;base64,${base64Worker}`;
            pdfjsLib.GlobalWorkerOptions.workerSrc = dataUrl;
            workerSrcSet = true;
            console.log('PDF worker set to data URL (from regular worker)');
          } catch (dataUrlError) {
            // Fallback to file URL
            const absolutePath = path.resolve(workerPath);
            const fileUrl = process.platform === 'win32' 
              ? `file:///${absolutePath.replace(/\\/g, '/')}`
              : `file://${absolutePath}`;
            pdfjsLib.GlobalWorkerOptions.workerSrc = fileUrl;
            workerSrcSet = true;
            console.log('PDF worker set to file URL:', fileUrl);
          }
        }
        
        // Verify workerSrc is actually set
        if (!workerSrcSet || !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          throw new Error('Failed to set workerSrc - could not locate or load PDF worker file');
        }
        
        console.log('WorkerSrc verified:', pdfjsLib.GlobalWorkerOptions.workerSrc.substring(0, 50) + '...');
      } catch (workerError) {
        console.error('Error setting up PDF worker:', workerError);
        // Last resort: try to use a minimal worker setup
        // Some versions of pdfjs-dist can work without explicit worker in Node.js
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        } catch (e) {
          throw new Error(`Failed to set up PDF worker: ${workerError.message}`);
        }
      }
    } else {
      // Browser environment - set worker source to CDN
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    }
    
    // Convert Buffer to Uint8Array if needed (pdfjs-dist requires Uint8Array)
    let pdfData = pdfBuffer;
    if (Buffer.isBuffer(pdfBuffer)) {
      pdfData = new Uint8Array(pdfBuffer);
    } else if (!(pdfBuffer instanceof Uint8Array)) {
      pdfData = new Uint8Array(pdfBuffer);
    }
    
    // Load PDF document
    // In Node.js, we can try to load without worker by using disableWorker option
    const docOptions = {
      data: pdfData,
      useSystemFonts: true,
      // Try to disable worker in Node.js
      ...(typeof window === 'undefined' ? { 
        disableWorker: true,
        verbosity: 0 
      } : {})
    };
    
    const loadingTask = pdfjsLib.getDocument(docOptions);
    
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    
    // Set up canvas
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Convert canvas to PNG buffer
    const imageBuffer = canvas.toBuffer('image/png');
    
    return imageBuffer;
  } catch (error) {
    console.error('Error converting PDF page to image:', error);
    throw new Error(`Failed to convert PDF page to image: ${error.message}`);
  }
}

