/**
 * Form Renderer - Displays forms like the settlement form
 * Shows how the form will look in the actual application
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Save,
  Send,
  AlertCircle
} from 'lucide-react';

export default function FormRenderer({
  formStructure,
  formTitle = 'Form',
  applicationData = {},
  onFormDataChange
}) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const initializedRef = useRef(false);
  const formStructureRef = useRef(null);

  // Helper function to get nested value
  const getNestedValue = (obj, path) => {
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
  };

  // Memoize the callback to prevent unnecessary re-renders
  const handleFormDataChange = useCallback((data) => {
    if (onFormDataChange) {
      onFormDataChange(data);
    }
  }, [onFormDataChange]);

  // Initialize form data from structure (only when structure changes)
  useEffect(() => {
    // Check if form structure actually changed
    const structureString = JSON.stringify(formStructure);
    const structureChanged = structureString !== formStructureRef.current;
    
    if (!formStructure || !formStructure.sections || formStructure.sections.length === 0) {
      setFormData({});
      initializedRef.current = false;
      formStructureRef.current = null;
      return;
    }

    // Only re-initialize if structure changed
    if (structureChanged) {
      const initialData = {};
      formStructure.sections.forEach(section => {
        section.fields?.forEach(field => {
          // Get value from data source or default
          if (field.dataSource) {
            const value = getNestedValue(applicationData, field.dataSource);
            if (value !== null && value !== undefined) {
              initialData[field.id] = value;
            } else if (field.defaultValue !== undefined) {
              initialData[field.id] = field.defaultValue;
            } else {
              initialData[field.id] = '';
            }
          } else if (field.defaultValue !== undefined) {
            initialData[field.id] = field.defaultValue;
          } else {
            initialData[field.id] = '';
          }
        });
      });
      
      setFormData(initialData);
      formStructureRef.current = structureString;
      initializedRef.current = true;
    }
  }, [formStructure]); // Only depend on formStructure, not applicationData

  const handleInputChange = useCallback((fieldId, value) => {
    setFormData(prevData => {
      const newData = { ...prevData, [fieldId]: value };
      // Call onFormDataChange with the new data
      handleFormDataChange(newData);
      return newData;
    });
  }, [handleFormDataChange]);

  const renderField = (field) => {
    const value = formData[field.id] || '';
    const hasError = errors[field.id];
    
    const commonProps = {
      value: value,
      onChange: (e) => handleInputChange(field.id, e.target.value),
      className: `w-full px-3 py-2.5 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 ${
        hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200'
      }`,
      placeholder: field.placeholder || '',
      disabled: field.readOnly || false
    };

    switch (field.type) {
      case 'label':
        return (
          <div className="text-sm text-gray-700 font-medium py-2">
            {field.label}
          </div>
        );

      case 'text':
        return <input type="text" {...commonProps} />;

      case 'textarea':
        return <textarea {...commonProps} rows={3} />;

      case 'email':
        return <input type="email" {...commonProps} />;

      case 'tel':
        return <input type="tel" {...commonProps} />;

      case 'date':
        return <input type="date" {...commonProps} />;

      case 'number':
        // Check if currency formatting is enabled
        // Handle both boolean true and string 'true' - more robust check
        const isCurrency = Boolean(field.currency) && (
          field.currency === true || 
          field.currency === 'true' || 
          field.currency === 1 ||
          String(field.currency).toLowerCase() === 'true'
        );
        
        if (isCurrency) {
          return (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm font-medium z-10 pointer-events-none">$</span>
              <input
                type="text"
                {...commonProps}
                className={`${commonProps.className} pl-7`}
                value={value ? formatCurrency(value) : ''}
                placeholder=""
                onChange={(e) => {
                  // Remove all non-numeric characters except decimal point
                  const numValue = e.target.value.replace(/[^0-9.]/g, '');
                  // Only allow one decimal point
                  const parts = numValue.split('.');
                  const cleanValue = parts.length > 2 
                    ? parts[0] + '.' + parts.slice(1).join('')
                    : numValue;
                  handleInputChange(field.id, cleanValue);
                }}
                onFocus={(e) => {
                  // Select all text on focus for easy editing
                  e.target.select();
                }}
              />
            </div>
          );
        }
        return <input type="number" {...commonProps} />;

      case 'select':
        return (
          <select {...commonProps}>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              id={field.id}
              checked={value === true || value === 'true' || value === 1}
              onChange={(e) => handleInputChange(field.id, e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor={field.id} className="ml-2 text-sm text-gray-700">
              {field.checkboxLabel || field.label}
            </label>
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map(option => (
              <div key={option} className="flex items-center">
                <input
                  type="radio"
                  id={`${field.id}_${option}`}
                  name={field.id}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor={`${field.id}_${option}`} className="ml-2 text-sm text-gray-700">
                  {option}
                </label>
              </div>
            ))}
          </div>
        );

      default:
        return <input type="text" {...commonProps} />;
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (!formStructure || !formStructure.sections || formStructure.sections.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600">Add fields to see form preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 bg-white min-h-full">
        {/* Form Header */}
        <div className="bg-blue-50 p-6 rounded-lg mb-8 border border-blue-200">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{formTitle}</h1>
              <p className="text-gray-600 text-sm mt-1">Form Preview</p>
            </div>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-6 mb-8">
          {formStructure.sections.map((section, sectionIndex) => (
            <div key={section.id || sectionIndex} className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              {/* Section Title */}
              <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-300">
                {section.title || `Section ${sectionIndex + 1}`}
              </h3>

              {/* Section Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields?.map((field) => {
                  // Respect the field's width setting explicitly
                  // If width is explicitly set (not null/undefined/empty), use it; otherwise default based on field type
                  const fieldWidth = (field.width && (field.width === 'half' || field.width === 'full')) 
                    ? field.width 
                    : (field.type === 'textarea' || field.type === 'label' ? 'full' : 'half');
                  const colSpan = fieldWidth === 'full' ? 'md:col-span-2' : '';


                  return (
                    <div key={field.id} className={colSpan}>
                      {field.type !== 'label' && field.type !== 'checkbox' && (
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                      )}
                      {renderField(field)}
                      {errors[field.id] && (
                        <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {errors[field.id]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex space-x-4">
            <button
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            
            <button
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Complete Form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

