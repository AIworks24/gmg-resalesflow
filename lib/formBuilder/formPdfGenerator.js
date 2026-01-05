/**
 * Form PDF Generator - Generate new PDFs from form structure with GMG branding
 * Uses @react-pdf/renderer to create professional PDFs
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { ProfessionalHeader } from '../components/ProfessionalHeader';
import { ProfessionalFooter } from '../components/ProfessionalFooter';

// Styles for form PDF
const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
    color: '#111827',
  },
  content: {
    paddingLeft: 40,
    paddingRight: 40,
    paddingTop: 20,
    paddingBottom: 20,
    minHeight: '100%',
  },
  mainTitle: {
    color: '#166534',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 25,
    paddingBottom: 12,
    paddingLeft: 40,
    paddingRight: 40,
    borderBottomWidth: 3,
    borderBottomColor: '#166534',
    borderBottomStyle: 'solid',
  },
  section: {
    marginTop: 24,
    marginBottom: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    color: '#059669',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#059669',
    borderBottomStyle: 'solid',
  },
  field: {
    marginTop: 14,
    marginBottom: 14,
    flexDirection: 'column',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  fieldLabel: {
    fontWeight: 'bold',
    color: '#374151',
    fontSize: 11,
    marginBottom: 6,
    width: '100%',
  },
  fieldValue: {
    color: '#111827',
    fontSize: 11,
    lineHeight: 1.6,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    minHeight: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
  },
  textareaField: {
    marginTop: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  textareaLabel: {
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
    fontSize: 11,
  },
  textareaValue: {
    color: '#111827',
    fontSize: 11,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
  },
  required: {
    color: '#dc2626',
    marginLeft: 2,
  },
  emptyValue: {
    color: '#9ca3af',
    fontStyle: 'italic',
    backgroundColor: '#ffffff',
  },
  signatureField: {
    marginTop: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  signatureImage: {
    maxWidth: 200,
    maxHeight: 80,
    objectFit: 'contain',
  },
  signaturePlaceholder: {
    color: '#9ca3af',
    fontStyle: 'italic',
    fontSize: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    textAlign: 'center',
  },
});

/**
 * Get nested value from object using dot notation
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
    checkbox: 'Yes',
    radio: 'Option 1',
    signature: null // Signatures should be images, not text
  };
  return samples[fieldType] || 'Sample Value';
}

/**
 * Get field value from preview data or use sample
 */
