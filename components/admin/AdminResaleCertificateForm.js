import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save, Send, FileText, Calendar, ArrowLeft, Building, CheckCircle, AlertTriangle, Plus, Minus } from 'lucide-react';

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
    preparerAddress: '9960 Mayland Drive, Suite 400\nRichmond, VA 23233-1485',
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
      governingDocsAttached: true,
      rulesAndRegulationsAttached: false,
      
      // 3. Restraints on alienation
      restraintsExist: false,
      restraintsDetails: '',
      restraintsArticleSection: '',
      
      // 4. Association assessments
      assessmentAmount: '',
      assessmentFrequency: 'monthly', // monthly, quarterly, periodic
      periodicDescription: '',
      currentAssessmentDue: '',
      currentAssessmentDate: '',
      unpaidAssessments: '',
      transferAssessment: false,
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
      hasCapitalExpenditures: false,
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
      reserveStudyType: 'not_required', // 'current', 'summary', 'not_required'
      
      // 13. Legal issues
      hasLegalIssues: false,
      legalIssuesDetails: '',
      
      // 14. Insurance
      providesInsurance: false,
      insuranceDetails: '',
      insuranceCertificateAttached: false,
      insuranceArticleSection: '',
      recommendsInsurance: false,
      insuranceRequirements: '',
      insuranceRequirementsArticle: '',
      
      // 15. Association violations
      hasViolationNotices: false,
      violationNoticesAttached: false,
      
      // 16. Government violations
      hasGovernmentNotices: false,
      governmentNoticesAttached: false,
      
      // 17. Board minutes
      boardMinutesAttached: false,
      boardMinutesNA: true,
      
      // 18. Association minutes
      associationMinutesAttached: false,
      
      // 19. Leasehold estates
      hasLeaseholdEstate: false,
      leaseholdDetails: '',
      leaseholdTerm: '',
      
      // 20. Occupancy limitations
      hasOccupancyLimitations: false,
      occupancyLimitationsRef: '',
      occupancyLimitationsArticle: '',
      
      // 21. Flag restrictions
      hasFlagRestrictions: false,
      flagRestrictionsRef: '',
      flagRestrictionsArticle: '',
      
      // 22. Solar restrictions
      hasSolarRestrictions: false,
      solarRestrictionsRef: '',
      solarRestrictionsArticle: '',
      
      // 23. Sign restrictions
      hasSignRestrictions: false,
      signRestrictionsRef: '',
      signRestrictionsArticle: '',
      
      // 24. Parking restrictions
      hasParkingRestrictions: false,
      parkingRestrictionsRef: '',
      parkingRestrictionsArticle: '',
      
      // 25. Business restrictions
      hasBusinessRestrictions: false,
      businessRestrictionsRef: '',
      businessRestrictionsArticle: '',
      
      // 26. Rental restrictions
      hasRentalRestrictions: false,
      rentalRestrictionsRef: '',
      rentalRestrictionsArticle: '',
      
      // 27. Tax deductibility (cooperatives only)
      taxDeductibilityAttached: false,
      taxDeductibilityNA: true,
      
      // 28. Pending sales
      hasPendingSales: false,
      pendingSalesAttached: false,
      
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

  const addArrayItem = (arrayField, newItem) => {
    setFormData(prev => ({
      ...prev,
      disclosures: {
        ...prev.disclosures,
        [arrayField]: [...(prev.disclosures[arrayField] || []), newItem]
      }
    }));
  };

  const removeArrayItem = (arrayField, index) => {
    setFormData(prev => ({
      ...prev,
      disclosures: {
        ...prev.disclosures,
        [arrayField]: prev.disclosures[arrayField].filter((_, i) => i !== index)
      }
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
    { id: 3, title: 'Basic Disclosures (1-6)', icon: CheckCircle },
    { id: 4, title: 'Financial Disclosures (7-12)', icon: AlertTriangle },
    { id: 5, title: 'Legal & Compliance (13-18)', icon: Building },
    { id: 6, title: 'Property Restrictions (19-26)', icon: CheckCircle },
    { id: 7, title: 'Final Certifications (27-30)', icon: CheckCircle }
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
                  placeholder="Enter development name"
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
                  placeholder="Enter association name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Association Address: *
                </label>
                <textarea
                  value={formData.associationAddress}
                  onChange={(e) => handleInputChange('associationAddress', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter full association address"
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
                  placeholder="Enter property address"
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

      case 5:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Legal & Compliance (Sections 13-18)</h3>
            
            {/* Section 13: Legal Issues */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">13. Unsatisfied Judgments and Pending Actions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="legalIssues"
                      checked={!formData.disclosures.hasLegalIssues}
                      onChange={() => handleInputChange('disclosures.hasLegalIssues', false)}
                      className="mr-2"
                    />
                    <span>There are not unsatisfied judgments or pending actions</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="legalIssues"
                      checked={formData.disclosures.hasLegalIssues}
                      onChange={() => handleInputChange('disclosures.hasLegalIssues', true)}
                      className="mr-2"
                    />
                    <span>There are unsatisfied judgments or pending actions</span>
                  </label>
                </div>
                
                {formData.disclosures.hasLegalIssues && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Describe unsatisfied judgments or pending actions that could have material impact:
                    </label>
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
              <div className="space-y-6">
                <div>
                  <h5 className="font-medium text-gray-700 mb-3">Association Insurance Coverage:</h5>
                  <div className="flex gap-4 mb-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="providesInsurance"
                        checked={!formData.disclosures.providesInsurance}
                        onChange={() => handleInputChange('disclosures.providesInsurance', false)}
                        className="mr-2"
                      />
                      <span>The association does not provide insurance coverage for owners</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="providesInsurance"
                        checked={formData.disclosures.providesInsurance}
                        onChange={() => handleInputChange('disclosures.providesInsurance', true)}
                        className="mr-2"
                      />
                      <span>The association does provide insurance coverage for owners, including fidelity coverage</span>
                    </label>
                  </div>
                  
                  {formData.disclosures.providesInsurance && (
                    <div className="pl-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Description of Insurance:</label>
                        <textarea
                          value={formData.disclosures.insuranceDetails}
                          onChange={(e) => handleInputChange('disclosures.insuranceDetails', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Describe insurance coverage provided by the association..."
                        />
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.disclosures.insuranceCertificateAttached}
                              onChange={(e) => handleInputChange('disclosures.insuranceCertificateAttached', e.target.checked)}
                              className="mr-2"
                            />
                            <span>Certificate of Insurance or other documentation attached</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">See Article/Section:</label>
                          <input
                            type="text"
                            value={formData.disclosures.insuranceArticleSection}
                            onChange={(e) => handleInputChange('disclosures.insuranceArticleSection', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Article/Section reference"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <h5 className="font-medium text-gray-700 mb-3">Insurance Requirements for Owners:</h5>
                  <div className="flex gap-4 mb-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="recommendsInsurance"
                        checked={!formData.disclosures.recommendsInsurance}
                        onChange={() => handleInputChange('disclosures.recommendsInsurance', false)}
                        className="mr-2"
                      />
                      <span>The association does not recommend or require owners obtain insurance</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="recommendsInsurance"
                        checked={formData.disclosures.recommendsInsurance}
                        onChange={() => handleInputChange('disclosures.recommendsInsurance', true)}
                        className="mr-2"
                      />
                      <span>The association does recommend or require owners obtain insurance</span>
                    </label>
                  </div>
                  
                  {formData.disclosures.recommendsInsurance && (
                    <div className="pl-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Any other insurance coverage recommended or required to be obtained by the owners can be found in Article/Section:
                      </label>
                      <input
                        type="text"
                        value={formData.disclosures.insuranceRequirementsArticle}
                        onChange={(e) => handleInputChange('disclosures.insuranceRequirementsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section reference for insurance requirements"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 15: Association Violations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">15. Written Notice from the Association</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="violationNotices"
                      checked={!formData.disclosures.hasViolationNotices}
                      onChange={() => handleInputChange('disclosures.hasViolationNotices', false)}
                      className="mr-2"
                    />
                    <span>The association has not given or received written notice of violations</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="violationNotices"
                      checked={formData.disclosures.hasViolationNotices}
                      onChange={() => handleInputChange('disclosures.hasViolationNotices', true)}
                      className="mr-2"
                    />
                    <span>The association has given or received written notice of violations</span>
                  </label>
                </div>
                
                {formData.disclosures.hasViolationNotices && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.violationNoticesAttached}
                        onChange={(e) => handleInputChange('disclosures.violationNoticesAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Written notice(s) attached</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Section 16: Government Violations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">16. Written Notice from a Governmental Agency</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="governmentNotices"
                      checked={!formData.disclosures.hasGovernmentNotices}
                      onChange={() => handleInputChange('disclosures.hasGovernmentNotices', false)}
                      className="mr-2"
                    />
                    <span>The Board has not received written notice from governmental agency</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="governmentNotices"
                      checked={formData.disclosures.hasGovernmentNotices}
                      onChange={() => handleInputChange('disclosures.hasGovernmentNotices', true)}
                      className="mr-2"
                    />
                    <span>The Board has received written notice from governmental agency</span>
                  </label>
                </div>
                
                {formData.disclosures.hasGovernmentNotices && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.governmentNoticesAttached}
                        onChange={(e) => handleInputChange('disclosures.governmentNoticesAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Written notice(s) attached</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Section 17: Board Minutes */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">17. Board Meeting Minutes</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="boardMinutes"
                    checked={formData.disclosures.boardMinutesAttached}
                    onChange={() => {
                      handleInputChange('disclosures.boardMinutesAttached', true);
                      handleInputChange('disclosures.boardMinutesNA', false);
                    }}
                    className="mr-2"
                  />
                  <span>A copy of approved minutes of meetings of the Board held during the last six months are attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="boardMinutes"
                    checked={formData.disclosures.boardMinutesNA}
                    onChange={() => {
                      handleInputChange('disclosures.boardMinutesNA', true);
                      handleInputChange('disclosures.boardMinutesAttached', false);
                    }}
                    className="mr-2"
                  />
                  <span>Not applicable</span>
                </label>
              </div>
            </div>

            {/* Section 18: Association Minutes */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">18. Association Meeting Minutes</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="associationMinutes"
                    checked={formData.disclosures.associationMinutesAttached}
                    onChange={() => handleInputChange('disclosures.associationMinutesAttached', true)}
                    className="mr-2"
                  />
                  <span>A copy of approved or draft minutes of the most recent association meeting is attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="associationMinutes"
                    checked={!formData.disclosures.associationMinutesAttached}
                    onChange={() => handleInputChange('disclosures.associationMinutesAttached', false)}
                    className="mr-2"
                  />
                  <span>A copy of approved or draft minutes of the most recent association meeting is not attached</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Property Restrictions (Sections 19-26)</h3>
            
            {/* Section 19: Leasehold Estates */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">19. Leasehold Estates</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="leaseholdEstate"
                      checked={!formData.disclosures.hasLeaseholdEstate}
                      onChange={() => handleInputChange('disclosures.hasLeaseholdEstate', false)}
                      className="mr-2"
                    />
                    <span>There is not an existing leasehold estate affecting a common area or common element</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="leaseholdEstate"
                      checked={formData.disclosures.hasLeaseholdEstate}
                      onChange={() => handleInputChange('disclosures.hasLeaseholdEstate', true)}
                      className="mr-2"
                    />
                    <span>There is an existing leasehold estate affecting a common area or common element</span>
                  </label>
                </div>
                
                {formData.disclosures.hasLeaseholdEstate && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      The remaining term of the leasehold estate established in the attached document(s) is:
                    </label>
                    <input
                      type="text"
                      value={formData.disclosures.leaseholdTerm}
                      onChange={(e) => handleInputChange('disclosures.leaseholdTerm', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter remaining term"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 20: Occupancy Limitations */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">20. Occupancy Limitations</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="occupancyLimitations"
                      checked={!formData.disclosures.hasOccupancyLimitations}
                      onChange={() => handleInputChange('disclosures.hasOccupancyLimitations', false)}
                      className="mr-2"
                    />
                    <span>The association does not have limitations on number or age of occupants</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="occupancyLimitations"
                      checked={formData.disclosures.hasOccupancyLimitations}
                      onChange={() => handleInputChange('disclosures.hasOccupancyLimitations', true)}
                      className="mr-2"
                    />
                    <span>The association does have limitations on number or age of occupants</span>
                  </label>
                </div>
                
                {formData.disclosures.hasOccupancyLimitations && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.occupancyLimitationsArticle}
                        onChange={(e) => handleInputChange('disclosures.occupancyLimitationsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.occupancyLimitationsRef}
                        onChange={(e) => handleInputChange('disclosures.occupancyLimitationsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 21: Flag Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">21. United States Flag Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="flagRestrictions"
                      checked={!formData.disclosures.hasFlagRestrictions}
                      onChange={() => handleInputChange('disclosures.hasFlagRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have restrictions on displaying the US flag</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="flagRestrictions"
                      checked={formData.disclosures.hasFlagRestrictions}
                      onChange={() => handleInputChange('disclosures.hasFlagRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have restrictions on displaying the US flag</span>
                  </label>
                </div>
                
                {formData.disclosures.hasFlagRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.flagRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.flagRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.flagRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.flagRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 22: Solar Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">22. Solar Energy Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="solarRestrictions"
                      checked={!formData.disclosures.hasSolarRestrictions}
                      onChange={() => handleInputChange('disclosures.hasSolarRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have restrictions on solar energy devices</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="solarRestrictions"
                      checked={formData.disclosures.hasSolarRestrictions}
                      onChange={() => handleInputChange('disclosures.hasSolarRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have restrictions on solar energy devices</span>
                  </label>
                </div>
                
                {formData.disclosures.hasSolarRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.solarRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.solarRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.solarRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.solarRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 23: Sign Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">23. Sign Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="signRestrictions"
                      checked={!formData.disclosures.hasSignRestrictions}
                      onChange={() => handleInputChange('disclosures.hasSignRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have restrictions on signs</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="signRestrictions"
                      checked={formData.disclosures.hasSignRestrictions}
                      onChange={() => handleInputChange('disclosures.hasSignRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have restrictions on signs</span>
                  </label>
                </div>
                
                {formData.disclosures.hasSignRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.signRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.signRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.signRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.signRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 24: Parking Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">24. Parking or Vehicle Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="parkingRestrictions"
                      checked={!formData.disclosures.hasParkingRestrictions}
                      onChange={() => handleInputChange('disclosures.hasParkingRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have parking or vehicle restrictions</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="parkingRestrictions"
                      checked={formData.disclosures.hasParkingRestrictions}
                      onChange={() => handleInputChange('disclosures.hasParkingRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have parking or vehicle restrictions</span>
                  </label>
                </div>
                
                {formData.disclosures.hasParkingRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.parkingRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.parkingRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.parkingRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.parkingRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 25: Business Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">25. Home-Based Business Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="businessRestrictions"
                      checked={!formData.disclosures.hasBusinessRestrictions}
                      onChange={() => handleInputChange('disclosures.hasBusinessRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have restrictions on home-based business</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="businessRestrictions"
                      checked={formData.disclosures.hasBusinessRestrictions}
                      onChange={() => handleInputChange('disclosures.hasBusinessRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have restrictions on home-based business</span>
                  </label>
                </div>
                
                {formData.disclosures.hasBusinessRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.businessRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.businessRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.businessRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.businessRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 26: Rental Restrictions */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">26. Rental Restrictions</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="rentalRestrictions"
                      checked={!formData.disclosures.hasRentalRestrictions}
                      onChange={() => handleInputChange('disclosures.hasRentalRestrictions', false)}
                      className="mr-2"
                    />
                    <span>The association does not have restrictions on owner's ability to rent</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="rentalRestrictions"
                      checked={formData.disclosures.hasRentalRestrictions}
                      onChange={() => handleInputChange('disclosures.hasRentalRestrictions', true)}
                      className="mr-2"
                    />
                    <span>The association does have restrictions on owner's ability to rent</span>
                  </label>
                </div>
                
                {formData.disclosures.hasRentalRestrictions && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section:</label>
                      <input
                        type="text"
                        value={formData.disclosures.rentalRestrictionsArticle}
                        onChange={(e) => handleInputChange('disclosures.rentalRestrictionsArticle', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Article/Section number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Of the:</label>
                      <input
                        type="text"
                        value={formData.disclosures.rentalRestrictionsRef}
                        onChange={(e) => handleInputChange('disclosures.rentalRestrictionsRef', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., governing documents, rules, regulations, resolutions, architectural guidelines"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Final Certifications (Sections 27-30)</h3>
            
            {/* Section 27: Tax Deductibility (Cooperatives Only) */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">27. [Real Estate Cooperatives Only] Tax Deductibility Statement</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="taxDeductibility"
                    checked={formData.disclosures.taxDeductibilityAttached}
                    onChange={() => {
                      handleInputChange('disclosures.taxDeductibilityAttached', true);
                      handleInputChange('disclosures.taxDeductibilityNA', false);
                    }}
                    className="mr-2"
                  />
                  <span>A statement as to the deductibility for federal income tax purposes by the owner of real estate taxes and interest paid by the association is attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="taxDeductibility"
                    checked={formData.disclosures.taxDeductibilityNA}
                    onChange={() => {
                      handleInputChange('disclosures.taxDeductibilityNA', true);
                      handleInputChange('disclosures.taxDeductibilityAttached', false);
                    }}
                    className="mr-2"
                  />
                  <span>Not applicable</span>
                </label>
              </div>
            </div>

            {/* Section 28: Pending Sales */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">28. Pending Sales or Encumbrances</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="pendingSales"
                      checked={!formData.disclosures.hasPendingSales}
                      onChange={() => handleInputChange('disclosures.hasPendingSales', false)}
                      className="mr-2"
                    />
                    <span>There is not a pending sale(s) or encumbrance of common elements</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="pendingSales"
                      checked={formData.disclosures.hasPendingSales}
                      onChange={() => handleInputChange('disclosures.hasPendingSales', true)}
                      className="mr-2"
                    />
                    <span>There is a pending sale(s) or encumbrance of common elements</span>
                  </label>
                </div>
                
                {formData.disclosures.hasPendingSales && (
                  <div className="pl-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.disclosures.pendingSalesAttached}
                        onChange={(e) => handleInputChange('disclosures.pendingSalesAttached', e.target.checked)}
                        className="mr-2"
                      />
                      <span>Any documents pertaining to a pending sale or encumbrance of a common element(s) are attached</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Section 29: Mortgage Approvals */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">29. Secondary Mortgage Market Agency Approvals</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="mortgageApprovals"
                      checked={!formData.disclosures.hasMortgageApprovals}
                      onChange={() => handleInputChange('disclosures.hasMortgageApprovals', false)}
                      className="mr-2"
                    />
                    <span>There is not any known project approval(s) currently in effect issued by secondary mortgage market agencies</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="mortgageApprovals"
                      checked={formData.disclosures.hasMortgageApprovals}
                      onChange={() => handleInputChange('disclosures.hasMortgageApprovals', true)}
                      className="mr-2"
                    />
                    <span>There is known project approval(s) currently in effect issued by secondary mortgage market agencies</span>
                  </label>
                </div>
                
                {formData.disclosures.hasMortgageApprovals && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      The common interest community is known to be currently approved (or mortgages secured by units in the common interest community are eligible for purchase) by the secondary mortgage market agencies checked below:
                    </label>
                    <div className="space-y-2">
                      {['Fannie Mae', 'Freddie Mac', 'FHA', 'VA', 'Other'].map((agency) => (
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
                  <span>The association has filed with the Common Interest Community Board the annual report required by law</span>
                </label>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Association Filing (Registration) Number assigned by the CIC Board: *
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
                      Filing (Registration) Expiration Date: *
                    </label>
                    <input
                      type="date"
                      value={formData.disclosures.cicExpirationDate}
                      onChange={(e) => handleInputChange('disclosures.cicExpirationDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 italic">
                  * A copy of the registration issued by the Common Interest Community Board is sufficient for the certification.
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
                    placeholder="Enter preparer's full name"
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
                    rows={3}
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mailing Address:</label>
                    <textarea
                      value={formData.managingAgentAddress}
                      onChange={(e) => handleInputChange('managingAgentAddress', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email:</label>
                    <input
                      type="email"
                      value={formData.managingAgentEmail}
                      onChange={(e) => handleInputChange('managingAgentEmail', e.target.value)}
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
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Basic Disclosures (Sections 1-6)</h3>
            
            {/* Section 2: Governing Documents */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">2. Governing Documents and Rules & Regulations</h4>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.governingDocsAttached}
                    onChange={(e) => handleInputChange('disclosures.governingDocsAttached', e.target.checked)}
                    className="mr-2"
                  />
                  <span>Association governing documents (required) are attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.disclosures.rulesAndRegulationsAttached}
                    onChange={(e) => handleInputChange('disclosures.rulesAndRegulationsAttached', e.target.checked)}
                    className="mr-2"
                  />
                  <span>Rules and regulations are attached</span>
                </label>
              </div>
            </div>

            {/* Section 3: Restraints on Alienation */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">3. Restraints on Alienation</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="restraints"
                      checked={!formData.disclosures.restraintsExist}
                      onChange={() => handleInputChange('disclosures.restraintsExist', false)}
                      className="mr-2"
                    />
                    <span>There is not any restraint on free alienability</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="restraints"
                      checked={formData.disclosures.restraintsExist}
                      onChange={() => handleInputChange('disclosures.restraintsExist', true)}
                      className="mr-2"
                    />
                    <span>There is a restraint on free alienability</span>
                  </label>
                </div>
                
                {formData.disclosures.restraintsExist && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Article/Section Reference:</label>
                      <input
                        type="text"
                        value={formData.disclosures.restraintsArticleSection}
                        onChange={(e) => handleInputChange('disclosures.restraintsArticleSection', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., Article 5, Section 2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Details:</label>
                      <textarea
                        value={formData.disclosures.restraintsDetails}
                        onChange={(e) => handleInputChange('disclosures.restraintsDetails', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe the restraint on alienability..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 5: Association Fees */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">5. Association Fees</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="otherFees"
                      checked={!formData.disclosures.hasOtherFees}
                      onChange={() => handleInputChange('disclosures.hasOtherFees', false)}
                      className="mr-2"
                    />
                    <span>The association does not charge fees to the owner</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="otherFees"
                      checked={formData.disclosures.hasOtherFees}
                      onChange={() => handleInputChange('disclosures.hasOtherFees', true)}
                      className="mr-2"
                    />
                    <span>The association does charge fees to the owner</span>
                  </label>
                </div>
                
                {formData.disclosures.hasOtherFees && (
                  <div className="pl-6 grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Other Fees Due ($):</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.disclosures.otherFees}
                        onChange={(e) => handleInputChange('disclosures.otherFees', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description:</label>
                      <input
                        type="text"
                        value={formData.disclosures.otherFeesDescription}
                        onChange={(e) => handleInputChange('disclosures.otherFeesDescription', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe the fees"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid Fees ($):</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.disclosures.unpaidFees}
                        onChange={(e) => handleInputChange('disclosures.unpaidFees', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid Description:</label>
                      <input
                        type="text"
                        value={formData.disclosures.unpaidFeesDescription}
                        onChange={(e) => handleInputChange('disclosures.unpaidFeesDescription', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Describe unpaid fees"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 6: Other Entity Assessments */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">6. Other Entity or Facility Assessments, Fees, or Charges</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="otherEntity"
                      checked={!formData.disclosures.otherEntityLiable}
                      onChange={() => handleInputChange('disclosures.otherEntityLiable', false)}
                      className="mr-2"
                    />
                    <span>The owner is not liable to any other entity or facility</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="otherEntity"
                      checked={formData.disclosures.otherEntityLiable}
                      onChange={() => handleInputChange('disclosures.otherEntityLiable', true)}
                      className="mr-2"
                    />
                    <span>The owner is liable to other entities or facilities</span>
                  </label>
                </div>
                
                {formData.disclosures.otherEntityLiable && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Entity/Facility Details:</label>
                    {formData.disclosures.otherEntityDetails.map((entity, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={entity.name}
                          onChange={(e) => {
                            const updated = [...formData.disclosures.otherEntityDetails];
                            updated[index] = { ...updated[index], name: e.target.value };
                            handleInputChange('disclosures.otherEntityDetails', updated);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Entity/Facility Name"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={entity.amount}
                          onChange={(e) => {
                            const updated = [...formData.disclosures.otherEntityDetails];
                            updated[index] = { ...updated[index], amount: e.target.value };
                            handleInputChange('disclosures.otherEntityDetails', updated);
                          }}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Amount Due"
                        />
                        <button
                          onClick={() => removeArrayItem('otherEntityDetails', index)}
                          className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addArrayItem('otherEntityDetails', { name: '', amount: '' })}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    >
                      <Plus className="h-4 w-4" />
                      Add Entity
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Financial Disclosures (Sections 7-12)</h3>
            
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
                      placeholder="0.00"
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
                    <option value="periodic">Periodic</option>
                  </select>
                </div>
                
                {formData.disclosures.assessmentFrequency === 'periodic' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Describe Interval:</label>
                    <input
                      type="text"
                      value={formData.disclosures.periodicDescription}
                      onChange={(e) => handleInputChange('disclosures.periodicDescription', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., Semi-annually, Annually"
                    />
                  </div>
                )}
                
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
                      placeholder="0.00"
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
                  <label className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      checked={formData.disclosures.transferAssessment}
                      onChange={(e) => handleInputChange('disclosures.transferAssessment', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm">Transfer assessment upon sale</span>
                  </label>
                  {formData.disclosures.transferAssessment && (
                    <div className="flex">
                      <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.disclosures.transferAssessmentAmount}
                        onChange={(e) => handleInputChange('disclosures.transferAssessmentAmount', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 7: Special Assessments */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">7. Association Approved Additional or Special Assessments</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="specialAssessments"
                      checked={!formData.disclosures.hasSpecialAssessments}
                      onChange={() => handleInputChange('disclosures.hasSpecialAssessments', false)}
                      className="mr-2"
                    />
                    <span>The association does not have approved additional or special assessments</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="specialAssessments"
                      checked={formData.disclosures.hasSpecialAssessments}
                      onChange={() => handleInputChange('disclosures.hasSpecialAssessments', true)}
                      className="mr-2"
                    />
                    <span>The association does have approved additional or special assessments</span>
                  </label>
                </div>
                
                {formData.disclosures.hasSpecialAssessments && (
                  <div className="pl-6 grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Additional/Special Assessment Due:</label>
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unpaid Additional/Special Assessment Due:</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.disclosures.unpaidSpecialAssessment}
                          onChange={(e) => handleInputChange('disclosures.unpaidSpecialAssessment', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 8: Capital Expenditures */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">8. Capital Expenditures Approved by the Association</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="capitalExpenditures"
                      checked={!formData.disclosures.hasCapitalExpenditures}
                      onChange={() => handleInputChange('disclosures.hasCapitalExpenditures', false)}
                      className="mr-2"
                    />
                    <span>The association does not have approved capital expenditures</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="capitalExpenditures"
                      checked={formData.disclosures.hasCapitalExpenditures}
                      onChange={() => handleInputChange('disclosures.hasCapitalExpenditures', true)}
                      className="mr-2"
                    />
                    <span>The association does have approved capital expenditures</span>
                  </label>
                </div>
                
                {formData.disclosures.hasCapitalExpenditures && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Capital expenditures approved by the association for the current and succeeding fiscal years:</label>
                    <textarea
                      value={formData.disclosures.capitalExpendituresDetails}
                      onChange={(e) => handleInputChange('disclosures.capitalExpendituresDetails', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Describe approved capital expenditures..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 9: Reserves */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">9. Reserves for Capital Expenditures</h4>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserves"
                      checked={!formData.disclosures.hasReserves}
                      onChange={() => handleInputChange('disclosures.hasReserves', false)}
                      className="mr-2"
                    />
                    <span>The association does not have reserves for capital expenditures</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reserves"
                      checked={formData.disclosures.hasReserves}
                      onChange={() => handleInputChange('disclosures.hasReserves', true)}
                      className="mr-2"
                    />
                    <span>The association does have reserves for capital expenditures</span>
                  </label>
                </div>
                
                {formData.disclosures.hasReserves && (
                  <div className="pl-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Total Amount of Association Reserves:</label>
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
                    
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="designatedReserves"
                            checked={!formData.disclosures.hasDesignatedReserves}
                            onChange={() => handleInputChange('disclosures.hasDesignatedReserves', false)}
                            className="mr-2"
                          />
                          <span>The association has not designated some portion of those reserves for specific projects</span>
                        </label>
                        
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="designatedReserves"
                            checked={formData.disclosures.hasDesignatedReserves}
                            onChange={() => handleInputChange('disclosures.hasDesignatedReserves', true)}
                            className="mr-2"
                          />
                          <span>The association has designated some portion of those reserves for specific projects</span>
                        </label>
                      </div>
                      
                      {formData.disclosures.hasDesignatedReserves && (
                        <div className="pl-6">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Amount of total reserves designated for specific projects:</label>
                          {formData.disclosures.designatedReservesDetails.map((reserve, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                              <input
                                type="text"
                                value={reserve.project}
                                onChange={(e) => {
                                  const updated = [...formData.disclosures.designatedReservesDetails];
                                  updated[index] = { ...updated[index], project: e.target.value };
                                  handleInputChange('disclosures.designatedReservesDetails', updated);
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Specific Project"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={reserve.amount}
                                onChange={(e) => {
                                  const updated = [...formData.disclosures.designatedReservesDetails];
                                  updated[index] = { ...updated[index], amount: e.target.value };
                                  handleInputChange('disclosures.designatedReservesDetails', updated);
                                }}
                                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Amount"
                              />
                              <button
                                onClick={() => removeArrayItem('designatedReservesDetails', index)}
                                className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addArrayItem('designatedReservesDetails', { project: '', amount: '' })}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                          >
                            <Plus className="h-4 w-4" />
                            Add Reserve Project
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 10: Financial Statements */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">10. Balance Sheet and Income and Expense Statement</h4>
              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Balance Sheet:</h5>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="balanceSheet"
                        checked={formData.disclosures.balanceSheetAttached}
                        onChange={() => handleInputChange('disclosures.balanceSheetAttached', true)}
                        className="mr-2"
                      />
                      <span>The association's most recent balance sheet is attached</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="balanceSheet"
                        checked={!formData.disclosures.balanceSheetAttached}
                        onChange={() => handleInputChange('disclosures.balanceSheetAttached', false)}
                        className="mr-2"
                      />
                      <span>The association's most recent balance sheet is not attached</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Income and Expense Statement:</h5>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="incomeStatement"
                        checked={formData.disclosures.incomeStatementAttached}
                        onChange={() => handleInputChange('disclosures.incomeStatementAttached', true)}
                        className="mr-2"
                      />
                      <span>The association's most recent income and expense statement is attached</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="incomeStatement"
                        checked={!formData.disclosures.incomeStatementAttached}
                        onChange={() => handleInputChange('disclosures.incomeStatementAttached', false)}
                        className="mr-2"
                      />
                      <span>The association's most recent income and expense statement is not attached</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 11: Operating Budget */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">11. Current Operating Budget of the Association</h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.disclosures.budgetAttached}
                  onChange={(e) => handleInputChange('disclosures.budgetAttached', e.target.checked)}
                  className="mr-2"
                />
                <span>The association's current operating budget is attached</span>
              </label>
            </div>

            {/* Section 12: Reserve Study */}
            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4">12. Reserve Study</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="reserveStudy"
                    value="current"
                    checked={formData.disclosures.reserveStudyType === 'current'}
                    onChange={(e) => handleInputChange('disclosures.reserveStudyType', e.target.value)}
                    className="mr-2"
                  />
                  <span>A copy of the association's current reserve study is attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="reserveStudy"
                    value="summary"
                    checked={formData.disclosures.reserveStudyType === 'summary'}
                    onChange={(e) => handleInputChange('disclosures.reserveStudyType', e.target.value)}
                    className="mr-2"
                  />
                  <span>A summary of the current reserve study of the association is attached</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="reserveStudy"
                    value="not_required"
                    checked={formData.disclosures.reserveStudyType === 'not_required'}
                    onChange={(e) => handleInputChange('disclosures.reserveStudyType', e.target.value)}
                    className="mr-2"
                  />
                  <span>Not applicable. A reserve study is not yet required</span>
                </label>
              </div>
            </div>
          </div>
        );
