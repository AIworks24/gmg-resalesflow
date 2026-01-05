import React, { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';

export default function FieldConfigurationPanel({ field, formStructure, onUpdate, onClose }) {
  const [formData, setFormData] = useState({
    label: field?.label || '',
    key: field?.key || '',
    type: field?.type || 'text',
    required: field?.required || false,
    placeholder: field?.placeholder || '',
    defaultValue: field?.defaultValue || '',
    dataSource: field?.dataSource || '',
    pdfMapping: field?.pdfMapping || '',
    validation: field?.validation || {},
    width: field?.width || 'half',
    options: field?.options || [],
    currency: field?.currency || false,
    computation: field?.computation || null,
    conditionalLogic: field?.conditionalLogic || null,
    checkboxLabel: field?.checkboxLabel || ''
  });

  useEffect(() => {
    if (field) {
      setFormData({
        label: field.label || '',
        key: field.key || '',
        type: field.type || 'text',
        required: field.required || false,
        placeholder: field.placeholder || '',
        defaultValue: field.defaultValue || '',
        dataSource: field.dataSource || '',
        pdfMapping: field.pdfMapping || '',
        validation: field.validation || {},
        width: field.width || 'half',
        options: field.options || [],
        currency: field.currency || false,
        computation: field.computation || null,
        conditionalLogic: field.conditionalLogic || null,
        checkboxLabel: field.checkboxLabel || ''
      });
    }
  }, [field]);

  const handleChange = (key, value) => {
    const updatedData = {
      ...formData,
      [key]: value
    };
    setFormData(updatedData);
    
    // Update preview immediately for certain fields that affect visual appearance
    const immediateUpdateFields = ['currency', 'width', 'type', 'options', 'checkboxLabel'];
    if (immediateUpdateFields.includes(key)) {
      onUpdate(updatedData);
    }
  };

  const handleSave = () => {
    onUpdate(formData);
  };

  const applicationFields = [
    'application.property_address',
    'application.buyer_name',
    'application.seller_name',
    'application.hoa_property',
    'application.closing_date',
    'application.sale_price',
    'application.submitter_name',
    'application.submitter_email',
    'application.package_type'
  ];

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Basic Settings
          </h4>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Field Label *
          </label>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => handleChange('label', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            placeholder="Enter field label"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Field Key
          </label>
          <input
            type="text"
            value={formData.key}
            onChange={(e) => handleChange('key', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            placeholder="field_key"
          />
          <p className="mt-1 text-xs text-gray-500">
            Used for data mapping (auto-generated if empty)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Field Type
          </label>
          <select
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
          >
            <option value="label">Label/Text (Read-only)</option>
            <option value="text">Text Field</option>
            <option value="textarea">Text Area</option>
            <option value="email">Email</option>
            <option value="tel">Phone</option>
            <option value="date">Date</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
            <option value="checkbox">Checkbox</option>
            <option value="radio">Radio</option>
          </select>
        </div>

        {/* Field Width */}
        {formData.type !== 'label' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Field Width
            </label>
            <select
              value={formData.width}
              onChange={(e) => handleChange('width', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            >
              <option value="half">Half Width</option>
              <option value="full">Full Width</option>
            </select>
          </div>
        )}

        {/* Options for Select/Radio */}
        {(formData.type === 'select' || formData.type === 'radio') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Options (one per line)
            </label>
            <textarea
              value={formData.options.join('\n')}
              onChange={(e) => {
                const options = e.target.value.split('\n').filter(o => o.trim());
                handleChange('options', options);
              }}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              placeholder="Option 1&#10;Option 2&#10;Option 3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter each option on a new line
            </p>
          </div>
        )}

        {/* Checkbox Label */}
        {formData.type === 'checkbox' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Checkbox Label
            </label>
            <input
              type="text"
              value={formData.checkboxLabel}
              onChange={(e) => handleChange('checkboxLabel', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
              placeholder="Checkbox label text"
            />
            <p className="mt-1 text-xs text-gray-500">
              Label text shown next to checkbox (defaults to field label if empty)
            </p>
          </div>
        )}

        {/* Currency Formatting for Number */}
        {formData.type === 'number' && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="currency"
              checked={formData.currency}
              onChange={(e) => handleChange('currency', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="currency" className="ml-2 text-sm text-gray-700">
              Format as Currency ($)
            </label>
          </div>
        )}

        {/* Computation Logic for Number */}
        {formData.type === 'number' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Computation Formula (Optional)
            </label>
            <input
              type="text"
              value={formData.computation || ''}
              onChange={(e) => handleChange('computation', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              placeholder="field_id1 + field_id2 - field_id3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Use field IDs with operators: +, -, *, /, (e.g., "field_1 + field_2")
            </p>
          </div>
        )}

        {/* Conditional Logic for Checkbox */}
        {formData.type === 'checkbox' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conditional Logic (Show/Hide)
            </label>
            <div className="space-y-2">
              <select
                value={formData.conditionalLogic?.action || ''}
                onChange={(e) => handleChange('conditionalLogic', {
                  ...formData.conditionalLogic,
                  action: e.target.value
                })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
              >
                <option value="">No conditional logic</option>
                <option value="show">Show field/section when checked</option>
                <option value="hide">Hide field/section when checked</option>
              </select>
              {formData.conditionalLogic?.action && (
                <div className="space-y-2">
                  <select
                    value={formData.conditionalLogic?.targetFieldId || ''}
                    onChange={(e) => handleChange('conditionalLogic', {
                      ...formData.conditionalLogic,
                      targetFieldId: e.target.value
                    })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
                  >
                    <option value="">Select target from list...</option>
                    <optgroup label="Sections">
                      {formStructure?.sections?.map((section) => (
                        <option key={`section-${section.id}`} value={section.id}>
                          {section.title || `Section ${section.id}`} - {section.id}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Fields">
                      {formStructure?.sections?.map((section) =>
                        section.fields?.filter(f => f.id !== field?.id).map((f) => (
                          <option key={`field-${f.id}`} value={f.id}>
                            {f.label || f.id} ({f.id})
                          </option>
                        ))
                      )}
                    </optgroup>
                  </select>
                  <input
                    type="text"
                    value={formData.conditionalLogic?.targetFieldId || ''}
                    onChange={(e) => handleChange('conditionalLogic', {
                      ...formData.conditionalLogic,
                      targetFieldId: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="Or type section/field ID manually"
                  />
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Control visibility of other fields/sections based on this checkbox. Select from dropdown or type ID manually.
            </p>
          </div>
        )}

        <div className="flex items-center">
          <input
            type="checkbox"
            id="required"
            checked={formData.required}
            onChange={(e) => handleChange('required', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="required" className="ml-2 text-sm text-gray-700">
            Required field
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Placeholder
          </label>
          <input
            type="text"
            value={formData.placeholder}
            onChange={(e) => handleChange('placeholder', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            placeholder="Enter placeholder text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default Value
          </label>
          <input
            type="text"
            value={formData.defaultValue}
            onChange={(e) => handleChange('defaultValue', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            placeholder="Enter default value"
          />
        </div>
      </div>

      {/* Data Mapping */}
      <div className="space-y-4 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-green-600 rounded-full"></div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Data Mapping
          </h4>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Data Source
          </label>
          <select
            value={formData.dataSource}
            onChange={(e) => handleChange('dataSource', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
          >
            <option value="">None (manual entry)</option>
            {applicationFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Map to application data field
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PDF Field Mapping
          </label>
          <input
            type="text"
            value={formData.pdfMapping}
            onChange={(e) => handleChange('pdfMapping', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            placeholder="PDF_Field_Name"
          />
          <p className="mt-1 text-xs text-gray-500">
            Name of the field in the PDF template
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-6 border-t border-gray-200 flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all text-sm font-semibold shadow-sm hover:shadow-md"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
        <button
          onClick={onClose}
          className="px-5 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

