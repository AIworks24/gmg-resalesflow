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
    <div className={`${isModal ? 'p-0 h-full flex flex-col' : 'max-w-4xl mx-auto p-6'} bg-gray-50/50 ${isModal ? '' : 'min-h-screen'}`}>
      {/* Admin Header - Fixed at top for modal */}
      <div className={`${isModal ? 'sticky top-0 z-10' : 'mb-8'} bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between border-t-4 border-t-amber-500`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin: Property Inspection Form</h1>
            <p className="text-xs text-gray-500">Application #{applicationData?.id} • Compliance Verification</p>
          </div>
        </div>
        
        {!isModal ? (
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all text-sm font-medium shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        ) : (
          <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            Inspection
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 ${!isModal ? 'pt-0' : ''}`}>
        
        {/* Application Details Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <Building className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Application Details
            </h2>
          </div>
          <div className="p-5">
            <div className="grid md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
              <div>
                <div className="mb-3">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Property Address</span>
                  <span className="font-medium text-gray-900">{applicationData?.property_address}</span>
                </div>
                <div className="mb-3">
                  <span className="block text-xs font-medium text-gray-500 mb-1">HOA</span>
                  <span className="font-medium text-gray-900">{applicationData?.hoa_properties?.name}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1">Submitter</span>
                  <span className="font-medium text-gray-900">{applicationData?.submitter_name}</span>
                </div>
              </div>
              <div>
                <div className="mb-3">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Buyer</span>
                  <span className="font-medium text-gray-900">{applicationData?.buyer_name}</span>
                </div>
                <div className="mb-3">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Seller</span>
                  <span className="font-medium text-gray-900">{applicationData?.seller_name}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1">Sale Price</span>
                  <span className="font-medium text-gray-900">${applicationData?.sale_price?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <div className="text-red-600 mt-0.5">⚠️</div>
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <p className="text-sm text-green-800 font-medium">{success}</p>
          </div>
        )}

        {/* Association Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <span className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Association Name</span>
            <h2 className="text-lg font-bold text-gray-900">{formData.association}</h2>
          </div>
          <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500">
            <Building className="w-6 h-6" />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-100">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-amber-600" />
              Contact Information
            </h3>
          </div>
          <div className="p-5 grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                Primary Contact <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.primaryContact}
                onChange={(e) => handleInputChange('primaryContact', e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="Enter primary contact name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                Signature Contact
              </label>
              <input
                type="text"
                value={formData.signatureContact}
                onChange={(e) => handleInputChange('signatureContact', e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="Enter signature contact name"
              />
            </div>
          </div>
        </div>

        {/* Inspection Details */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-100">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-amber-600" />
              Inspection Details
            </h3>
          </div>
          <div className="p-5 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                  1. Inspection Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="date"
                    value={formData.inspectionDate}
                    onChange={(e) => handleInputChange('inspectionDate', e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                  2. Inspection Time <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="time"
                    value={formData.inspectionTime}
                    onChange={(e) => handleInputChange('inspectionTime', e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                3. Inspector's Name <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.inspectorName}
                onChange={(e) => handleInputChange('inspectorName', e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 resize-none"
                placeholder="Enter inspector's full name and credentials"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                4. Approved Architectural Modifications
              </label>
              <textarea
                value={formData.approvedModifications}
                onChange={(e) => handleInputChange('approvedModifications', e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="List any approved architectural modifications or improvements to the property"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                5. Covenant Violations Noted
              </label>
              <textarea
                value={formData.covenantViolations}
                onChange={(e) => handleInputChange('covenantViolations', e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                placeholder="Document any covenant violations or compliance issues observed"
              />
            </div>
          </div>
        </div>

        {/* General Comments */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-100">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              General Comments
            </h3>
          </div>
          <div className="p-5">
            <textarea
              value={formData.generalComments}
              onChange={(e) => handleInputChange('generalComments', e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
              placeholder="Additional comments, observations, or recommendations regarding the property inspection"
            />
          </div>
        </div>

        {/* Completion Requirements */}
        {!isComplete && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex gap-2">
              <div className="text-yellow-600 font-bold">!</div>
              <p className="text-yellow-800 text-sm">
                <strong>Required fields:</strong> Inspection Date, Inspection Time, Inspector's Name, and Primary Contact must be completed before submission.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between z-10 sticky bottom-0">
        <div className="text-sm text-gray-500 hidden sm:block">
          Completing as: <span className="font-medium text-gray-900">GMG Admin</span>
        </div>
        
        <div className="flex gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={!isComplete || isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Completing...' : 'Complete Form'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPropertyInspectionForm;
