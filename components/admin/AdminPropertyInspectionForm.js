import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save, Send, FileText, Calendar, Clock, User, CheckCircle, ArrowLeft, Building } from 'lucide-react';
import { useRouter } from 'next/router';

const AdminPropertyInspectionForm = ({ 
  applicationData,
  formId,
  onComplete,
  isModal = false
}) => {
  const [formData, setFormData] = useState({
    association: applicationData?.hoa_properties?.name || '',
    primaryContact: '',
    signatureContact: '',
    inspectionDate: '',
    inspectionTime: '',
    inspectorName: '',
    approvedModifications: '',
    covenantViolations: '',
    generalComments: '',
    status: 'in_progress'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const supabase = createClientComponentClient();
  const router = useRouter();

  // Load existing form data if any
  useEffect(() => {
    if (applicationData?.property_owner_forms?.[0]) {
      const existingData = applicationData.property_owner_forms[0].response_data || 
                          applicationData.property_owner_forms[0].form_data || {};
      
      setFormData(prev => ({
        ...prev,
        association: applicationData.hoa_properties?.name || '',
        ...existingData
      }));
    }
  }, [applicationData]);

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
      const { error } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: formData,
          response_data: formData,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', formId);

      if (error) throw error;
      
      setSuccess('Form saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
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
        completedAt: new Date().toISOString(),
        completedBy: 'admin'
      };

      // Update the form
      const { error: formError } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: submissionData,
          response_data: submissionData,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', formId);

      if (formError) throw formError;

      // Update the applications table to mark this task as completed
      const { error: updateAppError } = await supabase
        .from('applications')
        .update({
          inspection_form_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationData.id);

      if (updateAppError) throw updateAppError;

      // Check if both forms are completed to update application status
      const { data: allForms } = await supabase
        .from('property_owner_forms')
        .select('status')
        .eq('application_id', applicationData.id);

      const allCompleted = allForms?.every(form => form.status === 'completed');

      if (allCompleted) {
        // Update application status
        await supabase
          .from('applications')
          .update({
            status: 'compliance_completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', applicationData.id);
      }
      
      setSuccess('Form completed successfully! Redirecting to dashboard...');
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      setError('Failed to submit form: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = formData.inspectionDate && 
                   formData.inspectionTime && 
                   formData.inspectorName && 
                   formData.primaryContact;

  return (
    <div className={`${isModal ? 'p-6' : 'max-w-4xl mx-auto p-6'} bg-white ${isModal ? '' : 'min-h-screen'}`}>
      {/* Admin Header */}
      <div className="bg-blue-50 p-6 rounded-lg mb-8 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin: Property Inspection Form</h1>
              <p className="text-gray-600">Complete for Application #{applicationData?.id}</p>
            </div>
          </div>
          {!isModal && (
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          )}
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-600" />
            Application Details
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Property:</strong> {applicationData?.property_address}
              <br />
              <strong>HOA:</strong> {applicationData?.hoa_properties?.name}
              <br />
              <strong>Submitter:</strong> {applicationData?.submitter_name}
            </div>
            <div>
              <strong>Buyer:</strong> {applicationData?.buyer_name}
              <br />
              <strong>Seller:</strong> {applicationData?.seller_name}
              <br />
              <strong>Sale Price:</strong> ${applicationData?.sale_price?.toLocaleString()}
            </div>
          </div>
        </div>
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

      {/* Association Header */}
      <div className="bg-gray-50 p-6 rounded-lg mb-8 border">
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Association: {formData.association}
          </h2>
        </div>
      </div>

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
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t">
        <div className="text-sm text-gray-500">
          Completing as: <span className="font-medium">GMG Admin</span>
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
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Completing...' : 'Complete Form'}
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
    </div>
  );
};

export default AdminPropertyInspectionForm;