function getFieldValue(field, previewData) {
  if (field.dataSource) {
    const value = getNestedValue(previewData, field.dataSource);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  return getSampleValue(field.type);
}

/**
 * Format field value for display
 */
function formatFieldValue(value, fieldType) {
  if (value === null || value === undefined) return '';
  
  if (fieldType === 'checkbox') {
    return value === true || value === 'true' || value === 1 ? 'Yes' : 'No';
  }
  
  if (fieldType === 'date' && value instanceof Date) {
    return value.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  
  return String(value);
}

/**
 * Render a form field
 */
function renderField(field, previewData) {
  const rawValue = getFieldValue(field, previewData);
  const isTextarea = field.type === 'textarea';
  const isSignature = field.type === 'signature';
  
  // Handle signature fields (image data)
  if (isSignature) {
    const hasSignature = rawValue && (typeof rawValue === 'string' && rawValue.startsWith('data:image'));
    
    return React.createElement(
      View,
      { key: field.id, style: styles.signatureField },
      React.createElement(
        Text,
        { style: styles.fieldLabel },
        field.label,
        field.required && React.createElement(Text, { style: styles.required }, ' *')
      ),
      hasSignature 
        ? React.createElement(
            Image,
            {
              src: rawValue,
              style: styles.signatureImage
            }
          )
        : React.createElement(
            Text,
            { style: styles.signaturePlaceholder },
            'Signature not provided'
          )
    );
  }
  
  const value = formatFieldValue(rawValue, field.type);
  const hasValue = value && value.trim() !== '';
  const displayValue = hasValue ? value : (field.placeholder || '');
  
  if (isTextarea) {
    return React.createElement(
      View,
      { key: field.id, style: styles.textareaField },
      React.createElement(
        Text,
        { style: styles.textareaLabel },
        field.label,
        field.required && React.createElement(Text, { style: styles.required }, ' *')
      ),
      React.createElement(
        Text,
        { 
          style: [
            styles.textareaValue,
            !hasValue && styles.emptyValue
          ]
        },
        displayValue || 'No value provided'
      )
    );
  }
  
  return React.createElement(
    View,
    { key: field.id, style: styles.field },
    React.createElement(
      Text,
      { style: styles.fieldLabel },
      field.label,
      field.required && React.createElement(Text, { style: styles.required }, ' *')
    ),
    React.createElement(
      Text,
      { 
        style: [
          styles.fieldValue,
          !hasValue && styles.emptyValue
        ]
      },
      displayValue || '—'
    )
  );
}

/**
 * Render a section
 */
function renderSection(section, previewData) {
  if (!section.fields || section.fields.length === 0) {
    return null;
  }
  
  const children = [];
  
  if (section.title) {
    children.push(
      React.createElement(
        Text,
        { key: 'title', style: styles.sectionTitle },
        section.title
      )
    );
  }
  
  section.fields.forEach(field => {
    children.push(renderField(field, previewData));
  });
  
  return React.createElement(
    View,
    { key: section.id, style: styles.section },
    ...children
  );
}

/**
 * Form PDF Document Component
 */
function FormPdfDocument({
  formTitle = 'Form',
  formStructure,
  previewData = {},
  logoBase64 = null
}) {
  const sections = formStructure?.sections || [];
  const generatedDate = new Date().toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return React.createElement(
    Document,
    { title: formTitle },
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, wrap: true },
      // Professional Header
      React.createElement(ProfessionalHeader, { logoBase64 }),
      // Main Title
      React.createElement(
        View,
        { style: { alignItems: 'center', width: '100%', marginBottom: 10 } },
        React.createElement(
          Text,
          { style: styles.mainTitle },
          formTitle
        )
      ),
      // Content
      React.createElement(
        View,
        { style: styles.content },
        // Render all sections
        sections
          .map(section => renderSection(section, previewData))
          .filter(section => section !== null)
      ),
      // Professional Footer
      React.createElement(ProfessionalFooter, { generatedDate })
    )
  );
}

/**
 * Generate PDF from form structure
 * NOTE: This function must run server-side (Node.js) because @react-pdf/renderer
 * only supports renderToStream in Node.js environments.
 * For browser usage, call the /api/form-builder/generate-pdf API endpoint.
 * 
 * @param {Object} formStructure - Form structure with sections and fields
 * @param {Object} previewData - Preview data for fields
 * @param {string} formTitle - Title of the form
 * @param {string} logoBase64 - Base64 encoded logo (optional)
 * @returns {Promise<Uint8Array>} - PDF bytes
 */
export async function generateFormPDF(formStructure, previewData = {}, formTitle = 'Form', logoBase64 = null) {
  // Ensure this only runs server-side
  if (typeof window !== 'undefined') {
    throw new Error('generateFormPDF must be called server-side. Use /api/form-builder/generate-pdf endpoint from the browser.');
  }

  try {
    const ReactPDF = await import('@react-pdf/renderer');
    
    // Create the PDF document component
    const pdfElement = React.createElement(FormPdfDocument, {
      formTitle,
      formStructure,
      previewData,
      logoBase64
    });
    
    // Use renderToStream (Node.js only)
    const stream = await ReactPDF.renderToStream(pdfElement);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);
    
    return new Uint8Array(pdfBuffer);
  } catch (error) {
    console.error('Form PDF generation error:', error);
    throw new Error(`Failed to generate form PDF: ${error.message}`);
  }
}

