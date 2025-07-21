import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save, Send, FileText, Calendar, ArrowLeft, Building, CheckCircle, AlertTriangle, Plus, Trash2, DollarSign, Clock, Users, Home, Car, Briefcase, Flag, Sun, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/router';

const AdminResaleCertificateForm = ({ 
  applicationData,
  formId,
  onComplete,
  isModal = false
}) => {
  const router = useRouter();
  const [formData, setFormData] = useState({
    // Header Information
    developmentName: applicationData?.hoa_properties?.name || '',
    developmentLocation: '',
    associationName: applicationData?.hoa_properties?.name || '',
    associationAddress: '',
    lotAddress: applicationData?.property_address || '',
    datePrepared: new Date().toISOString().split('T')[0],
    
    // Appendix 1: Contact Information
    preparer: {
      name: '',
      company: 'Goodman Management Group',
      address: '',
      phone: '(804) 360-2115',
      email: 'resales@gmgva.com'
    },
    managingAgent: {
      exists: false,
      name: '',
      company: '',
      licenseNumber: '',
      address: '',
      phone: '',
      email: ''
    },
    
    // Disclosures (Sections 1-30)
    disclosures: {
      // 1. Contact Information
      contactInfoAttached: true,
      
      // 2. Governing Documents (Appendix 2)
      governingDocsAttached: false,
      rulesRegulationsAttached: false,
      
      // 3. Restraints on Alienation (Appendix 3)
      restraintsExist: false,
      restraintsArticleSection: '',
      restraintsDescription: '',
      
      // 4. Association Assessments (Appendix 4)
      assessmentSchedule: {
        hasAssessments: true,
        monthly: false,
        monthlyAmount: '',
        quarterly: false,
        quarterlyAmount: '',
        periodic: false,
        periodicInterval: '',
        periodicAmount: '',
        currentAssessmentDue: '',
        currentAssessmentDueDate: '',
        unpaidAssessments: '',
        hasTransferAssessment: false,
        transferAssessmentAmount: ''
      },
      
      // 5. Association Fees (Appendix 5)
      fees: {
        hasOtherFees: false,
        otherFeesAmount: '',
        otherFeesDescription: '',
        unpaidFeesAmount: '',
        unpaidFeesDescription: ''
      },
      
      // 6. Other Entity Assessments (Appendix 6)
      otherEntity: {
        isLiable: false,
        entities: []
      },
      
      // 7. Special Assessments (Appendix 7)
      specialAssessments: {
        hasApproved: false,
        approvedAmount: '',
        approvedDueDate: '',
        unpaidAmount: ''
      },
      
      // 8. Capital Expenditures (Appendix 8)
      capitalExpenditures: {
        hasApproved: false,
        details: ''
      },
      
      // 9. Reserves (Appendix 9)
      reserves: {
        hasReserves: false,
        totalAmount: '',
        hasDesignated: false,
        designatedProjects: []
      },
      
      // 10. Financial Statements (Appendix 10)
      financialStatements: {
        balanceSheetAttached: false,
        incomeStatementAttached: false
      },
      
      // 11. Operating Budget (Appendix 11)
      operatingBudget: {
        budgetAttached: true
      },
      
      // 12. Reserve Study (Appendix 12)
      reserveStudy: {
        type: 'not_required', // 'current', 'summary', 'not_required'
        currentAttached: false,
        summaryAttached: false
      },
      
      // 13. Legal Issues (Appendix 13)
      legalIssues: {
        hasIssues: false,
        details: ''
      },
      
      // 14. Insurance (Appendix 14)
      insurance: {
        associationProvides: false,
        coverageDetails: [],
        recommendsOwnerCoverage: false,
        ownerRequirements: ''
      },
      
      // 15. Association Violations (Appendix 15)
      associationViolations: {
        hasNotices: false,
        noticesAttached: false
      },
      
      // 16. Government Violations (Appendix 16)
      governmentViolations: {
        hasNotices: false,
        noticesAttached: false
      },
      
      // 17. Board Minutes (Appendix 17)
      boardMinutes: {
        attached: false,
        notApplicable: true
      },
      
      // 18. Association Minutes (Appendix 18)
      associationMinutes: {
        attached: false,
        notApplicable: false
      },
      
      // 19. Leasehold Estates (Appendix 19)
      leaseholdEstates: {
        exists: false,
        remainingTerm: '',
        documentsAttached: false
      },
      
      // 20. Occupancy Limitations (Appendix 20)
      occupancyLimitations: {
        hasLimitations: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 21. Flag Restrictions (Appendix 21)
      flagRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 22. Solar Restrictions (Appendix 22)
      solarRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 23. Sign Restrictions (Appendix 23)
      signRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 24. Parking Restrictions (Appendix 24)
      parkingRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 25. Business Restrictions (Appendix 25)
      businessRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 26. Rental Restrictions (Appendix 26)
      rentalRestrictions: {
        hasRestrictions: false,
        articleSection: '',
        documentReference: ''
      },
      
      // 27. Tax Deductibility (Appendix 27)
      taxDeductibility: {
        statementAttached: false,
        notApplicable: true
      },
      
      // 28. Pending Sales (Appendix 28)
      pendingSales: {
        hasPending: false,
        documentsAttached: false
      },
      
      // 29. Mortgage Approvals (Appendix 29)
      mortgageApprovals: {
        hasApprovals: false,
        approvedAgencies: [],
        otherAgencyName: ''
      },
      
      // 30. CIC Board Certification (Appendix 30)
      cicCertification: {
        reportFiled: true,
        registrationNumber: '',
        expirationDate: ''
      }
    },
    
    status: 'in_progress'
  });

  const [currentSection, setCurrentSection] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    if (applicationData?.property_owner_forms?.[0]) {
      const existingData = applicationData.property_owner_forms[0].response_data || 
                          applicationData.property_owner_forms[0].form_data || {};
      
      setFormData(prev => ({
        ...prev,
        developmentName: applicationData.hoa_properties?.name || '',
        associationName: applicationData.hoa_properties?.name || '',
        lotAddress: applicationData.property_address || '',
        ...existingData
      }));
    }
  }, [applicationData]);

  const handleInputChange = (field, value) => {
    const fieldParts = field.split('.');
    
    setFormData(prev => {
      const newData = { ...prev };
      let current = newData;
      
      for (let i = 0; i < fieldParts.length - 1; i++) {
        if (!current[fieldParts[i]]) {
          current[fieldParts[i]] = {};
        }
        current = current[fieldParts[i]];
      }
      
      current[fieldParts[fieldParts.length - 1]] = value;
      return newData;
    });
  };

  const addArrayItem = (fieldPath, item) => {
    const current = getNestedValue(formData, fieldPath) || [];
    handleInputChange(fieldPath, [...current, item]);
  };

  const removeArrayItem = (fieldPath, index) => {
    const current = getNestedValue(formData, fieldPath) || [];
    handleInputChange(fieldPath, current.filter((_, i) => i !== index));
  };

  const updateArrayItem = (fieldPath, index, newItem) => {
    const current = getNestedValue(formData, fieldPath) || [];
    const updated = [...current];
    updated[index] = newItem;
    handleInputChange(fieldPath, updated);
  };

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    // Patch: Merge otherAgencyName into approvedAgencies if present
    let patchedFormData = { ...formData };
    const agencies =
      patchedFormData.disclosures.mortgageApprovals.approvedAgencies || [];
    const otherAgency =
      patchedFormData.disclosures.mortgageApprovals.otherAgencyName?.trim();
    if (otherAgency && !agencies.includes(otherAgency)) {
      patchedFormData.disclosures.mortgageApprovals.approvedAgencies = [
        ...agencies.filter((a) => a !== 'Other'),
        otherAgency,
      ];
    }

    try {
      const { data, error } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: patchedFormData,
          response_data: patchedFormData,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', formId)
        .select();

      if (error) throw error;

      setSuccess('Virginia Resale Certificate saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save certificate: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    // Patch: Merge otherAgencyName into approvedAgencies if present
    let patchedFormData = { ...formData };
    const agencies =
      patchedFormData.disclosures.mortgageApprovals.approvedAgencies || [];
    const otherAgency =
      patchedFormData.disclosures.mortgageApprovals.otherAgencyName?.trim();
    if (otherAgency && !agencies.includes(otherAgency)) {
      patchedFormData.disclosures.mortgageApprovals.approvedAgencies = [
        ...agencies.filter((a) => a !== 'Other'),
        otherAgency,
      ];
    }

    try {
      // First try to get the current form data
      const { data: currentForm, error: getError } = await supabase
        .from('property_owner_forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (getError) {
        console.error('Error getting current form:', getError);
        throw getError;
      }

      const submissionData = {
        ...patchedFormData,
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: 'admin',
      };

      // Then update with new data
      const { data: updatedForm, error: updateError } = await supabase
        .from('property_owner_forms')
        .update({
          form_data: submissionData,
          response_data: submissionData,
          status: isComplete ? 'completed' : 'in_progress',
          completed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq('id', formId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update the applications table to mark this task as completed (only if form is complete)
      if (isComplete) {
        const { error: updateAppError } = await supabase
          .from('applications')
          .update({
            resale_certificate_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', applicationData.id);

        if (updateAppError) throw updateAppError;
      }

      // Check if both forms are completed
      const { data: allForms } = await supabase
        .from('property_owner_forms')
        .select('status')
        .eq('application_id', applicationData.id);

      const allCompleted = allForms?.every(
        (form) => form.status === 'completed'
      );

      if (allCompleted) {
        await supabase
          .from('applications')
          .update({
            status: 'compliance_completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', applicationData.id);
      }

      setSuccess(
        'Virginia Resale Certificate completed successfully! Redirecting to dashboard...'
      );
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to complete certificate: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sections = [
    { id: 1, title: 'Certificate Header', icon: FileText },
    { id: 2, title: 'Contact Information (App. 1)', icon: Users },
    { id: 3, title: 'Documents & Restraints (App. 2-3)', icon: FileText },
    { id: 4, title: 'Financial (App. 4-12)', icon: DollarSign },
    { id: 5, title: 'Legal & Insurance (App. 13-16)', icon: AlertTriangle },
    { id: 6, title: 'Meeting Minutes (App. 17-18)', icon: Calendar },
    { id: 7, title: 'Property Restrictions (App. 19-26)', icon: Home },
    { id: 8, title: 'Final Certifications (App. 27-30)', icon: CheckCircle }
  ];

  const isComplete = formData.developmentName && 
                   formData.developmentLocation && 
                   formData.associationName && 
                   formData.associationAddress && 
                   formData.preparer.name && 
                   formData.disclosures.assessmentSchedule.hasAssessments &&
                   formData.disclosures.cicCertification.registrationNumber &&
                   formData.disclosures.cicCertification.expirationDate;

  const getCompletionPercentage = () => {
    const requiredFields = [
      formData.developmentName,
      formData.developmentLocation,
      formData.associationName,
      formData.associationAddress,
      formData.lotAddress,
      formData.preparer.name,
      formData.preparer.company,
      formData.preparer.address,
      formData.preparer.phone,
      formData.preparer.email,
      formData.disclosures.cicCertification.registrationNumber,
      formData.disclosures.cicCertification.expirationDate
    ];
    
    const completedFields = requiredFields.filter(field => field && field.toString().trim() !== '').length;
    return Math.round((completedFields / requiredFields.length) * 100);
  };

  const renderSection = () => {
    switch (currentSection) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Certificate Header Information</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name of Development: *
                </label>
                <input
                  type="text"
                  value={formData.developmentName}
                  onChange={(e) => handleInputChange('developmentName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location (County/City): *
                </label>
                <input
                  type="text"
                  value={formData.developmentLocation}
                  onChange={(e) => handleInputChange('developmentLocation', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., Henrico County, VA"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Association Name: *
                </label>
                <input
                  type="text"
                  value={formData.associationName}
                  onChange={(e) => handleInputChange('associationName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Association Address: *
                </label>
                <input
                  type="text"
                  value={formData.associationAddress}
                  onChange={(e) => handleInputChange('associationAddress', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lot Address/Number/Reference: *
                </label>
                <input
                  type="text"
                  value={formData.lotAddress}
                  onChange={(e) => handleInputChange('lotAddress', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Prepared: *
                </label>
                <input
                  type="date"
                  value={formData.datePrepared}
                  onChange={(e) => handleInputChange('datePrepared', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        );
        
     case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Contact Information (Appendix 1)</h3>
            
            {/* Section 1: Contact Information Checkbox */}
            <div className="bg-blue-50 p-4 rounded-lg border">
              <h4 className="font-semibold text-blue-900 mb-4">1. Contact Information</h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.disclosures.contactInfoAttached}
                  onChange={(e) => handleInputChange('disclosures.contactInfoAttached', e.target.checked)}
                  className="mr-2"
                />
                <span>Contact information for the preparer of the resale certificate and any managing agent is attached. See Appendix 1.</span>
              </label>
            </div>

            {/* Preparer Information */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">Preparer of the Resale Certificate</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name: *</label>
                  <input
                    type="text"
                    value={formData.preparer.name}
                    onChange={(e) => handleInputChange('preparer.name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company:</label>
                  <input
                    type="text"
                    value={formData.preparer.company}
                    onChange={(e) => handleInputChange('preparer.company', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mailing Address:</label>
                  <textarea
                    value={formData.preparer.address}
                    onChange={(e) => handleInputChange('preparer.address', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number:</label>
                  <input
                    type="tel"
                    value={formData.preparer.phone}
                    onChange={(e) => handleInputChange('preparer.phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email:</label>
                  <input
                    type="email"
                    value={formData.preparer.email}
                    onChange={(e) => handleInputChange('preparer.email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
            
            {/* Managing Agent Information */}
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-800">Managing Agent</h4>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={!formData.managingAgent.exists}
                    onChange={(e) => handleInputChange('managingAgent.exists', !e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">Not applicable. The association does not have a managing agent.</span>
                </label>
              </div>
              
              {formData.managingAgent.exists && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name:</label>
                    <input
                      type="text"
                      value={formData.managingAgent.name}
                      onChange={(e) => handleInputChange('managingAgent.name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company:</label>
                    <input
                      type="text"
                      value={formData.managingAgent.company}
                      onChange={(e) => handleInputChange('managingAgent.company', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CIC Manager License No. (if applicable):</label>
                    <input
                      type="text"
                      value={formData.managingAgent.licenseNumber}
                      onChange={(e) => handleInputChange('managingAgent.licenseNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number:</label>
                    <input
                      type="tel"
                      value={formData.managingAgent.phone}
                      onChange={(e) => handleInputChange('managingAgent.phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mailing Address:</label>
                    <textarea
                      value={formData.managingAgent.address}
                      onChange={(e) => handleInputChange('managingAgent.address', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email:</label>
                    <input
                      type="email"
                      value={formData.managingAgent.email}
                      onChange={(e) => handleInputChange('managingAgent.email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Governing Documents & Restraints (Sections 2-3)</h3>
            
            {/* Section 2: Governing Documents (Appendix 2) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">2. Governing Documents and Rules and Regulations (Appendix 2)</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.governingDocsAttached}
                    onChange={(e) => handleInputChange('disclosures.governingDocsAttached', e.target.checked)}
                    className="mr-2"
                  />
                  <span>A copy of the association governing documents and rules and regulations are attached. See Appendix 2.</span>
                </label>
                
                <div className="ml-6 space-y-2 text-sm text-gray-600">
                  <p><strong>The following are attached in this Appendix:</strong></p>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.governingDocsAttached}
                      onChange={(e) => handleInputChange('disclosures.governingDocsAttached', e.target.checked)}
                      className="mr-2"
                    />
                    <span>Association governing documents (required)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.rulesRegulationsAttached}
                      onChange={(e) => handleInputChange('disclosures.rulesRegulationsAttached', e.target.checked)}
                      className="mr-2"
                    />
                    <span>Rules and regulations</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 3: Restraints on Alienation (Appendix 3) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">3. Restraints on Alienation (Appendix 3)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="restraints"
                      checked={formData.disclosures.restraintsExist}
                      onChange={(e) => handleInputChange('disclosures.restraintsExist', true)}
                      className="mr-2"
                    />
                    <span>There <strong>is</strong> any restraint on free alienability of any of the units. See Appendix 3.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="restraints"
                      checked={!formData.disclosures.restraintsExist}
                      onChange={(e) => handleInputChange('disclosures.restraintsExist', false)}
                      className="mr-2"
                    />
                    <span>There <strong>is not</strong> any restraint on free alienability of any of the units. See Appendix 3.</span>
                  </label>
                </div>
                
                {formData.disclosures.restraintsExist && (
                  <div className="pl-6 space-y-4 bg-yellow-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ creates a right(s) of first refusal or other restraint(s) on free alienability of the unit:</label>
                      <input
                        type="text"
                        value={formData.disclosures.restraintsArticleSection}
                        onChange={(e) => handleInputChange('disclosures.restraintsArticleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., Article 5, Section 2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description of Restraint:</label>
                      <textarea
                        value={formData.disclosures.restraintsDescription}
                        onChange={(e) => handleInputChange('disclosures.restraintsDescription', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe the restraint on alienability..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Financial Disclosures (Sections 4-12)</h3>
            
            {/* Section 4: Association Assessments (Appendix 4) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                4. Association Assessments (Appendix 4) *
              </h4>
              
              <label className="flex items-center mb-4">
                <input
                  type="checkbox"
                  checked={formData.disclosures.assessmentSchedule.hasAssessments}
                  onChange={(e) => handleInputChange('disclosures.assessmentSchedule.hasAssessments', e.target.checked)}
                  className="mr-2"
                />
                <span>The association levies assessments payable by the owners to the association for common expenses. See Appendix 4.</span>
              </label>

              {formData.disclosures.assessmentSchedule.hasAssessments && (
                <div className="space-y-4 pl-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-3">The association levies assessments, payable according to the following schedule:</h5>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.assessmentSchedule.monthly}
                            onChange={(e) => handleInputChange('disclosures.assessmentSchedule.monthly', e.target.checked)}
                            className="mr-2"
                          />
                          <span>monthly, in the amount of</span>
                        </label>
                        {formData.disclosures.assessmentSchedule.monthly && (
                          <div className="flex">
                            <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={formData.disclosures.assessmentSchedule.monthlyAmount}
                              onChange={(e) => handleInputChange('disclosures.assessmentSchedule.monthlyAmount', e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.assessmentSchedule.quarterly}
                            onChange={(e) => handleInputChange('disclosures.assessmentSchedule.quarterly', e.target.checked)}
                            className="mr-2"
                          />
                          <span>quarterly, in the amount of</span>
                        </label>
                        {formData.disclosures.assessmentSchedule.quarterly && (
                          <div className="flex">
                            <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={formData.disclosures.assessmentSchedule.quarterlyAmount}
                              onChange={(e) => handleInputChange('disclosures.assessmentSchedule.quarterlyAmount', e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.assessmentSchedule.periodic}
                            onChange={(e) => handleInputChange('disclosures.assessmentSchedule.periodic', e.target.checked)}
                            className="mr-2"
                          />
                          <span>periodic, in the amount of</span>
                        </label>
                        {formData.disclosures.assessmentSchedule.periodic && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Describe interval"
                              value={formData.disclosures.assessmentSchedule.periodicInterval}
                              onChange={(e) => handleInputChange('disclosures.assessmentSchedule.periodicInterval', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <div className="flex">
                              <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={formData.disclosures.assessmentSchedule.periodicAmount}
                                onChange={(e) => handleInputChange('disclosures.assessmentSchedule.periodicAmount', e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Current assessment due:</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.assessmentSchedule.currentAssessmentDue}
                          onChange={(e) => handleInputChange('disclosures.assessmentSchedule.currentAssessmentDue', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Due Date:</label>
                      <input
                        type="date"
                        value={formData.disclosures.assessmentSchedule.currentAssessmentDueDate}
                        onChange={(e) => handleInputChange('disclosures.assessmentSchedule.currentAssessmentDueDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid assessments:</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.assessmentSchedule.unpaidAssessments}
                          onChange={(e) => handleInputChange('disclosures.assessmentSchedule.unpaidAssessments', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.assessmentSchedule.hasTransferAssessment}
                        onChange={(e) => handleInputChange('disclosures.assessmentSchedule.hasTransferAssessment', e.target.checked)}
                        className="mr-2"
                      />
                      <span>The association levies an assessment in the amount of $ _______ upon transfer of a unit.</span>
                    </label>
                    {formData.disclosures.assessmentSchedule.hasTransferAssessment && (
                      <div className="pl-6">
                        <div className="flex max-w-xs">
                          <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.disclosures.assessmentSchedule.transferAssessmentAmount}
                            onChange={(e) => handleInputChange('disclosures.assessmentSchedule.transferAssessmentAmount', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Association Fees (Appendix 5) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">5. Association Fees (Appendix 5)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="associationFees"
                      checked={formData.disclosures.fees.hasOtherFees}
                      onChange={(e) => handleInputChange('disclosures.fees.hasOtherFees', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> charge fees to the owner of the unit. See Appendix 5.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="associationFees"
                      checked={!formData.disclosures.fees.hasOtherFees}
                      onChange={(e) => handleInputChange('disclosures.fees.hasOtherFees', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> charge fees to the owner of the unit. See Appendix 5.</span>
                  </label>
                </div>
                
                {formData.disclosures.fees.hasOtherFees && (
                  <div className="pl-6 space-y-4 bg-blue-50 p-4 rounded-lg">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Other fees due:</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.disclosures.fees.otherFeesAmount}
                            onChange={(e) => handleInputChange('disclosures.fees.otherFeesAmount', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid fees:</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.disclosures.fees.unpaidFeesAmount}
                            onChange={(e) => handleInputChange('disclosures.fees.unpaidFeesAmount', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description of fees:</label>
                      <textarea
                        value={formData.disclosures.fees.otherFeesDescription}
                        onChange={(e) => handleInputChange('disclosures.fees.otherFeesDescription', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description of unpaid fees:</label>
                      <textarea
                        value={formData.disclosures.fees.unpaidFeesDescription}
                        onChange={(e) => handleInputChange('disclosures.fees.unpaidFeesDescription', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 6: Other Entity Assessments (Appendix 6) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">6. Other Entity or Facility Assessments, Fees, or Charges (Appendix 6)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="otherEntity"
                      checked={formData.disclosures.otherEntity.isLiable}
                      onChange={(e) => handleInputChange('disclosures.otherEntity.isLiable', true)}
                      className="mr-2"
                    />
                    <span>The owner <strong>is</strong> liable to any other entity or facility for assessments, fees, or other charges due to ownership of the unit. See Appendix 6.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="otherEntity"
                      checked={!formData.disclosures.otherEntity.isLiable}
                      onChange={(e) => handleInputChange('disclosures.otherEntity.isLiable', false)}
                      className="mr-2"
                    />
                    <span>The owner <strong>is not</strong> liable to any other entity or facility for assessments, fees, or other charges due to ownership of the unit. See Appendix 6.</span>
                  </label>
                </div>
                
                {formData.disclosures.otherEntity.isLiable && (
                  <div className="pl-6">
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="font-medium">Entity/Facility Name and Amount Due</h5>
                        <button
                          type="button"
                          onClick={() => addArrayItem('disclosures.otherEntity.entities', { name: '', amountDue: '' })}
                          className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4" />
                          Add Entity
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {(formData.disclosures.otherEntity.entities || []).map((entity, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Entity/Facility Name"
                              value={entity.name}
                              onChange={(e) => updateArrayItem('disclosures.otherEntity.entities', index, {...entity, name: e.target.value})}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <div className="flex">
                              <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Amount Due"
                                value={entity.amountDue}
                                onChange={(e) => updateArrayItem('disclosures.otherEntity.entities', index, {...entity, amountDue: e.target.value})}
                                className="w-32 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeArrayItem('disclosures.otherEntity.entities', index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 7: Special Assessments (Appendix 7) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">7. Association Approved Additional or Special Assessments (Appendix 7)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="specialAssessments"
                      checked={formData.disclosures.specialAssessments.hasApproved}
                      onChange={(e) => handleInputChange('disclosures.specialAssessments.hasApproved', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have other approved additional or special assessments due and payable to the association. See Appendix 7.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="specialAssessments"
                      checked={!formData.disclosures.specialAssessments.hasApproved}
                      onChange={(e) => handleInputChange('disclosures.specialAssessments.hasApproved', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have other approved additional or special assessments due and payable to the association. See Appendix 7.</span>
                  </label>
                </div>
                
                {formData.disclosures.specialAssessments.hasApproved && (
                  <div className="pl-6 space-y-4 bg-red-50 p-4 rounded-lg">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Additional or special assessment due:</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.disclosures.specialAssessments.approvedAmount}
                            onChange={(e) => handleInputChange('disclosures.specialAssessments.approvedAmount', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Due Date:</label>
                        <input
                          type="date"
                          value={formData.disclosures.specialAssessments.approvedDueDate}
                          onChange={(e) => handleInputChange('disclosures.specialAssessments.approvedDueDate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid additional or special assessment due:</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.disclosures.specialAssessments.unpaidAmount}
                            onChange={(e) => handleInputChange('disclosures.specialAssessments.unpaidAmount', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 8: Capital Expenditures (Appendix 8) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">8. Capital Expenditures Approved by the Association (Appendix 8)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="capitalExpenditures"
                      checked={formData.disclosures.capitalExpenditures.hasApproved}
                      onChange={(e) => handleInputChange('disclosures.capitalExpenditures.hasApproved', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have approved capital expenditures for the current and succeeding fiscal years</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="capitalExpenditures"
                      checked={!formData.disclosures.capitalExpenditures.hasApproved}
                      onChange={(e) => handleInputChange('disclosures.capitalExpenditures.hasApproved', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have approved capital expenditures for the current and succeeding fiscal years</span>
                  </label>
                </div>
                
                {formData.disclosures.capitalExpenditures.hasApproved && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Capital expenditures approved by the association for the current and succeeding fiscal years are:</label>
                    <textarea
                      value={formData.disclosures.capitalExpenditures.details}
                      onChange={(e) => handleInputChange('disclosures.capitalExpenditures.details', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Describe approved capital expenditures..."
                    />
                  </div>
                )}
              </div>
            </div>

           {/* Section 9: Reserves (Appendix 9) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">9. Reserves for Capital Expenditures (Appendix 9)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="reserves"
                      checked={formData.disclosures.reserves.hasReserves}
                      onChange={(e) => handleInputChange('disclosures.reserves.hasReserves', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have reserves for capital expenditures. See Appendix 9.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserves"
                      checked={!formData.disclosures.reserves.hasReserves}
                      onChange={(e) => handleInputChange('disclosures.reserves.hasReserves', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have reserves for capital expenditures. See Appendix 9.</span>
                  </label>
                </div>
                
                {formData.disclosures.reserves.hasReserves && (
                  <div className="pl-6 space-y-4 bg-green-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Total amount of association reserves:</label>
                      <div className="flex max-w-xs">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.reserves.totalAmount}
                          onChange={(e) => handleInputChange('disclosures.reserves.totalAmount', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="flex items-center mb-3">
                        <input
                          type="checkbox"
                          checked={formData.disclosures.reserves.hasDesignated}
                          onChange={(e) => handleInputChange('disclosures.reserves.hasDesignated', e.target.checked)}
                          className="mr-2"
                        />
                        <span>The association <strong>has</strong> designated some portion of those reserves for a specific project(s). See Appendix 9.</span>
                      </label>
                      
                      {formData.disclosures.reserves.hasDesignated && (
                        <div className="pl-6">
                          <div className="flex items-center justify-between mb-3">
                            <h6 className="font-medium">Amount of total reserves designated for specific projects (attach list or complete below):</h6>
                            <button
                              type="button"
                              onClick={() => addArrayItem('disclosures.reserves.designatedProjects', { project: '', amount: '' })}
                              className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                              <Plus className="w-4 h-4" />
                              Add Project
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            {(formData.disclosures.reserves.designatedProjects || []).map((project, index) => (
                              <div key={index} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="Specific Project"
                                  value={project.project}
                                  onChange={(e) => updateArrayItem('disclosures.reserves.designatedProjects', index, {...project, project: e.target.value})}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <div className="flex">
                                  <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Amount Designated"
                                    value={project.amount}
                                    onChange={(e) => updateArrayItem('disclosures.reserves.designatedProjects', index, {...project, amount: e.target.value})}
                                    className="w-32 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeArrayItem('disclosures.reserves.designatedProjects', index)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">The amount of any reserves for specified projects is contained in Appendix 12.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 10: Financial Statements (Appendix 10) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">10. Balance Sheet and Income and Expense Statement (Appendix 10)</h4>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center mb-3">
                    <input
                      type="radio"
                      name="balanceSheet"
                      checked={formData.disclosures.financialStatements.balanceSheetAttached}
                      onChange={(e) => handleInputChange('disclosures.financialStatements.balanceSheetAttached', true)}
                      className="mr-2"
                    />
                    <span>The association's most recent balance sheet <strong>is</strong> attached. See Appendix 10.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="balanceSheet"
                      checked={!formData.disclosures.financialStatements.balanceSheetAttached}
                      onChange={(e) => handleInputChange('disclosures.financialStatements.balanceSheetAttached', false)}
                      className="mr-2"
                    />
                    <span>The association's most recent balance sheet <strong>is not</strong> attached. See Appendix 10.</span>
                  </label>
                </div>
                
                <div>
                  <label className="flex items-center mb-3">
                    <input
                      type="radio"
                      name="incomeStatement"
                      checked={formData.disclosures.financialStatements.incomeStatementAttached}
                      onChange={(e) => handleInputChange('disclosures.financialStatements.incomeStatementAttached', true)}
                      className="mr-2"
                    />
                    <span>The association's most recent income and expense statement <strong>is</strong> attached. See Appendix 10.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="incomeStatement"
                      checked={!formData.disclosures.financialStatements.incomeStatementAttached}
                      onChange={(e) => handleInputChange('disclosures.financialStatements.incomeStatementAttached', false)}
                      className="mr-2"
                    />
                    <span>The association's most recent income and expense statement <strong>is not</strong> attached. See Appendix 10.</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 11: Operating Budget (Appendix 11) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">11. Current Operating Budget of the Association (Appendix 11)</h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.disclosures.operatingBudget.budgetAttached}
                  onChange={(e) => handleInputChange('disclosures.operatingBudget.budgetAttached', e.target.checked)}
                  className="mr-2"
                />
                <span>The association's current operating budget is attached. See Appendix 11.</span>
              </label>
            </div>

            {/* Section 12: Reserve Study (Appendix 12) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">12. Reserve Study (Appendix 12)</h4>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserveStudy"
                      value="current"
                      checked={formData.disclosures.reserveStudy.type === 'current'}
                      onChange={(e) => handleInputChange('disclosures.reserveStudy.type', e.target.value)}
                      className="mr-2"
                    />
                    <span>The current reserve study of the association is attached. See Appendix 12.</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserveStudy"
                      value="summary"
                      checked={formData.disclosures.reserveStudy.type === 'summary'}
                      onChange={(e) => handleInputChange('disclosures.reserveStudy.type', e.target.value)}
                      className="mr-2"
                    />
                    <span>A summary of the current reserve study of the association is attached. See Appendix 12.</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserveStudy"
                      value="not_required"
                      checked={formData.disclosures.reserveStudy.type === 'not_required'}
                      onChange={(e) => handleInputChange('disclosures.reserveStudy.type', e.target.value)}
                      className="mr-2"
                    />
                    <span>Not applicable. A reserve study is not yet required.</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Legal & Insurance (Sections 13-16)</h3>
            
            {/* Section 13: Legal Issues (Appendix 13) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                13. Unsatisfied Judgments and Pending Actions (Appendix 13)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="legalIssues"
                      checked={formData.disclosures.legalIssues.hasIssues}
                      onChange={(e) => handleInputChange('disclosures.legalIssues.hasIssues', true)}
                      className="mr-2"
                    />
                    <span>There <strong>are</strong> unsatisfied judgments or pending actions in which the association is a party that could have a material impact on the association, the owners, or the unit being sold. See Appendix 13.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="legalIssues"
                      checked={!formData.disclosures.legalIssues.hasIssues}
                      onChange={(e) => handleInputChange('disclosures.legalIssues.hasIssues', false)}
                      className="mr-2"
                    />
                    <span>There <strong>are not</strong> unsatisfied judgments or pending actions in which the association is a party that could have a material impact on the association, the owners, or the unit being sold. See Appendix 13.</span>
                  </label>
                </div>
                
                {formData.disclosures.legalIssues.hasIssues && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">There are unsatisfied judgments against the association or pending action(s) in which the association is a party and that could have a material impact on the association, the owners, or the unit being sold. Describe below:</label>
                    <textarea
                      value={formData.disclosures.legalIssues.details}
                      onChange={(e) => handleInputChange('disclosures.legalIssues.details', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Describe any unsatisfied judgments or pending actions that could have material impact..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 14: Insurance (Appendix 14) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">14. Insurance Coverage (Appendix 14)</h4>
              <div className="space-y-6">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="associationInsurance"
                      checked={formData.disclosures.insurance.associationProvides}
                      onChange={(e) => handleInputChange('disclosures.insurance.associationProvides', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> provide insurance coverage for the benefit of the owners, including fidelity coverage. See Appendix 14.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="associationInsurance"
                      checked={!formData.disclosures.insurance.associationProvides}
                      onChange={(e) => handleInputChange('disclosures.insurance.associationProvides', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> provide insurance coverage for the benefit of the owners, including fidelity coverage. See Appendix 14.</span>
                  </label>
                </div>
                
                {formData.disclosures.insurance.associationProvides && (
                  <div className="pl-6 bg-blue-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-3">Insurance coverage provided by the association for the benefit of the owners, including fidelity coverage:</h5>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium">Description of Insurance</span>
                        <button
                          type="button"
                          onClick={() => addArrayItem('disclosures.insurance.coverageDetails', { 
                            description: '', 
                            certificateAttached: false, 
                            articleSection: '' 
                          })}
                          className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4" />
                          Add Coverage
                        </button>
                      </div>
                      
                      {(formData.disclosures.insurance.coverageDetails || []).map((coverage, index) => (
                        <div key={index} className="bg-white p-3 rounded border space-y-2">
                          <div className="flex gap-2 items-start">
                            <textarea
                              placeholder="Description of insurance coverage"
                              value={coverage.description}
                              onChange={(e) => updateArrayItem('disclosures.insurance.coverageDetails', index, {...coverage, description: e.target.value})}
                              rows={2}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeArrayItem('disclosures.insurance.coverageDetails', index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex gap-4">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={coverage.certificateAttached}
                                onChange={(e) => updateArrayItem('disclosures.insurance.coverageDetails', index, {...coverage, certificateAttached: e.target.checked})}
                                className="mr-2"
                              />
                              <span className="text-sm">Certificate of Insurance or other documentation attached</span>
                            </label>
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="See Article/Section ___________"
                              value={coverage.articleSection}
                              onChange={(e) => updateArrayItem('disclosures.insurance.coverageDetails', index, {...coverage, articleSection: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="ownerInsurance"
                      checked={formData.disclosures.insurance.recommendsOwnerCoverage}
                      onChange={(e) => handleInputChange('disclosures.insurance.recommendsOwnerCoverage', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> recommend or require that owners obtain insurance coverage. See Appendix 14.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="ownerInsurance"
                      checked={!formData.disclosures.insurance.recommendsOwnerCoverage}
                      onChange={(e) => handleInputChange('disclosures.insurance.recommendsOwnerCoverage', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> recommend or require that owners obtain insurance coverage. See Appendix 14.</span>
                  </label>
                </div>
                
                {formData.disclosures.insurance.recommendsOwnerCoverage && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Any other insurance coverage recommended or required to be obtained by the owners can be found in Article/Section:</label>
                    <input
                      type="text"
                      value={formData.disclosures.insurance.ownerRequirements}
                      onChange={(e) => handleInputChange('disclosures.insurance.ownerRequirements', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Article/Section reference"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 15: Association Violations (Appendix 15) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">15. Written Notice from the Association (Appendix 15)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="associationViolations"
                      checked={formData.disclosures.associationViolations.hasNotices}
                      onChange={(e) => handleInputChange('disclosures.associationViolations.hasNotices', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>has</strong> given or received written notice(s) that any existing uses, occupancies, alterations or improvements in or to the unit being sold or to the limited elements assigned thereto violate a provision of the governing documents or rules and regulations. See Appendix 15.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="associationViolations"
                      checked={!formData.disclosures.associationViolations.hasNotices}
                      onChange={(e) => handleInputChange('disclosures.associationViolations.hasNotices', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>has not</strong> given or received written notice(s) that any existing uses, occupancies, alterations or improvements in or to the unit being sold or to the limited elements assigned thereto violate a provision of the governing documents or rules and regulations. See Appendix 15.</span>
                  </label>
                </div>
                
                {formData.disclosures.associationViolations.hasNotices && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.associationViolations.noticesAttached}
                        onChange={(e) => handleInputChange('disclosures.associationViolations.noticesAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Written notice(s) attached</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Section 16: Government Violations (Appendix 16) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">16. Written Notice from a Governmental Agency (Appendix 16)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="governmentViolations"
                      checked={formData.disclosures.governmentViolations.hasNotices}
                      onChange={(e) => handleInputChange('disclosures.governmentViolations.hasNotices', true)}
                      className="mr-2"
                    />
                    <span>The Board <strong>has</strong> received written notice(s) from a governmental agency of a violation of environmental, health, or building code with respect to the unit being sold, the limited elements assigned thereto, or a portion of the common interest community that has not been cured. See Appendix 16.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="governmentViolations"
                      checked={!formData.disclosures.governmentViolations.hasNotices}
                      onChange={(e) => handleInputChange('disclosures.governmentViolations.hasNotices', false)}
                      className="mr-2"
                    />
                    <span>The Board <strong>has not</strong> received written notice(s) from a governmental agency of a violation of environmental, health, or building code with respect to the unit being sold, the limited elements assigned thereto, or a portion of the common interest community that has not been cured. See Appendix 16.</span>
                  </label>
                </div>
                
                {formData.disclosures.governmentViolations.hasNotices && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.governmentViolations.noticesAttached}
                        onChange={(e) => handleInputChange('disclosures.governmentViolations.noticesAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Written notice(s) attached</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Meeting Minutes (Sections 17-18)
            </h3>
            
            {/* Section 17: Board Minutes (Appendix 17) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">17. Board Meeting Minutes (Appendix 17)</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.boardMinutes.attached}
                    onChange={(e) => handleInputChange('disclosures.boardMinutes.attached', e.target.checked)}
                    className="mr-2"
                  />
                  <span>A copy of any approved minutes of meetings of the Board held during the last six months is attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.boardMinutes.notApplicable}
                    onChange={(e) => handleInputChange('disclosures.boardMinutes.notApplicable', e.target.checked)}
                    className="mr-2"
                  />
                  <span>Not applicable</span>
                </label>
              </div>
            </div>

            {/* Section 18: Association Minutes (Appendix 18) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">18. Association Meeting Minutes (Appendix 18)</h4>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center mb-3">
                    <input
                      type="radio"
                      name="associationMinutes"
                      checked={formData.disclosures.associationMinutes.attached}
                      onChange={(e) => handleInputChange('disclosures.associationMinutes.attached', true)}
                      className="mr-2"
                    />
                    <span>A copy of any approved or draft minutes of the most recent association meeting <strong>is</strong> attached</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="associationMinutes"
                      checked={!formData.disclosures.associationMinutes.attached}
                      onChange={(e) => handleInputChange('disclosures.associationMinutes.attached', false)}
                      className="mr-2"
                    />
                    <span>A copy of any approved or draft minutes of the most recent association meeting <strong>is not</strong> attached</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <Home className="w-6 h-6 text-green-600" />
              Property Restrictions (Sections 19-26)
            </h3>
            
            {/* Section 19: Leasehold Estates (Appendix 19) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">19. Leasehold Estates (Appendix 19)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="leaseholdEstates"
                      checked={formData.disclosures.leaseholdEstates.exists}
                      onChange={(e) => handleInputChange('disclosures.leaseholdEstates.exists', true)}
                      className="mr-2"
                    />
                    <span>There <strong>is</strong> an existing leasehold estate affecting a common area or common element in the common interest community. See Appendix 19.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="leaseholdEstates"
                      checked={!formData.disclosures.leaseholdEstates.exists}
                      onChange={(e) => handleInputChange('disclosures.leaseholdEstates.exists', false)}
                      className="mr-2"
                    />
                    <span>There <strong>is not</strong> an existing leasehold estate affecting a common area or common element in the common interest community. See Appendix 19.</span>
                  </label>
                </div>
                
                {formData.disclosures.leaseholdEstates.exists && (
                  <div className="pl-6 space-y-3 bg-yellow-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">The remaining term of the leasehold estate established in the attached document(s) is:</label>
                      <input
                        type="text"
                        value={formData.disclosures.leaseholdEstates.remainingTerm}
                        onChange={(e) => handleInputChange('disclosures.leaseholdEstates.remainingTerm', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., 25 years"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 20: Occupancy Limitations (Appendix 20) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                20. Occupancy Limitations (Appendix 20)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="occupancyLimitations"
                      checked={formData.disclosures.occupancyLimitations.hasLimitations}
                      onChange={(e) => handleInputChange('disclosures.occupancyLimitations.hasLimitations', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any limitation(s) in the governing documents on the number or age of persons who may occupy the unit as a dwelling. See Appendix 20.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="occupancyLimitations"
                      checked={!formData.disclosures.occupancyLimitations.hasLimitations}
                      onChange={(e) => handleInputChange('disclosures.occupancyLimitations.hasLimitations', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any limitation(s) in the governing documents on the number or age of persons who may occupy the unit as a dwelling. See Appendix 20.</span>
                  </label>
                </div>
                
                {formData.disclosures.occupancyLimitations.hasLimitations && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any limitation(s) on the number or age of persons who may occupy the unit as a dwelling:</label>
                      <input
                        type="text"
                        value={formData.disclosures.occupancyLimitations.articleSection}
                        onChange={(e) => handleInputChange('disclosures.occupancyLimitations.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section reference"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.occupancyLimitations.documentReference}
                        onChange={(e) => handleInputChange('disclosures.occupancyLimitations.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 21: Flag Restrictions (Appendix 21) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-600" />
                21. United States Flag Restrictions (Appendix 21)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="flagRestrictions"
                      checked={formData.disclosures.flagRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.flagRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any restriction(s), limitation(s), or prohibition(s) on the right of an owner to display the flag of the United States, including any reasonable restrictions as to size, time, place, and manner of placement or display of such flag. See Appendix 21.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="flagRestrictions"
                      checked={!formData.disclosures.flagRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.flagRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any restriction(s), limitation(s), or prohibition(s) on the right of an owner to display the flag of the United States, including any reasonable restrictions as to size, time, place, and manner of placement or display of such flag. See Appendix 21.</span>
                  </label>
                </div>
                
                {formData.disclosures.flagRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any restriction(s), limitation(s), or prohibition(s) on the right of any owner to display the flag of the United States:</label>
                      <input
                        type="text"
                        value={formData.disclosures.flagRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.flagRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.flagRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.flagRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 22: Solar Restrictions (Appendix 22) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Sun className="w-5 h-5 text-yellow-600" />
                22. Solar Energy Restrictions (Appendix 22)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="solarRestrictions"
                      checked={formData.disclosures.solarRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.solarRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any restriction(s), limitation(s), or prohibition(s) on the right of an owner to install or use solar energy collection devices on the owner's unit or limited element. See Appendix 22.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="solarRestrictions"
                      checked={!formData.disclosures.solarRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.solarRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any restriction(s), limitation(s), or prohibition(s) on the right of an owner to install or use solar energy collection devices on the owner's unit or limited element. See Appendix 22.</span>
                  </label>
                </div>
                
                {formData.disclosures.solarRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any restriction(s), limitation(s), or prohibition(s) on the right of any owner to install or use solar energy collection devices:</label>
                      <input
                        type="text"
                        value={formData.disclosures.solarRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.solarRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.solarRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.solarRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 23: Sign Restrictions (Appendix 23) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                23. Sign Restrictions (Appendix 23)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="signRestrictions"
                      checked={formData.disclosures.signRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.signRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any restriction(s), limitation(s), or prohibition(s) on the size, placement, or duration of display of political, for sale, or any other signs on the property. See Appendix 23.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="signRestrictions"
                      checked={!formData.disclosures.signRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.signRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any restriction(s), limitation(s), or prohibition(s) on the size, placement, or duration of display of political, for sale, or any other signs on the property. See Appendix 23.</span>
                  </label>
                </div>
                
                {formData.disclosures.signRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any restriction(s), limitation(s), or prohibition(s) on the size, placement, or duration of display of political, for sale, or any other signs on the property:</label>
                      <input
                        type="text"
                        value={formData.disclosures.signRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.signRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.signRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.signRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 24: Parking Restrictions (Appendix 24) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Car className="w-5 h-5 text-gray-600" />
                24. Parking or Vehicle Restrictions (Appendix 24)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="parkingRestrictions"
                      checked={formData.disclosures.parkingRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.parkingRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any parking or vehicle restriction(s), limitation(s), or prohibition(s) in the governing documents or rules and regulations. See Appendix 24.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="parkingRestrictions"
                      checked={!formData.disclosures.parkingRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.parkingRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any parking or vehicle restriction(s), limitation(s), or prohibition(s) in the governing documents or rules and regulations. See Appendix 24.</span>
                  </label>
                </div>
                
                {formData.disclosures.parkingRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any parking or vehicle restriction(s), limitation(s), or prohibition(s):</label>
                      <input
                        type="text"
                        value={formData.disclosures.parkingRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.parkingRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.parkingRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.parkingRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 25: Business Restrictions (Appendix 25) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                25. Home-Based Business Restrictions (Appendix 25)
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="businessRestrictions"
                      checked={formData.disclosures.businessRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.businessRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any restriction(s), limitation(s), or prohibition(s) on the operation of a home-based business that otherwise complies with all applicable local ordinances. See Appendix 25.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="businessRestrictions"
                      checked={!formData.disclosures.businessRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.businessRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any restriction(s), limitation(s), or prohibition(s) on the operation of a home-based business that otherwise complies with all applicable local ordinances. See Appendix 25.</span>
                  </label>
                </div>
                
                {formData.disclosures.businessRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any restriction(s), limitation(s), or prohibition(s) on the operation of a home-based business:</label>
                      <input
                        type="text"
                        value={formData.disclosures.businessRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.businessRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.businessRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.businessRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 26: Rental Restrictions (Appendix 26) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">26. Rental Restrictions (Appendix 26)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="rentalRestrictions"
                      checked={formData.disclosures.rentalRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.rentalRestrictions.hasRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association <strong>does</strong> have any restriction(s), limitation(s), or prohibition(s) on an owner's ability to rent the unit. See Appendix 26.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="rentalRestrictions"
                      checked={!formData.disclosures.rentalRestrictions.hasRestrictions}
                      onChange={(e) => handleInputChange('disclosures.rentalRestrictions.hasRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association <strong>does not</strong> have any restriction(s), limitation(s), or prohibition(s) on an owner's ability to rent the unit. See Appendix 26.</span>
                  </label>
                </div>
                
                {formData.disclosures.rentalRestrictions.hasRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section _______ of the _______* describes any restriction(s), limitation(s), or prohibition(s) on the owner's ability to rent the unit:</label>
                      <input
                        type="text"
                        value={formData.disclosures.rentalRestrictions.articleSection}
                        onChange={(e) => handleInputChange('disclosures.rentalRestrictions.articleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.rentalRestrictions.documentReference}
                        onChange={(e) => handleInputChange('disclosures.rentalRestrictions.documentReference', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                      <p className="text-xs text-gray-500 mt-1">* Include applicable reference, i.e., governing documents, rules, regulations, resolutions, architectural guidelines</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Final Certifications (Sections 27-30)
            </h3>
            
            {/* Section 27: Tax Deductibility (Appendix 27) - Real Estate Cooperatives Only */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">27. Tax Deductibility Statement - Real Estate Cooperatives Only (Appendix 27)</h4>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>REAL ESTATE COOPERATIVES ONLY:</strong> In a Real Estate Cooperative, a statement setting forth whether the cooperative association is aware of any statute, regulation, or rule applicable to the cooperative that would affect an owner's ability to deduct real estate taxes and interest paid by the cooperative association for federal income tax purposes is required under § 55.1-2310.A.27.
                </p>
              </div>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.taxDeductibility.statementAttached}
                    onChange={(e) => handleInputChange('disclosures.taxDeductibility.statementAttached', e.target.checked)}
                    className="mr-2"
                  />
                  <span>A statement as to the deductibility for federal income tax purposes by the owner of real estate taxes and interest paid by the association is attached.</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.taxDeductibility.notApplicable}
                    onChange={(e) => handleInputChange('disclosures.taxDeductibility.notApplicable', e.target.checked)}
                    className="mr-2"
                  />
                  <span>Not applicable</span>
                </label>
              </div>
            </div>

            {/* Section 28: Pending Sales (Appendix 28) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">28. Pending Sales or Encumbrances (Appendix 28)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="pendingSales"
                      checked={formData.disclosures.pendingSales.hasPending}
                      onChange={(e) => handleInputChange('disclosures.pendingSales.hasPending', true)}
                      className="mr-2"
                    />
                    <span>There <strong>is</strong> a pending sale(s) or encumbrance of common elements. See Appendix 28.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="pendingSales"
                      checked={!formData.disclosures.pendingSales.hasPending}
                      onChange={(e) => handleInputChange('disclosures.pendingSales.hasPending', false)}
                      className="mr-2"
                    />
                    <span>There <strong>is not</strong> a pending sale(s) or encumbrance of common elements. See Appendix 28.</span>
                  </label>
                </div>
                
                {formData.disclosures.pendingSales.hasPending && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.pendingSales.documentsAttached}
                        onChange={(e) => handleInputChange('disclosures.pendingSales.documentsAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Any documents pertaining to a pending sale or encumbrance of a common element(s) are attached.</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Section 29: Mortgage Approvals (Appendix 29) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">29. Secondary Mortgage Market Agency Approvals (Appendix 29)</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="mortgageApprovals"
                      checked={formData.disclosures.mortgageApprovals.hasApprovals}
                      onChange={(e) => handleInputChange('disclosures.mortgageApprovals.hasApprovals', true)}
                      className="mr-2"
                    />
                    <span>There <strong>is</strong> any known project approval(s) currently in effect issued by secondary mortgage market agencies. See Appendix 29.</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="mortgageApprovals"
                      checked={!formData.disclosures.mortgageApprovals.hasApprovals}
                      onChange={(e) => handleInputChange('disclosures.mortgageApprovals.hasApprovals', false)}
                      className="mr-2"
                    />
                    <span>There <strong>is not</strong> any known project approval(s) currently in effect issued by secondary mortgage market agencies. See Appendix 29.</span>
                  </label>
                </div>
                
                {formData.disclosures.mortgageApprovals.hasApprovals && (
                  <div className="pl-6">
                    <p className="text-sm text-gray-700 mb-3">The common interest community is known to be currently approved (or mortgages secured by units in the common interest community are eligible for purchase) by the secondary mortgage market agencies checked below:</p>
                    <div className="space-y-2">
                      {['Fannie Mae', 'Freddie Mac', 'FHA', 'VA', 'USDA'].map((agency) => (
                        <label key={agency} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.mortgageApprovals.approvedAgencies?.includes(agency)}
                            onChange={(e) => {
                              const current = formData.disclosures.mortgageApprovals.approvedAgencies || [];
                              const updated = e.target.checked 
                                ? [...current, agency]
                                : current.filter(a => a !== agency);
                              handleInputChange('disclosures.mortgageApprovals.approvedAgencies', updated);
                            }}
                            className="mr-2"
                          />
                          <span>{agency}</span>
                        </label>
                      ))}
                      <div className="mt-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.mortgageApprovals.approvedAgencies?.includes('Other')}
                            onChange={(e) => {
                              const current = formData.disclosures.mortgageApprovals.approvedAgencies || [];
                              const updated = e.target.checked 
                                ? [...current, 'Other']
                                : current.filter(a => a !== 'Other');
                              handleInputChange('disclosures.mortgageApprovals.approvedAgencies', updated);
                            }}
                            className="mr-2"
                          />
                          <span>Other (specify):</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Specify other agency"
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={formData.disclosures.mortgageApprovals.otherAgencyName || ''}
                          onChange={e => handleInputChange('disclosures.mortgageApprovals.otherAgencyName', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 30: CIC Board Certification (Appendix 30) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">30. Common Interest Community Board Certification (Appendix 30) *</h4>
              <div className="space-y-4">
                <label className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.cicCertification.reportFiled}
                    onChange={(e) => handleInputChange('disclosures.cicCertification.reportFiled', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association has filed with the Common Interest Community Board the annual report required by law. See Appendix 30.</span>
                </label>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Association Filing (Registration) Number Assigned by the CIC Board: *
                    </label>
                    <input
                      type="text"
                      value={formData.disclosures.cicCertification.registrationNumber}
                      onChange={(e) => handleInputChange('disclosures.cicCertification.registrationNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="CIC Board registration number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Filing (Registration) Expiration Date: *
                    </label>
                    <input
                      type="date"
                      value={formData.disclosures.cicCertification.expirationDate}
                      onChange={(e) => handleInputChange('disclosures.cicCertification.expirationDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">* A copy of the registration issued by the Common Interest Community Board is sufficient for the certification.</p>
              </div>
            </div>

            {/* Final Certification Statement */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <h4 className="font-semibold text-purple-900 mb-4">Final Certification</h4>
              <div className="bg-white p-4 rounded-lg border mb-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>CERTIFICATION:</strong> I hereby certify that the information contained in this Common Interest 
                  Community Association Resale Certificate is true and correct to the best of my knowledge as of the date 
                  indicated above. This certificate is issued in accordance with Virginia Code § 55.1-2310 and contains 
                  the disclosures required by Virginia law for the resale of units in a common interest community.
                </p>
                <br />
                <p className="text-sm text-gray-700 leading-relaxed">
                  This certificate is valid for the period specified by Virginia law from the date of issuance unless 
                  the association becomes aware of any material changes to the information contained herein.
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preparer Name: *
                  </label>
                  <input
                    type="text"
                    value={formData.preparer.name}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Prepared: *
                  </label>
                  <input
                    type="date"
                    value={formData.datePrepared}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        );
        
      default:
        return <div>Section not found</div>;
    }
  };

  return (
    <div className={`${isModal ? 'p-6' : 'max-w-6xl mx-auto p-6'} bg-white ${isModal ? '' : 'min-h-screen'}`}>
      {/* Admin Header */}
      <div className="bg-purple-50 p-6 rounded-lg mb-8 border border-purple-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin: Virginia Resale Certificate</h1>
              <p className="text-gray-600">Official State Form A492-05RESALE-v4 - Application #{applicationData?.id}</p>
            </div>
          </div>
          {!isModal && (
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-md hover:bg-purple-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          )}
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Building className="w-5 h-5 text-purple-600" />
              Application Details
            </h2>
            <div className="flex items-center gap-2">
              <div className="bg-purple-100 px-3 py-1 rounded-full text-sm font-medium text-purple-700">
                {getCompletionPercentage()}% Complete
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Property:</strong> {applicationData?.property_address} {applicationData?.unit_number}
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

      {/* Section Navigation */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Virginia State Resale Certificate Form - All 170+ Questions</h2>
          <div className="text-sm text-gray-500">
            Section {currentSection} of {sections.length}
          </div>
        </div>
        
        <div className="flex items-center justify-between overflow-x-auto pb-2">
          {sections.map((section, index) => {
            const SectionIcon = section.icon;
            const isActive = currentSection === section.id;
            const isCompleted = currentSection > section.id;
            
            return (
              <div key={section.id} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => setCurrentSection(section.id)}
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isActive ? 'border-purple-600 bg-purple-600 text-white' :
                    isCompleted ? 'border-purple-600 bg-purple-600 text-white' :
                    'border-gray-300 bg-white text-gray-500'
                  }`}
                >
                  <SectionIcon className="h-6 w-6" />
                </button>
                <div className="ml-3 min-w-0">
                  <span className={`text-sm font-medium block ${
                    isActive ? 'text-purple-600' :
                    isCompleted ? 'text-purple-600' :
                    'text-gray-500'
                  }`}>
                    {section.title}
                  </span>
                </div>
                {index < sections.length - 1 && (
                  <div className={`flex-1 h-px mx-6 min-w-8 ${
                    currentSection > section.id ? 'bg-purple-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
        {renderSection()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center pt-6 border-t">
        <div className="text-sm text-gray-500">
          Completing as: <span className="font-medium">GMG Admin</span>
          <br />
          Form Progress: <span className="font-medium">{getCompletionPercentage()}% Complete</span>
        </div>
        
        <div className="flex gap-3">
          {currentSection > 1 && (
            <button
              onClick={() => setCurrentSection(currentSection - 1)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
          )}
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Progress'}
          </button>
          
          {currentSection < sections.length ? (
            <button
              onClick={() => setCurrentSection(currentSection + 1)}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Next Section
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isComplete || isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Completing...' : 'Complete Certificate'}
            </button>
          )}
        </div>
      </div>

      {/* Completion Requirements */}
      {!isComplete && currentSection === sections.length && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            <strong>Required fields missing:</strong> Please complete all required fields including development information, 
            preparer details, and CIC Board registration information before submission.
          </p>
        </div>
      )}

      {/* Form Summary */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">Form Summary</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <strong>Header Information:</strong> 6 fields
            <br />
            <strong>Contact Info (App. 1):</strong> 12+ fields
            <br />
            <strong>Documents (App. 2-3):</strong> 8+ fields
          </div>
          <div>
            <strong>Financial (App. 4-12):</strong> 50+ fields
            <br />
            <strong>Legal/Insurance (App. 13-16):</strong> 20+ fields
            <br />
            <strong>Minutes (App. 17-18):</strong> 4 fields
          </div>
          <div>
            <strong>Restrictions (App. 19-26):</strong> 32+ fields
            <br />
            <strong>Final Certs (App. 27-30):</strong> 15+ fields
            <br />
            <strong>Total Questions:</strong> 170+ comprehensive fields
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminResaleCertificateForm;
