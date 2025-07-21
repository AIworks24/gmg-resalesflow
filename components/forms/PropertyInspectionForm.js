import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save, Send, FileText, Calendar, Clock, User, CheckCircle } from 'lucide-react';

const PropertyInspectionForm = ({ 
  formId,
  accessToken,
  applicationId,
  propertyName = "Property Owners Association",
  initialData = {}
}) => {
  const [formData, setFormData] = useState({
    association: propertyName,
    primaryContact: '',
    signatureContact: '',
    inspectionDate: '',
    inspectionTime: '',
    inspectorName: '',
    approvedModifications: '',
    covenantViolations: '',
    generalComments: '',
    status: 'not_started'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClientComponentClient();

  // Load form data on component mount
  useEffect(() => {
    if (formId && accessToken) {
      loadFormData();
    }
  }, [formId, accessToken]);

  const loadFormData = async () => {
  try {
    
    const { data, error } = await supabase
      .from('property_owner_forms')
      .select('form_data, response_data, status, application_id, hoa_properties(name)')
      .eq('id', formId)
      .eq('access_token', accessToken)
      .single();

    if (error) {
      console.error('Error loading form:', error);
      throw error;
    }

    if (data) {
      // FIXED: Use form_data first, then response_data as fallback
      const savedData = data.form_data || data.response_data || {};
      
      setFormData(prev => ({
        ...prev,
        association: data.hoa_properties?.name || propertyName,
        ...savedData,
        status: data.status
      }));
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
    setError('Failed to load form data: ' + err.message);
  } finally {
    setIsLoading(false);
  }
};

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      
      const { data, error } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: formData,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', formId)
        .eq('access_token', accessToken)
        .select();

      if (error) {
        console.error('Save error:', error);
        throw error;
      }
    
      setSuccess('Form saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save form:', err);
      setError('Failed to save form: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const submissionData = {
        ...formData,
        status: 'completed',
        completedAt: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: submissionData,
          response_data: submissionData,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', formId)
        .eq('access_token', accessToken)
        .select();

      if (error) {
        console.error('Submit error:', error);
        throw error;
      }
      
      setFormData(submissionData);
      setSuccess('Form submitted successfully! Thank you for your response.');
    } catch (err) {
      console.error('Failed to submit form:', err);
      setError('Failed to submit form: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = formData.inspectionDate && 
                   formData.inspectionTime && 
                   formData.inspectorName && 
                   formData.primaryContact;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white min-h-screen">
      {/* Header */}
      <div className="bg-gray-50 p-6 rounded-lg mb-8 border">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Property Inspection Form</h1>
            <p className="text-gray-600">Application #{applicationId}</p>
          </div>
        </div>
        
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Association: {formData.association}
          </h2>
        </div>
      </div>

      {/* Debug Info (remove this in production) */}
      <div className="bg-gray-100 p-4 rounded mb-4 text-sm">
        <strong>Debug Info:</strong>
        <div>Form ID: {formId}</div>
        <div>Status: {formData.status}</div>
        <div>Primary Contact: {formData.primaryContact || 'empty'}</div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Contact Information */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <User className="w-4 h-4 inline mr-2" />
            Primary Contact: *
          </label>
          <input
            type="text"
            value={formData.primaryContact}
            onChange={(e) => handleInputChange('primaryContact', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter primary contact name"
            disabled={formData.status === 'completed'}
          />
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <User className="w-4 h-4 inline mr-2" />
            Signature Contact:
          </label>
          <input
            type="text"
            value={formData.signatureContact}
            onChange={(e) => handleInputChange('signatureContact', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter signature contact name"
            disabled={formData.status === 'completed'}
          />
        </div>
      </div>

      {/* Inspection Details */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          Inspection Information
        </h3>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              1. Inspection Date: *
            </label>
            <input
              type="date"
              value={formData.inspectionDate}
              onChange={(e) => handleInputChange('inspectionDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={formData.status === 'completed'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-2" />
              2. Inspection Time: *
            </label>
            <input
              type="time"
              value={formData.inspectionTime}
              onChange={(e) => handleInputChange('inspectionTime', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={formData.status === 'completed'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              3. Inspector's Name: *
            </label>
            <textarea
              value={formData.inspectorName}
              onChange={(e) => handleInputChange('inspectorName', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter inspector's full name and credentials"
              disabled={formData.status === 'completed'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              4. Approved Architectural Modifications:
            </label>
            <textarea
              value={formData.approvedModifications}
              onChange={(e) => handleInputChange('approvedModifications', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="List any approved architectural modifications or improvements to the property"
              disabled={formData.status === 'completed'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              5. Covenant Violations Noted:
            </label>
            <textarea
              value={formData.covenantViolations}
              onChange={(e) => handleInputChange('covenantViolations', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Document any covenant violations or compliance issues observed"
              disabled={formData.status === 'completed'}
            />
          </div>
        </div>
      </div>

      {/* General Comments */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">General Comments</h3>
        <textarea
          value={formData.generalComments}
          onChange={(e) => handleInputChange('generalComments', e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Additional comments, observations, or recommendations regarding the property inspection"
          disabled={formData.status === 'completed'}
        />
      </div>

      {/* Status Display */}
      {formData.status === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Form Completed</span>
          </div>
          <p className="text-green-700 mt-1">
            This inspection form has been completed and submitted. Thank you for your response.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {formData.status !== 'completed' && (
        <>
          <div className="flex justify-between items-center pt-6 border-t">
            <div className="text-sm text-gray-500">
              Form Status: <span className="font-medium capitalize">{formData.status}</span>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Draft'}
              </button>
              
              <button
                onClick={handleSubmit}
                disabled={!isComplete || isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Form'}
              </button>
            </div>
          </div>

          {/* Completion Requirements */}
          {!isComplete && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm">
                <strong>Required fields:</strong> Inspection Date, Inspection Time, Inspector's Name, and Primary Contact must be completed before submission.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PropertyInspectionForm;
