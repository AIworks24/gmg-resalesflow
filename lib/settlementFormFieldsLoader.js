/**
 * Settlement Form Fields Loader
 * Loads and provides access to settlement form field definitions from JSON config
 */

import settlementFormFields from './settlementFormFields.json';

/**
 * Get form configuration for a specific state (VA or NC)
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Object|null} - Form configuration or null if not found
 */
export function getSettlementFormConfig(propertyState) {
  return settlementFormFields.forms[propertyState] || null;
}

/**
 * Get all sections for a specific state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - Array of section configurations
 */
export function getSettlementSections(propertyState) {
  const config = getSettlementFormConfig(propertyState);
  return config ? config.sections : [];
}

/**
 * Get a specific field by key
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {string} fieldKey - The field key to look for
 * @returns {Object|null} - Field configuration or null if not found
 */
export function getSettlementField(propertyState, fieldKey) {
  const sections = getSettlementSections(propertyState);
  for (const section of sections) {
    const field = section.fields.find(f => f.key === fieldKey);
    if (field) return field;
  }
  return null;
}

/**
 * Get all field keys for a specific state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - Array of field keys
 */
export function getSettlementFieldKeys(propertyState) {
  const sections = getSettlementSections(propertyState);
  return sections.flatMap(section => section.fields.map(f => f.key));
}

/**
 * Get all required fields for a specific state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - Array of required field keys
 */
export function getRequiredFields(propertyState) {
  const sections = getSettlementSections(propertyState);
  return sections.flatMap(section => 
    section.fields
      .filter(f => f.required)
      .map(f => f.key)
  );
}

/**
 * Get auto-fill fields for a specific state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - Array of auto-fill field keys
 */
export function getAutoFillFields(propertyState) {
  const sections = getSettlementSections(propertyState);
  return sections
    .filter(section => section.autoFill)
    .flatMap(section => section.fields.map(f => f.key));
}

/**
 * Initialize form data with defaults for a specific state
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {Object} applicationData - Application data to auto-fill
 * @param {Object} userData - User data to auto-fill
 * @returns {Object} - Initialized form data
 */
export function initializeFormData(propertyState, applicationData, userData) {
  const sections = getSettlementSections(propertyState);
  const formData = {};

  sections.forEach(section => {
    section.fields.forEach(field => {
      // Set default values based on field type
      if (field.type === 'select') {
        formData[field.key] = field.options ? field.options[0] : '';
      } else if (field.type === 'date') {
        formData[field.key] = '';
      } else if (field.type === 'textarea') {
        formData[field.key] = '';
      } else if (field.placeholder) {
        formData[field.key] = field.placeholder;
      } else {
        formData[field.key] = '';
      }

      // Auto-fill from application data or user data if section is marked as autoFill
      if (section.autoFill) {
        // Try to get from applicationData first, then userData
        if (applicationData && applicationData[field.key]) {
          formData[field.key] = applicationData[field.key];
        } else if (userData && userData[field.key]) {
          formData[field.key] = userData[field.key];
        }
      }
    });
  });

  return formData;
}

/**
 * Validate form data against field requirements
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {Object} formData - Form data to validate
 * @returns {Object} - Validation errors object
 */
export function validateFormData(propertyState, formData) {
  const errors = {};
  const requiredFields = getRequiredFields(propertyState);

  requiredFields.forEach(fieldKey => {
    if (!formData[fieldKey] || formData[fieldKey].toString().trim() === '') {
      const field = getSettlementField(propertyState, fieldKey);
      errors[fieldKey] = `${field?.label || fieldKey} is required`;
    }
  });

  // Email validation
  const sections = getSettlementSections(propertyState);
  sections.forEach(section => {
    section.fields.forEach(field => {
      if (field.type === 'email' && formData[field.key]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.key])) {
          errors[field.key] = 'Please enter a valid email address';
        }
      }
    });
  });

  return errors;
}

/**
 * Export all utilities
 */
export default {
  getSettlementFormConfig,
  getSettlementSections,
  getSettlementField,
  getSettlementFieldKeys,
  getRequiredFields,
  getAutoFillFields,
  initializeFormData,
  validateFormData
};
