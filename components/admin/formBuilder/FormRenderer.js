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
import SignatureField from './SignatureField';

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
  const pendingDataChangeRef = useRef(null);
  const [syncTrigger, setSyncTrigger] = useState(0);

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

  // Sync formData changes to parent (using useEffect to avoid setState during render)
  // Only sync when there's a pending change from user input, not during initialization
  useEffect(() => {
    if (pendingDataChangeRef.current && onFormDataChange && initializedRef.current) {
      onFormDataChange(pendingDataChangeRef.current);
      pendingDataChangeRef.current = null;
    }
  }, [syncTrigger, onFormDataChange]);

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
      // Store the new data to be synced to parent via useEffect
      pendingDataChangeRef.current = newData;
      // Trigger sync effect
      setSyncTrigger(prev => prev + 1);
      return newData;
    });
  }, []);

  const renderField = (field) => {
    const value = formData[field.id] || '';
    const hasError = errors[field.id];
    
    const commonProps = {
      value: value,
      onChange: (e) => handleInputChange(field.id, e.target.value),
      className: `w-full px-4 py-3 bg-white border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-gray-400 shadow-sm hover:shadow transition-shadow ${
        hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 hover:border-gray-400'
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

      case 'signature':
        return (
          <SignatureField
            value={value || ''}
            onChange={(signatureData) => {
              handleInputChange({ target: { name: field.key, value: signatureData } });
            }}
            label={field.label}
            required={field.required}
            disabled={field.readOnly || false}
          />
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
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 min-h-full">
        {/* Form Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 sm:p-8 rounded-2xl mb-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
              <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{formTitle}</h1>
              <p className="text-blue-100 text-sm mt-1">Form Preview</p>
            </div>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-6 mb-8">
          {formStructure.sections.map((section, sectionIndex) => (
            <div key={section.id || sectionIndex} className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              {/* Section Title */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
                <div className="flex-shrink-0 w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
                <h3 className="text-xl font-bold text-gray-900">
                  {section.title || `Section ${sectionIndex + 1}`}
                </h3>
              </div>

              {/* Section Fields */}
              {(() => {
                // Get section layout (default to 'two-column' for backward compatibility)
                const sectionLayout = section.layout || 'two-column';
                
                // Determine grid classes based on section layout
                let gridClasses = 'grid gap-4';
                if (sectionLayout === 'single-column') {
                  gridClasses = 'grid grid-cols-1 gap-4';
                } else if (sectionLayout === 'two-column') {
                  gridClasses = 'grid grid-cols-1 md:grid-cols-2 gap-4';
                } else if (sectionLayout === 'three-column') {
                  gridClasses = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
                }
                
                return (
                  <div className={gridClasses}>
                    {section.fields?.map((field) => {
                      // Respect the field's width setting explicitly
                      // If width is explicitly set (not null/undefined/empty), use it; otherwise default based on field type
                      const fieldWidth = (field.width && (field.width === 'half' || field.width === 'full')) 
                        ? field.width 
                        : (field.type === 'textarea' || field.type === 'label' ? 'full' : 'half');
                      
                      // Calculate column span based on section layout and field width
                      let colSpan = '';
                      if (fieldWidth === 'full') {
                        // Full width fields span all columns
                        if (sectionLayout === 'single-column') {
                          colSpan = 'col-span-1';
                        } else if (sectionLayout === 'two-column') {
                          colSpan = 'md:col-span-2';
                        } else if (sectionLayout === 'three-column') {
                          colSpan = 'md:col-span-2 lg:col-span-3';
                        }
                      } else {
                        // Half width fields take 1 column (or adjust for three-column layout)
                        if (sectionLayout === 'three-column') {
                          // In three-column, half width could mean 1 column, but we'll keep it as 1 column
                          colSpan = '';
                        } else {
                          colSpan = '';
                        }
                      }


                  return (
                    <div key={field.id} className={colSpan}>
                      {field.type !== 'label' && field.type !== 'checkbox' && (
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                      )}
                      <div className="relative">
                        {renderField(field)}
                      </div>
                      {errors[field.id] && (
                        <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          {errors[field.id]}
                        </p>
                      )}
                    </div>
                  );
                    })}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-8 mt-8 border-t border-gray-200">
          <button
            className="px-6 py-3 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-all font-medium"
          >
            Cancel
          </button>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            
            <button
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md"
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

