import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getPropertyState, getSettlementDocumentType } from '../../lib/pricingUtils';
import { prepareSettlementFormData, generateSettlementPDF } from '../../lib/settlementPdfService';
import {
  Building2,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  FileText,
  Save,
  Send,
  AlertCircle,
  CheckCircle,
  Download
} from 'lucide-react';

export default function AdminSettlementForm({ applicationId, onClose }) {
  const [application, setApplication] = useState(null);
  const [hoaProperty, setHoaProperty] = useState(null);
  const [formData, setFormData] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState({});
  const [propertyState, setPropertyState] = useState(null);
  const [documentType, setDocumentType] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    loadApplicationData();
    loadCurrentUser();
  }, [applicationId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .single();
      setUser(userData);
    }
  };

  const loadApplicationData = async () => {
    try {
      setLoading(true);

      // Load application data
      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;
      setApplication(appData);

      // Load HOA property data
      const { data: propertyData, error: propertyError } = await supabase
        .from('hoa_properties')
        .select('*')
        .eq('name', appData.hoa_property)
        .single();

      if (propertyError) throw propertyError;
      setHoaProperty(propertyData);

      // Determine property state and document type
      const state = getPropertyState(propertyData.location);
      setPropertyState(state);
      setDocumentType(getSettlementDocumentType(state));

      // Check if settlement form already exists
      const { data: existingForm } = await supabase
        .from('property_owner_forms')
        .select('*')
        .eq('application_id', applicationId)
        .eq('form_type', 'settlement_form')
        .single();

      if (existingForm) {
        setFormData(existingForm.form_data || {});
        setIsCompleted(existingForm.status === 'completed');
      } else {
        // Initialize form with auto-filled data
        initializeFormData(appData, propertyData);
      }

    } catch (error) {
      console.error('Error loading application data:', error);
      setErrors({ general: 'Failed to load application data' });
    } finally {
      setLoading(false);
    }
  };

  const initializeFormData = (appData, propertyData) => {
    const initialData = {
      // Property Information (auto-filled, read-only)
      propertyName: propertyData.name,
      propertyAddress: appData.property_address,
      unitNumber: appData.unit_number || '',
      associationName: propertyData.name,
      associationAddress: propertyData.location,

      // Buyer Information (auto-filled, read-only)
      buyerName: appData.buyer_name,
      buyerEmail: appData.buyer_email,
      buyerPhone: appData.buyer_phone,
      
      // Closing Information (auto-filled, read-only)
      estimatedClosingDate: appData.closing_date,
      settlementAgentName: appData.submitter_name,
      settlementAgentEmail: appData.submitter_email,
      settlementAgentPhone: appData.submitter_phone,

      // Community Manager Information (auto-filled from user profile, editable)
      managerName: user?.name || '',
      managerTitle: user?.title || 'Community Manager',
      managerCompany: user?.company || 'GMG Community Management',
      managerPhone: user?.phone || '',
      managerEmail: user?.email || '',

      // Assessment Information (to be filled by accountant)
      monthlyAssessment: '',
      assessmentDueDate: '',
      unpaidAssessments: '0.00',
      transferFee: '',
      totalAmountDue: '',

      // Additional fields based on state
      ...(propertyState === 'VA' ? {
        capitalContribution: '',
        workingCapital: '',
        otherFees: '',
        otherFeesDescription: '',
      } : {
        regularAssessmentAmount: '',
        assessmentFrequency: 'Monthly',
        lastPaymentDate: '',
        unpaidRegularAssessments: '0.00',
        specialAssessmentAmount: '0.00',
        unpaidSpecialAssessments: '0.00',
        lateFees: '0.00',
        interestCharges: '0.00',
        attorneyFees: '0.00',
        otherCharges: '0.00',
      })
    };

    setFormData(initialData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields validation
    const requiredFields = [
      'managerName',
      'managerTitle',
      'managerPhone',
      'managerEmail',
      'monthlyAssessment',
      'totalAmountDue'
    ];

    requiredFields.forEach(field => {
      if (!formData[field] || formData[field].toString().trim() === '') {
        newErrors[field] = 'This field is required';
      }
    });

    // Email validation
    if (formData.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.managerEmail)) {
      newErrors.managerEmail = 'Please enter a valid email address';
    }

    // Phone validation
    if (formData.managerPhone && !/^[\+]?[1-9][\d]{0,15}$/.test(formData.managerPhone.replace(/[^\d]/g, ''))) {
      newErrors.managerPhone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveForm = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from('property_owner_forms')
        .upsert({
          application_id: applicationId,
          form_type: 'settlement_form',
          form_data: formData,
          status: 'in_progress',
          assigned_to: user?.id,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'application_id,form_type' 
        });

      if (error) throw error;

      alert('Form saved successfully!');
    } catch (error) {
      console.error('Error saving form:', error);
      setErrors({ general: 'Failed to save form' });
    } finally {
      setSaving(false);
    }
  };

  const completeAndSubmitForm = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setGenerating(true);

      // Generate PDF
      const pdfResult = await generateSettlementPDF(formData, propertyState, applicationId);

      // Update form as completed
      const { error: formError } = await supabase
        .from('property_owner_forms')
        .upsert({
          application_id: applicationId,
          form_type: 'settlement_form',
          form_data: formData,
          status: 'completed',
          assigned_to: user?.id,
          completed_at: new Date().toISOString(),
          pdf_url: pdfResult.publicURL
        }, { 
          onConflict: 'application_id,form_type' 
        });

      if (formError) throw formError;

      // Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({
          status: 'completed',
          settlement_pdf_url: pdfResult.publicURL,
          completed_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (appError) throw appError;

      setIsCompleted(true);
      alert('Settlement form completed and PDF generated successfully!');

    } catch (error) {
      console.error('Error completing form:', error);
      setErrors({ general: 'Failed to complete form and generate PDF' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-2">Loading settlement form...</span>
      </div>
    );
  }

  if (!application || !hoaProperty) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Not Found</h3>
        <p className="text-gray-600">Could not load application or property data.</p>
        <button 
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Settlement Form</h2>
            <p className="text-gray-600">{documentType} - {propertyState}</p>
          </div>
          <div className="flex items-center space-x-2">
            {isCompleted && (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span className="font-medium">Completed</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              ✕
            </button>
          </div>
        </div>
        
        {errors.general && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
              <span className="text-red-700">{errors.general}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        {/* Property Information Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Building2 className="h-5 w-5 mr-2" />
            Property Information (Auto-filled)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Name</label>
              <input
                type="text"
                value={formData.propertyName || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
              <input
                type="text"
                value={formData.propertyAddress || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Number</label>
              <input
                type="text"
                value={formData.unitNumber || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Association Name</label>
              <input
                type="text"
                value={formData.associationName || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
          </div>
        </div>

        {/* Buyer Information Section */}
        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <User className="h-5 w-5 mr-2" />
            Buyer Information (Auto-filled)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name</label>
              <input
                type="text"
                value={formData.buyerName || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Email</label>
              <input
                type="email"
                value={formData.buyerEmail || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Phone</label>
              <input
                type="tel"
                value={formData.buyerPhone || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Closing Date</label>
              <input
                type="date"
                value={formData.estimatedClosingDate || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                disabled
              />
            </div>
          </div>
        </div>

        {/* Community Manager Section */}
        <div className="bg-green-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <User className="h-5 w-5 mr-2" />
            Community Manager Information (Editable)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name *</label>
              <input
                type="text"
                value={formData.managerName || ''}
                onChange={(e) => handleInputChange('managerName', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${errors.managerName ? 'border-red-300' : 'border-gray-300'}`}
                disabled={isCompleted}
              />
              {errors.managerName && <p className="text-red-500 text-sm mt-1">{errors.managerName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Title *</label>
              <input
                type="text"
                value={formData.managerTitle || ''}
                onChange={(e) => handleInputChange('managerTitle', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${errors.managerTitle ? 'border-red-300' : 'border-gray-300'}`}
                disabled={isCompleted}
              />
              {errors.managerTitle && <p className="text-red-500 text-sm mt-1">{errors.managerTitle}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value={formData.managerCompany || ''}
                onChange={(e) => handleInputChange('managerCompany', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isCompleted}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone *</label>
              <input
                type="tel"
                value={formData.managerPhone || ''}
                onChange={(e) => handleInputChange('managerPhone', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${errors.managerPhone ? 'border-red-300' : 'border-gray-300'}`}
                disabled={isCompleted}
              />
              {errors.managerPhone && <p className="text-red-500 text-sm mt-1">{errors.managerPhone}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email *</label>
              <input
                type="email"
                value={formData.managerEmail || ''}
                onChange={(e) => handleInputChange('managerEmail', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${errors.managerEmail ? 'border-red-300' : 'border-gray-300'}`}
                disabled={isCompleted}
              />
              {errors.managerEmail && <p className="text-red-500 text-sm mt-1">{errors.managerEmail}</p>}
            </div>
          </div>
        </div>

        {/* Assessment Information Section */}
        <div className="bg-yellow-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Assessment Information
          </h3>
          
          {propertyState === 'VA' ? (
            // Virginia specific fields
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Assessment *</label>
                <input
                  type="text"
                  value={formData.monthlyAssessment || ''}
                  onChange={(e) => handleInputChange('monthlyAssessment', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md ${errors.monthlyAssessment ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
                {errors.monthlyAssessment && <p className="text-red-500 text-sm mt-1">{errors.monthlyAssessment}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Due Date</label>
                <input
                  type="date"
                  value={formData.assessmentDueDate || ''}
                  onChange={(e) => handleInputChange('assessmentDueDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unpaid Assessments</label>
                <input
                  type="text"
                  value={formData.unpaidAssessments || ''}
                  onChange={(e) => handleInputChange('unpaidAssessments', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Fee</label>
                <input
                  type="text"
                  value={formData.transferFee || ''}
                  onChange={(e) => handleInputChange('transferFee', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capital Contribution</label>
                <input
                  type="text"
                  value={formData.capitalContribution || ''}
                  onChange={(e) => handleInputChange('capitalContribution', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Working Capital</label>
                <input
                  type="text"
                  value={formData.workingCapital || ''}
                  onChange={(e) => handleInputChange('workingCapital', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount Due *</label>
                <input
                  type="text"
                  value={formData.totalAmountDue || ''}
                  onChange={(e) => handleInputChange('totalAmountDue', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md ${errors.totalAmountDue ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
                {errors.totalAmountDue && <p className="text-red-500 text-sm mt-1">{errors.totalAmountDue}</p>}
              </div>
            </div>
          ) : (
            // North Carolina specific fields
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Regular Assessment Amount *</label>
                <input
                  type="text"
                  value={formData.regularAssessmentAmount || ''}
                  onChange={(e) => handleInputChange('regularAssessmentAmount', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md ${errors.regularAssessmentAmount ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Frequency</label>
                <select
                  value={formData.assessmentFrequency || 'Monthly'}
                  onChange={(e) => handleInputChange('assessmentFrequency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  disabled={isCompleted}
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unpaid Regular Assessments</label>
                <input
                  type="text"
                  value={formData.unpaidRegularAssessments || ''}
                  onChange={(e) => handleInputChange('unpaidRegularAssessments', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unpaid Special Assessments</label>
                <input
                  type="text"
                  value={formData.unpaidSpecialAssessments || ''}
                  onChange={(e) => handleInputChange('unpaidSpecialAssessments', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Late Fees</label>
                <input
                  type="text"
                  value={formData.lateFees || ''}
                  onChange={(e) => handleInputChange('lateFees', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Charges</label>
                <input
                  type="text"
                  value={formData.interestCharges || ''}
                  onChange={(e) => handleInputChange('interestCharges', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount Due *</label>
                <input
                  type="text"
                  value={formData.totalAmountDue || ''}
                  onChange={(e) => handleInputChange('totalAmountDue', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md ${errors.totalAmountDue ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="$0.00"
                  disabled={isCompleted}
                />
                {errors.totalAmountDue && <p className="text-red-500 text-sm mt-1">{errors.totalAmountDue}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!isCompleted && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-600 hover:text-gray-800"
              disabled={saving || generating}
            >
              Cancel
            </button>
            
            <div className="flex space-x-4">
              <button
                onClick={saveForm}
                disabled={saving || generating}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Draft
              </button>
              
              <button
                onClick={completeAndSubmitForm}
                disabled={saving || generating}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                {generating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Complete & Generate PDF
              </button>
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="flex items-center text-green-600">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span>Form completed and PDF generated</span>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => window.open(application.settlement_pdf_url, '_blank')}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                View PDF
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}