import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save, Send, FileText, Calendar, ArrowLeft, Building, CheckCircle, AlertTriangle } from 'lucide-react';

const AdminResaleCertificateForm = ({ 
  applicationData,
  formId,
  onComplete
}) => {
  const [formData, setFormData] = useState({
    // Header Information
    developmentName: applicationData?.hoa_properties?.name || '',
    developmentLocation: '',
    associationName: applicationData?.hoa_properties?.name || '',
    associationAddress: '',
    lotAddress: applicationData?.property_address || '',
    datePrepared: new Date().toISOString().split('T')[0],
    
    // Preparer Information (Appendix 1)
    preparerName: '',
    preparerCompany: 'Goodman Management Group',
    preparerAddress: '',
    preparerPhone: '(804) 360-2115',
    preparerEmail: 'resales@gmgva.com',
    managingAgentName: '',
    managingAgentCompany: '',
    managingAgentLicense: '',
    managingAgentAddress: '',
    managingAgentPhone: '',
    managingAgentEmail: '',
    noManagingAgent: false,
    
    // 30 Required Disclosures (Sections 1-30)
    disclosures: {
      // 1. Contact information
      contactInfo: true,
      
      // 2. Governing documents
      governingDocs: true,
      
      // 3. Restraints on alienation
      restraintsExist: false,
      restraintsDetails: '',
      
      // 4. Association assessments
      assessmentAmount: '',
      assessmentFrequency: 'monthly',
      currentAssessmentDue: '',
      currentAssessmentDate: '',
      unpaidAssessments: '',
      transferAssessment: '',
      transferAssessmentAmount: '',
      
      // 5. Association fees
      hasOtherFees: false,
      otherFees: '',
      otherFeesDescription: '',
      unpaidFees: '',
      unpaidFeesDescription: '',
      
      // 6. Other entity assessments
      otherEntityLiable: false,
      otherEntityDetails: [],
      
      // 7. Special assessments
      hasSpecialAssessments: false,
      specialAssessmentAmount: '',
      specialAssessmentDate: '',
      unpaidSpecialAssessment: '',
      
      // 8. Capital expenditures
      hasCapitalExpendіtures: false,
      capitalExpendituresDetails: '',
      
      // 9. Reserves
      hasReserves: false,
      reserveAmount: '',
      hasDesignatedReserves: false,
      designatedReservesDetails: [],
      
      // 10. Financial statements
      balanceSheetAttached: false,
      incomeStatementAttached: false,
      
      // 11. Operating budget
      budgetAttached: true,
      
      // 12. Reserve study
      reserveStudyType: 'current', // 'current', 'summary', 'not_required'
      
      // 13. Legal issues
      hasLegalIssues: false,
      legalIssuesDetails: '',
      
      // 14. Insurance
      providesInsurance: false,
      insuranceDetails: '',
      recommendsInsurance: false,
      insuranceRequirements: '',
      
      // 15. Association violations
      hasViolationNotices: false,
      
      // 16. Government violations
      hasGovernmentNotices: false,
      
      // 17. Board minutes
      boardMinutesAttached: false,
      boardMinutesNA: true,
      
      // 18. Association minutes
      associationMinutesAttached: false,
      
      // 19. Leasehold estates
      hasLeaseholdEstate: false,
      leaseholdDetails: '',
      
      // 20. Occupancy limitations
      hasOccupancyLimitations: false,
      occupancyLimitationsRef: '',
      
      // 21. Flag restrictions
      hasFlagRestrictions: false,
      flagRestrictionsRef: '',
      
      // 22. Solar restrictions
      hasSolarRestrictions: false,
      solarRestrictionsRef: '',
      
      // 23. Sign restrictions
      hasSignRestrictions: false,
      signRestrictionsRef: '',
      
      // 24. Parking restrictions
      hasParkingRestrictions: false,
      parkingRestrictionsRef: '',
      
      // 25. Business restrictions
      hasBusinessRestrictions: false,
      businessRestrictionsRef: '',
      
      // 26. Rental restrictions
      hasRentalRestrictions: false,
      rentalRestrictionsRef: '',
      
      // 27. Tax deductibility (cooperatives only)
      taxDeductibilityAttached: false,
      taxDeductibilityNA: true,
      
      // 28. Pending sales
      hasPendingSales: false,
      
      // 29. Mortgage approvals
      hasMortgageApprovals: false,
      mortgageApprovalsList: [],
      
      // 30. CIC Board certification
      cicBoardFiled: true,
      cicRegistrationNumber: '',
      cicExpirationDate: ''
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
    if (field.startsWith('disclosures.')) {
      const disclosureField = field.replace('disclosures.', '');
      setFormData(prev => ({
        ...prev,
        disclosures: {
          ...prev.disclosures,
          [disclosureField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
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
          status: 'opened',
          updated_at: new Date().toISOString()
        })
        .eq('id', formId);

      if (error) throw error;
      
      setSuccess('Virginia Resale Certificate saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to save certificate: ' + err.message);
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

      // Check if both forms are completed
      const { data: allForms } = await supabase
        .from('property_owner_forms')
        .select('status')
        .eq('application_id', applicationData.id);

      const allCompleted = allForms?.every(form => form.status === 'completed');

      if (allCompleted) {
        await supabase
          .from('applications')
          .update({
            status: 'compliance_completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', applicationData.id);
      }
      
      setSuccess('Virginia Resale Certificate completed successfully! Redirecting to dashboard...');
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      setError('Failed to complete certificate: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sections = [
    { id: 1, title: 'Certificate Header', icon: FileText },
    { id: 2, title: 'Preparer Information', icon: Building },
    { id: 3, title: 'Financial Disclosures (1-9)', icon: CheckCircle },
    { id: 4, title: 'Legal & Compliance (10-18)', icon: AlertTriangle },
    { id: 5, title: 'Property Restrictions (19-26)', icon: Building },
    { id: 6, title: 'Final Certifications (27-30)', icon: CheckCircle }
  ];

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
                  Lot Address/Number: *
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
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Preparer Information (Appendix 1)</h3>
            
            <div className="bg-blue-50 p-4 rounded-lg border">
              <h4 className="font-semibold text-blue-900 mb-4">Preparer of the Resale Certificate</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name: *</label>
                  <input
                    type="text"
                    value={formData.preparerName}
                    onChange={(e) => handleInputChange('preparerName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company:</label>
                  <input
                    type="text"
                    value={formData.preparerCompany}
                    onChange={(e) => handleInputChange('preparerCompany', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mailing Address:</label>
                  <textarea
                    value={formData.preparerAddress}
                    onChange={(e) => handleInputChange('preparerAddress', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number:</label>
                  <input
                    type="tel"
                    value={formData.preparerPhone}
                    onChange={(e) => handleInputChange('preparerPhone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email:</label>
                  <input
                    type="email"
                    value={formData.preparerEmail}
                    onChange={(e) => handleInputChange('preparerEmail', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-green-900">Managing Agent</h4>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.noManagingAgent}
                    onChange={(e) => handleInputChange('noManagingAgent', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">No managing agent</span>
                </label>
              </div>
              
              {!formData.noManagingAgent && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name:</label>
                    <input
                      type="text"
                      value={formData.managingAgentName}
                      onChange={(e) => handleInputChange('managingAgentName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company:</label>
                    <input
                      type="text"
                      value={formData.managingAgentCompany}
                      onChange={(e) => handleInputChange('managingAgentCompany', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CIC Manager License No.:</label>
                    <input
                      type="text"
                      value={formData.managingAgentLicense}
                      onChange={(e) => handleInputChange('managingAgentLicense', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number:</label>
                    <input
                      type="tel"
                      value={formData.managingAgentPhone}
                      onChange={(e) => handleInputChange('managingAgentPhone', e.target.value)}
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
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Financial Disclosures (Sections 1-9)</h3>
            
            {/* Section 4: Association Assessments */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">4. Association Assessments *</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Amount: *</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.disclosures.assessmentAmount}
                      onChange={(e) => handleInputChange('disclosures.assessmentAmount', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Frequency: *</label>
                  <select
                    value={formData.disclosures.assessmentFrequency}
                    onChange={(e) => handleInputChange('disclosures.assessmentFrequency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Assessment Due:</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.disclosures.currentAssessmentDue}
                      onChange={(e) => handleInputChange('disclosures.currentAssessmentDue', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date:</label>
                  <input
                    type="date"
                    value={formData.disclosures.currentAssessmentDate}
                    onChange={(e) => handleInputChange('disclosures.currentAssessmentDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid Assessments:</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.disclosures.unpaidAssessments}
                      onChange={(e) => handleInputChange('disclosures.unpaidAssessments', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.transferAssessment}
                      onChange={(e) => handleInputChange('disclosures.transferAssessment', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm">Transfer assessment upon sale</span>
                  </label>
                  {formData.disclosures.transferAssessment && (
                    <div className="mt-2 flex">
                      <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.disclosures.transferAssessmentAmount}
                        onChange={(e) => handleInputChange('disclosures.transferAssessmentAmount', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 7: Special Assessments */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">7. Special Assessments</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasSpecialAssessments}
                    onChange={(e) => handleInputChange('disclosures.hasSpecialAssessments', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have approved additional or special assessments</span>
                </label>
                
                {formData.disclosures.hasSpecialAssessments && (
                  <div className="grid md:grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Amount:</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.specialAssessmentAmount}
                          onChange={(e) => handleInputChange('disclosures.specialAssessmentAmount', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Due Date:</label>
                      <input
                        type="date"
                        value={formData.disclosures.specialAssessmentDate}
                        onChange={(e) => handleInputChange('disclosures.specialAssessmentDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 9: Reserves */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">9. Reserves for Capital Expenditures</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasReserves}
                    onChange={(e) => handleInputChange('disclosures.hasReserves', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have reserves for capital expenditures</span>
                </label>
                
                {formData.disclosures.hasReserves && (
                  <div className="pl-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Total Reserve Amount:</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.reserveAmount}
                          onChange={(e) => handleInputChange('disclosures.reserveAmount', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.hasDesignatedReserves}
                        onChange={(e) => handleInputChange('disclosures.hasDesignatedReserves', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Some reserves are designated for specific projects</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
        
      // Continue with other sections...
      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Legal & Compliance (Sections 10-18)</h3>
            
            {/* Section 13: Legal Issues */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">13. Unsatisfied Judgments and Pending Actions</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasLegalIssues}
                    onChange={(e) => handleInputChange('disclosures.hasLegalIssues', e.target.checked)}
                    className="mr-2"
                  />
                  <span>There are unsatisfied judgments or pending actions</span>
                </label>
                
                {formData.disclosures.hasLegalIssues && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Details:</label>
                    <textarea
                      value={formData.disclosures.legalIssuesDetails}
                      onChange={(e) => handleInputChange('disclosures.legalIssuesDetails', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Describe any unsatisfied judgments or pending actions that could have material impact..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 14: Insurance */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">14. Insurance Coverage</h4>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.providesInsurance}
                      onChange={(e) => handleInputChange('disclosures.providesInsurance', e.target.checked)}
                      className="mr-2"
                    />
                    <span>The association does provide insurance coverage for owners</span>
                  </label>
                  
                  {formData.disclosures.providesInsurance && (
                    <div className="pl-6 mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Insurance Details:</label>
                      <textarea
                        value={formData.disclosures.insuranceDetails}
                        onChange={(e) => handleInputChange('disclosures.insuranceDetails', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe insurance coverage provided by the association..."
                      />
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.recommendsInsurance}
                      onChange={(e) => handleInputChange('disclosures.recommendsInsurance', e.target.checked)}
                      className="mr-2"
                    />
                    <span>The association does recommend or require owners obtain insurance</span>
                  </label>
                  
                  {formData.disclosures.recommendsInsurance && (
                    <div className="pl-6 mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Insurance Requirements:</label>
                      <textarea
                        value={formData.disclosures.insuranceRequirements}
                        onChange={(e) => handleInputChange('disclosures.insuranceRequirements', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe recommended or required insurance coverage..."
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 15: Association Violations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">15. Written Notice from Association</h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.disclosures.hasViolationNotices}
                  onChange={(e) => handleInputChange('disclosures.hasViolationNotices', e.target.checked)}
                  className="mr-2"
                />
                <span>The association has given or received written notice of violations for this unit</span>
              </label>
            </div>

            {/* Section 16: Government Violations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">16. Written Notice from Governmental Agency</h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.disclosures.hasGovernmentNotices}
                  onChange={(e) => handleInputChange('disclosures.hasGovernmentNotices', e.target.checked)}
                  className="mr-2"
                />
                <span>The Board has received written notice from governmental agency of violations</span>
              </label>
            </div>
          </div>
        );
        
      case 5:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Property Restrictions (Sections 19-26)</h3>
            
            {/* Section 20: Occupancy Limitations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">20. Occupancy Limitations</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasOccupancyLimitations}
                    onChange={(e) => handleInputChange('disclosures.hasOccupancyLimitations', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have limitations on number or age of occupants</span>
                </label>
                
                {formData.disclosures.hasOccupancyLimitations && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                    <input
                      type="text"
                      value={formData.disclosures.occupancyLimitationsRef}
                      onChange={(e) => handleInputChange('disclosures.occupancyLimitationsRef', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., Article 5, Section 2 of CC&Rs"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 21: Flag Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">21. United States Flag Restrictions</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasFlagRestrictions}
                    onChange={(e) => handleInputChange('disclosures.hasFlagRestrictions', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have restrictions on displaying the US flag</span>
                </label>
                
                {formData.disclosures.hasFlagRestrictions && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                    <input
                      type="text"
                      value={formData.disclosures.flagRestrictionsRef}
                      onChange={(e) => handleInputChange('disclosures.flagRestrictionsRef', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 22: Solar Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">22. Solar Energy Restrictions</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasSolarRestrictions}
                    onChange={(e) => handleInputChange('disclosures.hasSolarRestrictions', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have restrictions on solar energy devices</span>
                </label>
                
                {formData.disclosures.hasSolarRestrictions && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                    <input
                      type="text"
                      value={formData.disclosures.solarRestrictionsRef}
                      onChange={(e) => handleInputChange('disclosures.solarRestrictionsRef', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 24: Parking Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">24. Parking or Vehicle Restrictions</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasParkingRestrictions}
                    onChange={(e) => handleInputChange('disclosures.hasParkingRestrictions', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have parking or vehicle restrictions</span>
                </label>
                
                {formData.disclosures.hasParkingRestrictions && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                    <input
                      type="text"
                      value={formData.disclosures.parkingRestrictionsRef}
                      onChange={(e) => handleInputChange('disclosures.parkingRestrictionsRef', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 26: Rental Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">26. Rental Restrictions</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasRentalRestrictions}
                    onChange={(e) => handleInputChange('disclosures.hasRentalRestrictions', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association does have restrictions on owner's ability to rent</span>
                </label>
                
                {formData.disclosures.hasRentalRestrictions && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                    <input
                      type="text"
                      value={formData.disclosures.rentalRestrictionsRef}
                      onChange={(e) => handleInputChange('disclosures.rentalRestrictionsRef', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
        
      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Final Certifications (Sections 27-30)</h3>
            
            {/* Section 29: Mortgage Approvals */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">29. Secondary Mortgage Market Agency Approvals</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.hasMortgageApprovals}
                    onChange={(e) => handleInputChange('disclosures.hasMortgageApprovals', e.target.checked)}
                    className="mr-2"
                  />
                  <span>There are known project approvals from secondary mortgage market agencies</span>
                </label>
                
                {formData.disclosures.hasMortgageApprovals && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approved Agencies:</label>
                    <div className="space-y-2">
                      {['Fannie Mae', 'Freddie Mac', 'FHA', 'VA'].map((agency) => (
                        <label key={agency} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.disclosures.mortgageApprovalsList?.includes(agency)}
                            onChange={(e) => {
                              const current = formData.disclosures.mortgageApprovalsList || [];
                              const updated = e.target.checked 
                                ? [...current, agency]
                                : current.filter(a => a !== agency);
                              handleInputChange('disclosures.mortgageApprovalsList', updated);
                            }}
                            className="mr-2"
                          />
                          <span>{agency}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 30: CIC Board Certification */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">30. Common Interest Community Board Certification *</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.cicBoardFiled}
                    onChange={(e) => handleInputChange('disclosures.cicBoardFiled', e.target.checked)}
                    className="mr-2"
                  />
                  <span>The association has filed with the CIC Board the annual report required by law</span>
                </label>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Association Registration Number: *
                    </label>
                    <input
                      type="text"
                      value={formData.disclosures.cicRegistrationNumber}
                      onChange={(e) => handleInputChange('disclosures.cicRegistrationNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="CIC Board registration number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Expiration Date: *
                    </label>
                    <input
                      type="date"
                      value={formData.disclosures.cicExpirationDate}
                      onChange={(e) => handleInputChange('disclosures.cicExpirationDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
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
                    value={formData.preparerName}
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

  const isComplete = formData.developmentName && 
                   formData.developmentLocation && 
                   formData.associationName && 
                   formData.associationAddress && 
                   formData.preparerName && 
                   formData.disclosures.assessmentAmount && 
                   formData.disclosures.cicRegistrationNumber &&
                   formData.disclosures.cicExpirationDate;

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white min-h-screen">
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
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-md hover:bg-purple-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Building className="w-5 h-5 text-purple-600" />
            Application Details
          </h2>
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
          <h2 className="text-xl font-semibold text-gray-800">Virginia State Resale Certificate Form</h2>
          <div className="text-sm text-gray-500">
            Section {currentSection} of {sections.length}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            const isActive = currentSection === section.id;
            const isCompleted = currentSection > section.id;
            
            return (
              <div key={section.id} className="flex items-center">
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
                <span className={`ml-3 text-sm font-medium ${
                  isActive ? 'text-purple-600' :
                  isCompleted ? 'text-purple-600' :
                  'text-gray-500'
                }`}>
                  {section.title}
                </span>
                {section.id < sections.length && (
                  <div className={`flex-1 h-px mx-6 ${
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
            <strong>Required fields:</strong> Development name, location, association details, preparer name, 
            assessment information, and CIC Board registration details must be completed before submission.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminResaleCertificateForm;
