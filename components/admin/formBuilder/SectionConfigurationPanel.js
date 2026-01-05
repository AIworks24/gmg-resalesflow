import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

export default function SectionConfigurationPanel({ section, formStructure, onUpdate, onClose }) {
  const [formData, setFormData] = useState({
    title: section?.title || '',
    description: section?.description || '',
    initiallyHidden: section?.initiallyHidden || false,
    layout: section?.layout || 'single-column',
    collapsible: section?.collapsible || false,
    required: section?.required || false,
    conditionalVisibility: section?.conditionalVisibility || null
  });

  useEffect(() => {
    if (section) {
      setFormData({
        title: section.title || '',
        description: section.description || '',
        initiallyHidden: section.initiallyHidden || false,
        layout: section.layout || 'single-column',
        collapsible: section.collapsible || false,
        required: section.required || false,
        conditionalVisibility: section.conditionalVisibility || null
      });
    }
  }, [section]);

  const handleChange = (key, value) => {
    const updatedData = {
      ...formData,
      [key]: value
    };
    setFormData(updatedData);
    
    // Update immediately for visual changes
    const immediateUpdateFields = ['initiallyHidden', 'layout', 'collapsible'];
    if (immediateUpdateFields.includes(key)) {
      onUpdate(updatedData);
    }
  };

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Section Settings
          </h4>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Section Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            placeholder="Enter section title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description (Optional)
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={2}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            placeholder="Section description or help text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Layout
          </label>
          <select
            value={formData.layout}
            onChange={(e) => handleChange('layout', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
          >
            <option value="single-column">Single Column</option>
            <option value="two-column">Two Column</option>
            <option value="three-column">Three Column</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            How fields are arranged within this section
          </p>
        </div>
      </div>

      {/* Visibility Settings */}
      <div className="space-y-4 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-purple-600 rounded-full"></div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Visibility Settings
          </h4>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="initiallyHidden"
            checked={formData.initiallyHidden}
            onChange={(e) => handleChange('initiallyHidden', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="initiallyHidden" className="ml-2 text-sm text-gray-700">
            Initially Hidden
          </label>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          Section will be hidden by default and can be shown via conditional logic
        </p>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="collapsible"
            checked={formData.collapsible}
            onChange={(e) => handleChange('collapsible', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="collapsible" className="ml-2 text-sm text-gray-700">
            Collapsible Section
          </label>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          Allow users to collapse/expand this section in the form
        </p>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="required"
            checked={formData.required}
            onChange={(e) => handleChange('required', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="required" className="ml-2 text-sm text-gray-700">
            Required Section
          </label>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          At least one field in this section must be filled
        </p>
      </div>

      {/* Conditional Visibility */}
      <div className="space-y-4 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-green-600 rounded-full"></div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Conditional Visibility
          </h4>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Show/Hide Based On
          </label>
          <select
            value={formData.conditionalVisibility?.action || ''}
            onChange={(e) => handleChange('conditionalVisibility', {
              ...formData.conditionalVisibility,
              action: e.target.value
            })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
          >
            <option value="">No conditional visibility</option>
            <option value="show">Show when condition is met</option>
            <option value="hide">Hide when condition is met</option>
          </select>
        </div>

        {formData.conditionalVisibility?.action && (
          <div className="space-y-2">
            <select
              value={formData.conditionalVisibility?.sourceFieldId || ''}
              onChange={(e) => handleChange('conditionalVisibility', {
                ...formData.conditionalVisibility,
                sourceFieldId: e.target.value
              })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
            >
              <option value="">Select field...</option>
              {formStructure?.sections?.map((s) =>
                s.fields?.filter(f => f.type === 'checkbox' || f.type === 'radio' || f.type === 'select').map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label || f.id} ({f.id})
                  </option>
                ))
              )}
            </select>
            <input
              type="text"
              value={formData.conditionalVisibility?.sourceFieldId || ''}
              onChange={(e) => handleChange('conditionalVisibility', {
                ...formData.conditionalVisibility,
                sourceFieldId: e.target.value
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              placeholder="Or type field ID manually"
            />
            {formData.conditionalVisibility?.sourceFieldId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition Value
                </label>
                <input
                  type="text"
                  value={formData.conditionalVisibility?.value || ''}
                  onChange={(e) => handleChange('conditionalVisibility', {
                    ...formData.conditionalVisibility,
                    value: e.target.value
                  })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm bg-white shadow-sm hover:shadow transition-shadow"
                  placeholder="Value to check (e.g., 'true', 'Yes', etc.)"
                />
                <p className="mt-1 text-xs text-gray-500">
                  For checkboxes: use 'true' or 'false'. For select/radio: use the option value.
                </p>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-gray-500">
          Control when this section is visible based on another field's value
        </p>
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

