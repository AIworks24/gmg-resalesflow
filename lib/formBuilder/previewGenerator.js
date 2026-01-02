/**
 * Preview Generator Service - Generate live PDF preview from form structure
 * Fills PDF template with form data for real-time preview in form builder
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'application.property_address')
 * @returns {*} - Value or null
 */
function getNestedValue(obj, path) {
  if (!path || !obj) return null;
  
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return null;
    }
  }
  
  return value;
}

/**
 * Get sample value based on field type
 * @param {string} fieldType - Field type (text, date, email, etc.)
 * @returns {string} - Sample value
 */
function getSampleValue(fieldType) {
  const samples = {
    text: 'Sample Text',
    email: 'sample@example.com',
    tel: '(555) 123-4567',
    date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    number: '12345',
    select: 'Option 1',
    textarea: 'Sample text area content...',
    checkbox: true,
    radio: 'Option 1'
  };
  
  return samples[fieldType] || 'Sample Value';
}

/**
 * Get field value from preview data or use sample
 * @param {Object} field - Form field object
 * @param {Object} previewData - Preview data object
 * @returns {*} - Field value
 */
function getFieldValue(field, previewData) {
  // Check if field has data source mapping
  if (field.dataSource) {
    const value = getNestedValue(previewData, field.dataSource);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  
  // Check if field has a default value
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  
  // Return sample data based on field type
  return getSampleValue(field.type);
}

/**
 * Fill a PDF field with a value
 * @param {Object} pdfField - PDF field from pdf-lib
 * @param {*} value - Value to fill
 * @param {string} fieldType - Form field type
 */
function fillPDFField(pdfField, value, fieldType) {
  if (!pdfField || value === null || value === undefined) return;
  
  const fieldTypeName = pdfField.constructor.name;
  const form = pdfField.getForm();
  
  try {
    if (fieldTypeName === 'PDFTextField') {
      const textField = form.getTextField(pdfField.getName());
      textField.setText(String(value));
      try {
        textField.setFontSize(9);
        textField.updateAppearances();
      } catch (e) {
        // Font size update is optional
      }
    } else if (fieldTypeName === 'PDFCheckBox') {
      const checkBox = form.getCheckBox(pdfField.getName());
      const isChecked = value === true || 
                       value === 'True' || 
                       value === 'true' ||
                       String(value) === '1';
      if (isChecked) {
        checkBox.check();
      } else {
        checkBox.uncheck();
      }
    } else if (fieldTypeName === 'PDFRadioGroup') {
      const radioGroup = form.getRadioGroup(pdfField.getName());
      const options = radioGroup.getOptions();
      const valueStr = String(value);
      
      // Try to find matching option
      for (const option of options) {
        if (option === valueStr || option.includes(valueStr)) {
          radioGroup.select(option);
          break;
        }
      }
    } else if (fieldTypeName === 'PDFDropdown') {
      const dropdown = form.getDropdown(pdfField.getName());
      const valueStr = String(value);
      try {
        dropdown.select(valueStr);
      } catch (e) {
        // Option might not exist, try to add it or skip
        try {
          const options = dropdown.getOptions();
          if (options.length > 0) {
            dropdown.select(options[0]); // Select first option as fallback
          }
        } catch (e2) {
          // Skip if dropdown selection fails
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to fill PDF field ${pdfField.getName()}:`, error);
    // Continue with other fields even if one fails
  }
}

/**
 * Generate live PDF preview from form structure
 * @param {Uint8Array|Buffer} pdfTemplate - PDF template bytes
 * @param {Object} formStructure - Form structure JSON
 * @param {Object} fieldMappings - PDF field mappings (fieldId -> {pdfFieldName, ...})
 * @param {Object} previewData - Sample data for preview
 * @returns {Promise<Uint8Array>} - Filled PDF bytes
 */
async function generateLivePreview(pdfTemplate, formStructure, fieldMappings = {}, previewData = {}) {
  try {
    // Load PDF template
    const pdfDoc = await PDFDocument.load(pdfTemplate);
    
    // Try to get form, but continue even if PDF has no form fields
    let form;
    let fieldMap = new Map();
    try {
      form = pdfDoc.getForm();
      const fields = form.getFields();
      fields.forEach(field => {
        fieldMap.set(field.getName(), field);
      });
    } catch (formError) {
      // PDF might not have form fields, that's okay - just return the original PDF
      console.warn('PDF has no form fields, returning original PDF:', formError);
      return await pdfDoc.save();
    }
    
    // Fill PDF fields based on form structure
    const sections = formStructure.sections || [];
    let fieldsFilled = 0;
    
    for (const section of sections) {
      const sectionFields = section.fields || [];
      
      for (const field of sectionFields) {
        // Get PDF field mapping
        const mapping = fieldMappings[field.id] || fieldMappings[field.key];
        if (!mapping) continue;
        
        const pdfFieldName = mapping.pdfFieldName || mapping.pdfField || mapping.name || field.pdfMapping;
        if (!pdfFieldName) continue;
        
        const pdfField = fieldMap.get(pdfFieldName);
        if (!pdfField) {
          console.warn(`PDF field "${pdfFieldName}" not found in template`);
          continue;
        }
        
        // Get value from preview data or use sample
        const value = getFieldValue(field, previewData);
        
        // Apply transform if specified
        let transformedValue = value;
        if (mapping.transform) {
          transformedValue = applyTransform(value, mapping.transform);
        }
        
        // Fill PDF field
        try {
          fillPDFField(pdfField, transformedValue, field.type);
          fieldsFilled++;
        } catch (fillError) {
          console.warn(`Failed to fill field ${pdfFieldName}:`, fillError);
        }
      }
    }
    
    console.log(`Preview generated: ${fieldsFilled} fields filled`);
    
    // Return filled PDF bytes
    return await pdfDoc.save();
  } catch (error) {
    console.error('Preview generation error:', error);
    throw new Error(`Failed to generate PDF preview: ${error.message}`);
  }
}

/**
 * Apply transformation to field value
 * @param {*} value - Original value
 * @param {string} transform - Transform type (uppercase, lowercase, date, etc.)
 * @returns {*} - Transformed value
 */
function applyTransform(value, transform) {
  if (value === null || value === undefined) return value;
  
  switch (transform.toLowerCase()) {
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'date':
      if (value instanceof Date) {
        return value.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      }
      return String(value);
    case 'currency':
      if (typeof value === 'number') {
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return String(value);
    case 'number':
      if (typeof value === 'string') {
        return parseFloat(value) || value;
      }
      return value;
    default:
      return value;
  }
}

/**
 * Generate sample preview data based on application schema
 * @param {Object} applicationSchema - Application data schema
 * @returns {Object} - Sample preview data
 */
function generateSamplePreviewData(applicationSchema = {}) {
  const samples = {
    application: {
      property_address: '123 Main Street, City, ST 12345',
      buyer_name: 'John Doe',
      seller_name: 'Jane Smith',
      hoa_property: 'Sunset Hills Community',
      closing_date: new Date().toISOString().split('T')[0],
      sale_price: 350000,
      submitter_name: 'Real Estate Agent',
      submitter_email: 'agent@example.com',
      package_type: 'standard'
    }
  };
  
  // Merge with provided schema
  return { ...samples, ...applicationSchema };
}

export {
  generateLivePreview,
  generateSamplePreviewData,
  getFieldValue,
  fillPDFField,
  applyTransform
};

