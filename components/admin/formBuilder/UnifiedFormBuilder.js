import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  X,
  FileText,
  Upload,
  Loader2
} from 'lucide-react';
import FormBuilderPanel from './FormBuilderPanel';
import dynamic from 'next/dynamic';
import FieldPalette from './FieldPalette';
import FieldConfigurationPanel from './FieldConfigurationPanel';
import SectionConfigurationPanel from './SectionConfigurationPanel';

// Form renderer to show how the form will look in the application
import FormRenderer from './FormRenderer';

export default function UnifiedFormBuilder({ template = null, creationMethod = 'visual', onClose }) {
  const supabase = createClientComponentClient();
  const [formStructure, setFormStructure] = useState({
    sections: []
  });
  const [selectedField, setSelectedField] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [pdfTemplate, setPdfTemplate] = useState(null);
  const [pdfTemplatePath, setPdfTemplatePath] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({});
  const [dataSourceMappings, setDataSourceMappings] = useState({});
  const [previewData, setPreviewData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [templateName, setTemplateName] = useState(template?.name || '');
  const [templateDescription, setTemplateDescription] = useState(template?.description || '');
  const [applicationTypes, setApplicationTypes] = useState(template?.application_types || []);
  const [taskNumber, setTaskNumber] = useState(template?.task_number || null);
  const [errors, setErrors] = useState({});
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [showSectionConfig, setShowSectionConfig] = useState(false);

  // Set first section as active when sections are created
  useEffect(() => {
    if (formStructure.sections && formStructure.sections.length > 0 && !activeSectionId) {
      setActiveSectionId(formStructure.sections[0].id);
    }
  }, [formStructure.sections, activeSectionId]);

  // Load template if editing
  useEffect(() => {
    if (template) {
      const structure = template.form_structure || { sections: [] };
      setFormStructure(structure);
      setFieldMappings(template.pdf_field_mappings || {});
      setDataSourceMappings(template.data_source_mappings || {});
      setPdfTemplatePath(template.pdf_template_path);
      // Set first section as active if available
      if (structure.sections && structure.sections.length > 0) {
        setActiveSectionId(structure.sections[0].id);
      }
      if (template.pdf_template_path) {
        loadPDFTemplate(template.pdf_template_path);
      }
    }
  }, [template]);

  // Generate sample preview data
  useEffect(() => {
    setPreviewData({
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
    });
  }, []);

  const loadPDFTemplate = async (path) => {
    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .download(path);

      if (error) throw error;

      const arrayBuffer = await data.arrayBuffer();
      setPdfTemplate(new Uint8Array(arrayBuffer));
    } catch (error) {
      console.error('Error loading PDF template:', error);
      setErrors({ pdf: 'Failed to load PDF template' });
    }
  };

  const handleSectionUpdate = (sectionId, updates) => {
    const updatedSections = formStructure.sections.map(section =>
      section.id === sectionId ? { ...section, ...updates } : section
    );
    setFormStructure({ sections: updatedSections });
  };

  const handleAddSection = () => {
    const newSection = {
      id: `section-${Date.now()}`,
      title: `Section ${formStructure.sections.length + 1}`,
      layout: 'single-column',
      fields: []
    };
    setFormStructure({
      sections: [...formStructure.sections, newSection]
    });
    // Set new section as active
    setActiveSectionId(newSection.id);
  };

  const handleAddField = (fieldType, targetSectionId = null) => {
    const fieldLabel = fieldType === 'label' ? 'Label' : 
                       fieldType === 'textarea' ? 'Text Area' :
                       fieldType === 'tel' ? 'Phone' :
                       `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)} Field`;
    
    const newField = {
      id: `field-${Date.now()}`,
      key: `field_${Date.now()}`,
      label: fieldLabel,
      type: fieldType,
      required: false,
      validation: {},
      dataSource: null,
      pdfMapping: null,
      conditionalLogic: null,
      width: (fieldType === 'textarea' || fieldType === 'label') ? 'full' : 'half',
      options: (fieldType === 'select' || fieldType === 'radio') ? ['Option 1', 'Option 2'] : [],
      currency: false,
      computation: null,
      checkboxLabel: ''
    };

    // Determine target section: use provided ID, then active section, then first section, or create new
    const updatedSections = [...formStructure.sections];
    let targetSection = null;
    let targetIndex = -1;

    if (targetSectionId) {
      targetIndex = updatedSections.findIndex(s => s.id === targetSectionId);
      if (targetIndex >= 0) {
        targetSection = updatedSections[targetIndex];
      }
    } else if (activeSectionId) {
      targetIndex = updatedSections.findIndex(s => s.id === activeSectionId);
      if (targetIndex >= 0) {
        targetSection = updatedSections[targetIndex];
      }
    }

    // If no target found, use first section or create new
    if (!targetSection) {
      if (updatedSections.length === 0) {
        const newSection = {
          id: `section-${Date.now()}`,
          title: 'Section 1',
          layout: 'single-column',
          fields: [newField]
        };
        updatedSections.push(newSection);
        setActiveSectionId(newSection.id);
      } else {
        targetSection = updatedSections[0];
        targetIndex = 0;
        targetSection.fields = [...(targetSection.fields || []), newField];
        updatedSections[0] = targetSection;
        setActiveSectionId(targetSection.id);
      }
    } else {
      // Add to target section
      targetSection.fields = [...(targetSection.fields || []), newField];
      updatedSections[targetIndex] = targetSection;
    }

    setFormStructure({ sections: updatedSections });
    setSelectedField(newField);
    setShowFieldConfig(true);
  };

  const handleFieldSelect = (field) => {
    setSelectedField(field);
    setShowFieldConfig(true);
  };

  const handleFieldUpdate = (fieldId, updates) => {
    const updatedSections = formStructure.sections.map(section => ({
      ...section,
      fields: section.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      )
    }));

    setFormStructure({ sections: updatedSections });
    
    // Update selected field if it's the one being updated
    if (selectedField && selectedField.id === fieldId) {
      setSelectedField({ ...selectedField, ...updates });
    }
  };

  const handleFieldDelete = (fieldId) => {
    const updatedSections = formStructure.sections.map(section => ({
      ...section,
      fields: section.fields.filter(field => field.id !== fieldId)
    }));

    setFormStructure({ sections: updatedSections });
    
    if (selectedField && selectedField.id === fieldId) {
      setSelectedField(null);
      setShowFieldConfig(false);
    }
  };

  const handleFieldReorder = (sectionId, fromIndex, toIndex) => {
    const updatedSections = formStructure.sections.map(section => {
      if (section.id === sectionId) {
        const newFields = [...section.fields];
        const [movedField] = newFields.splice(fromIndex, 1);
        newFields.splice(toIndex, 0, movedField);
        return { ...section, fields: newFields };
      }
      return section;
    });
    setFormStructure({ sections: updatedSections });
  };

  const handlePDFUpload = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `form-templates/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('bucket0')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (error) throw error;

      setPdfTemplatePath(fileName);
      
      // Load PDF into memory
      const arrayBuffer = await file.arrayBuffer();
      setPdfTemplate(new Uint8Array(arrayBuffer));
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setErrors({ pdf: 'Failed to upload PDF' });
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrors({});

      if (!templateName.trim()) {
        setErrors({ name: 'Form name is required' });
        setIsSaving(false);
        return;
      }

      const templateData = {
        name: templateName,
        description: templateDescription,
        creation_method: creationMethod,
        form_structure: formStructure,
        pdf_template_path: pdfTemplatePath,
        pdf_field_mappings: fieldMappings,
        data_source_mappings: dataSourceMappings,
        application_types: applicationTypes,
        task_number: taskNumber || null,
        is_active: true
      };

      const { data: { user } } = await supabase.auth.getUser();
      
      if (template) {
        // Update existing template
        const { error } = await supabase
          .from('form_templates')
          .update({
            ...templateData,
            updated_at: new Date().toISOString()
          })
          .eq('id', template.id);

        if (error) throw error;
      } else {
        // Create new template
        const { error } = await supabase
          .from('form_templates')
          .insert({
            ...templateData,
            created_by: user.id
          });

        if (error) throw error;
      }

      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      setErrors({ save: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header - Mobile First */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3 sm:mb-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                {template ? 'Edit Form' : 'Create Form'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                {creationMethod === 'ai_import' ? 'AI-Powered Import' : 'Visual Form Builder'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors hidden sm:flex items-center gap-2"
              title={showPreview ? 'Hide Preview' : 'Show Preview'}
            >
              {showPreview ? <EyeOff className="w-5 h-5 text-gray-600" /> : <Eye className="w-5 h-5 text-gray-600" />}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">Save Form</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Template Info - Mobile */}
        <div className="sm:hidden space-y-2">
          <input
            type="text"
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          {errors.name && (
            <p className="text-xs text-red-600">{errors.name}</p>
          )}
        </div>
      </header>

      {/* Main Content - Mobile First Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Form Builder */}
        <div className={`flex-1 flex flex-col ${showPreview ? 'lg:w-1/2' : 'lg:w-full'} border-r border-gray-200 bg-white overflow-hidden`}>
          {/* Template Info - Desktop */}
          <div className="hidden sm:block px-4 sm:px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Form name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {errors.name && (
                  <p className="text-xs text-red-600 mt-1">{errors.name}</p>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* PDF Upload Section - Only for AI Import workflow */}
          {creationMethod === 'ai_import' && !pdfTemplate && (
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-blue-50">
              <label className="block">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-lg p-6 cursor-pointer hover:border-blue-400 transition-colors">
                  <Upload className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-blue-600 mb-1">
                    Upload PDF Template
                  </span>
                  <span className="text-xs text-gray-600 text-center">
                    Click to upload or drag and drop
                  </span>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) handlePDFUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Visual Builder Info */}
          {creationMethod === 'visual' && (
            <div className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-green-50">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900 mb-1">
                    Visual Form Builder
                  </p>
                  <p className="text-xs text-green-700">
                    Add fields below to build your form. The PDF will be generated automatically with GMG branding (header & footer).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form Builder Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <FormBuilderPanel
              formStructure={formStructure}
              selectedField={selectedField}
              activeSectionId={activeSectionId}
              onFieldSelect={handleFieldSelect}
              onFieldUpdate={handleFieldUpdate}
              onFieldDelete={handleFieldDelete}
              onFieldReorder={handleFieldReorder}
              onAddField={handleAddField}
              onSectionUpdate={handleSectionUpdate}
              onAddSection={handleAddSection}
              onActiveSectionChange={setActiveSectionId}
              onSectionSelect={(section) => {
                setSelectedSection(section);
                setShowSectionConfig(true);
                setShowFieldConfig(false);
                setSelectedField(null);
              }}
            />

            {/* Field Configuration Panel - Mobile Bottom Sheet */}
            {showFieldConfig && selectedField && (
              <div className="sm:hidden fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 rounded-t-lg shadow-lg z-50 max-h-[70vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Configure Field</h3>
                  <button
                    onClick={() => {
                      setShowFieldConfig(false);
                      setSelectedField(null);
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                <div className="p-4">
                  <FieldConfigurationPanel
                    field={selectedField}
                    formStructure={formStructure}
                    onUpdate={(updates) => handleFieldUpdate(selectedField.id, updates)}
                    onClose={() => {
                      setShowFieldConfig(false);
                      setSelectedField(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Section Configuration Panel - Mobile Bottom Sheet */}
            {showSectionConfig && selectedSection && (
              <div className="sm:hidden fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 rounded-t-lg shadow-lg z-50 max-h-[80vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Configure Section</h3>
                  <button
                    onClick={() => {
                      setShowSectionConfig(false);
                      setSelectedSection(null);
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                <div className="p-4">
                  <SectionConfigurationPanel
                    section={selectedSection}
                    formStructure={formStructure}
                    onUpdate={(updates) => {
                      handleSectionUpdate(selectedSection.id, updates);
                    }}
                    onClose={() => {
                      setShowSectionConfig(false);
                      setSelectedSection(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Form Preview (Hidden on mobile by default, toggleable) */}
        {showPreview && (
          <div className={`${showPreview ? 'lg:w-1/2' : 'hidden'} border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-100 flex flex-col overflow-hidden`}>
            <FormRenderer
              formStructure={formStructure}
              formTitle={templateName || 'Form Preview'}
              applicationData={previewData}
              onFormDataChange={(data) => setPreviewData(data)}
            />
          </div>
        )}

        {/* Field Configuration Panel - Desktop Sidebar */}
        {showFieldConfig && selectedField && (
          <div className="hidden sm:block w-80 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="font-semibold text-gray-900">Configure Field</h3>
              <button
                onClick={() => {
                  setShowFieldConfig(false);
                  setSelectedField(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="p-4">
              <FieldConfigurationPanel
                field={selectedField}
                formStructure={formStructure}
                onUpdate={(updates) => handleFieldUpdate(selectedField.id, updates)}
                onClose={() => {
                  setShowFieldConfig(false);
                  setSelectedField(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Section Configuration Panel - Desktop Sidebar */}
        {showSectionConfig && selectedSection && (
          <div className="hidden sm:block w-80 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="font-semibold text-gray-900">Configure Section</h3>
              <button
                onClick={() => {
                  setShowSectionConfig(false);
                  setSelectedSection(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="p-4">
              <SectionConfigurationPanel
                section={selectedSection}
                formStructure={formStructure}
                onUpdate={(updates) => {
                  handleSectionUpdate(selectedSection.id, updates);
                }}
                onClose={() => {
                  setShowSectionConfig(false);
                  setSelectedSection(null);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

