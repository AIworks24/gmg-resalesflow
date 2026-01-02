/**
 * PDF Analyzer Service - Extract fields from PDF forms
 * Uses pdf-lib to extract form fields and metadata
 */

const { PDFDocument } = require('pdf-lib');

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

