/**
 * Settlement PDF Service - Modular service for generating settlement forms
 * Handles both VA "Dues Request - Escrow Instructions" and NC "Statement of Unpaid Assessments"
 */

const { createClientComponentClient } = require("@supabase/auth-helpers-nextjs");
// Utility functions (moved from pricingUtils to avoid module issues)
const getPropertyState = (location) => {
  if (!location) return null;
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) return 'VA';
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) return 'NC';
  return null;
};

const getSettlementDocumentType = (propertyState) => {
  if (propertyState === 'VA') return 'Dues Request - Escrow Instructions';
  if (propertyState === 'NC') return 'Statement of Unpaid Assessments';
  throw new Error(`Unknown property state: ${propertyState}`);
};

// Field mappings for Virginia "Dues Request - Escrow Instructions"
const VA_FIELD_MAPPINGS = {
  // Property Information (auto-filled)
  "Property Name": (data) => data.propertyName,
  "Property Address": (data) => data.propertyAddress,
  "Unit Number": (data) => data.unitNumber || 'N/A',
  "Association Name": (data) => data.associationName,
  "Association Address": (data) => data.associationAddress,
  
  // Buyer Information (auto-filled from application)
  "Buyer Name": (data) => data.buyerName,
  "Buyer Email": (data) => data.buyerEmail,
  "Buyer Phone": (data) => data.buyerPhone,
  "Buyer Address": (data) => data.buyerAddress,
  
  // Closing Information (auto-filled from application)
  "Estimated Closing Date": (data) => data.estimatedClosingDate,
  "Settlement Agent Company": (data) => data.settlementAgentCompany,
  "Settlement Agent Contact": (data) => data.settlementAgentContact,
  
  // Community Manager Information (auto-filled from accountant profile, editable)
  "Manager Name": (data) => data.managerName,
  "Manager Title": (data) => data.managerTitle,
  "Manager Company": (data) => data.managerCompany,
  "Manager Phone": (data) => data.managerPhone,
  "Manager Email": (data) => data.managerEmail,
  "Manager Address": (data) => data.managerAddress,
  
  // Assessment Information (filled by accountant)
  "Monthly Assessment": (data) => data.monthlyAssessment,
  "Assessment Due Date": (data) => data.assessmentDueDate,
  "Unpaid Assessments": (data) => data.unpaidAssessments,
  "Transfer Fee": (data) => data.transferFee,
  "Capital Contribution": (data) => data.capitalContribution,
  "Working Capital": (data) => data.workingCapital,
  
  // Additional Fees (filled by accountant)
  "Other Fees": (data) => data.otherFees,
  "Other Fees Description": (data) => data.otherFeesDescription,
  
  // Form completion
  "Date Prepared": (data) => new Date().toLocaleDateString(),
  "Preparer Signature": (data) => data.preparerSignature || data.managerName,
};

// Field mappings for North Carolina "Statement of Unpaid Assessments"
const NC_FIELD_MAPPINGS = {
  // Property Information (auto-filled)
  "Property Name": (data) => data.propertyName,
  "Property Address": (data) => data.propertyAddress,
  "Unit Number": (data) => data.unitNumber || 'N/A',
  "Association Name": (data) => data.associationName,
  "Association Address": (data) => data.associationAddress,
  "Parcel ID": (data) => data.parcelId,
  
  // Owner/Buyer Information (auto-filled from application)
  "Current Owner": (data) => data.currentOwner,
  "Buyer Name": (data) => data.buyerName,
  "Buyer Email": (data) => data.buyerEmail,
  "Buyer Phone": (data) => data.buyerPhone,
  
  // Closing Information
  "Estimated Closing Date": (data) => data.estimatedClosingDate,
  "Settlement Agent": (data) => data.settlementAgentName,
  
  // Community Manager Information (auto-filled from accountant profile, editable)
  "Manager Name": (data) => data.managerName,
  "Manager Title": (data) => data.managerTitle,
  "Manager Company": (data) => data.managerCompany,
  "Manager Phone": (data) => data.managerPhone,
  "Manager Email": (data) => data.managerEmail,
  
  // Assessment Information (filled by accountant)
  "Regular Assessment Amount": (data) => data.regularAssessmentAmount,
  "Assessment Frequency": (data) => data.assessmentFrequency,
  "Last Payment Date": (data) => data.lastPaymentDate,
  "Unpaid Regular Assessments": (data) => data.unpaidRegularAssessments,
  "Special Assessment Amount": (data) => data.specialAssessmentAmount,
  "Unpaid Special Assessments": (data) => data.unpaidSpecialAssessments,
  "Total Unpaid Amount": (data) => data.totalUnpaidAmount,
  
  // Additional Information
  "Late Fees": (data) => data.lateFees,
  "Interest Charges": (data) => data.interestCharges,
  "Attorney Fees": (data) => data.attorneyFees,
  "Other Charges": (data) => data.otherCharges,
  "Total Amount Due": (data) => data.totalAmountDue,
  
  // Form completion
  "Date Prepared": (data) => new Date().toLocaleDateString(),
  "Preparer Name": (data) => data.preparerName || data.managerName,
  "Preparer Signature": (data) => data.preparerSignature || data.managerName,
  "Notary Date": (data) => data.notaryDate,
};

// Combined field mappings
const SETTLEMENT_FIELD_MAPPINGS = {
  VA: VA_FIELD_MAPPINGS,
  NC: NC_FIELD_MAPPINGS
};

/**
 * Map settlement form data to PDF fields based on property state
 * @param {Object} formData - The settlement form data
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - Mapped PDF fields array
 */
function mapSettlementDataToPDFFields(formData, propertyState) {
  const mappings = SETTLEMENT_FIELD_MAPPINGS[propertyState];
  
  if (!mappings) {
    throw new Error(`Unsupported property state for settlement forms: ${propertyState}`);
  }

  // This would need to be populated with actual PDF field definitions
  // Similar to the fields array in pdfService.js
  const fields = getSettlementPDFFields(propertyState);
  
  const updatedFields = fields.map((field) => {
    const mapper = mappings[field.fieldName];
    let text = "";
    
    if (typeof mapper === "function") {
      text = mapper(formData);
    } else if (typeof mapper === "string") {
      text = formData[mapper] || "";
    }

    return { ...field, text };
  });

  return updatedFields;
}

/**
 * Get PDF field definitions for settlement forms based on state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {Array} - PDF field definitions
 */
function getSettlementPDFFields(propertyState) {
  // This would contain the actual PDF field definitions
  // extracted from the settlement form templates
  // Similar to the fields.js file for resale certificates
  
  if (propertyState === 'VA') {
    // VA "Dues Request - Escrow Instructions" fields
    return [
      { fieldName: "Property Name", fieldType: "text" },
      { fieldName: "Property Address", fieldType: "text" },
      { fieldName: "Unit Number", fieldType: "text" },
      { fieldName: "Association Name", fieldType: "text" },
      { fieldName: "Association Address", fieldType: "text" },
      { fieldName: "Buyer Name", fieldType: "text" },
      { fieldName: "Buyer Email", fieldType: "text" },
      { fieldName: "Buyer Phone", fieldType: "text" },
      { fieldName: "Estimated Closing Date", fieldType: "text" },
      { fieldName: "Settlement Agent Company", fieldType: "text" },
      { fieldName: "Settlement Agent Contact", fieldType: "text" },
      { fieldName: "Manager Name", fieldType: "text" },
      { fieldName: "Manager Title", fieldType: "text" },
      { fieldName: "Manager Company", fieldType: "text" },
      { fieldName: "Manager Phone", fieldType: "text" },
      { fieldName: "Manager Email", fieldType: "text" },
      { fieldName: "Monthly Assessment", fieldType: "text" },
      { fieldName: "Assessment Due Date", fieldType: "text" },
      { fieldName: "Unpaid Assessments", fieldType: "text" },
      { fieldName: "Transfer Fee", fieldType: "text" },
      { fieldName: "Capital Contribution", fieldType: "text" },
      { fieldName: "Working Capital", fieldType: "text" },
      { fieldName: "Other Fees", fieldType: "text" },
      { fieldName: "Other Fees Description", fieldType: "text" },
      { fieldName: "Date Prepared", fieldType: "text" },
      { fieldName: "Preparer Signature", fieldType: "text" },
    ];
  } else if (propertyState === 'NC') {
    // NC "Statement of Unpaid Assessments" fields
    return [
      { fieldName: "Property Name", fieldType: "text" },
      { fieldName: "Property Address", fieldType: "text" },
      { fieldName: "Unit Number", fieldType: "text" },
      { fieldName: "Association Name", fieldType: "text" },
      { fieldName: "Association Address", fieldType: "text" },
      { fieldName: "Parcel ID", fieldType: "text" },
      { fieldName: "Current Owner", fieldType: "text" },
      { fieldName: "Buyer Name", fieldType: "text" },
      { fieldName: "Buyer Email", fieldType: "text" },
      { fieldName: "Buyer Phone", fieldType: "text" },
      { fieldName: "Estimated Closing Date", fieldType: "text" },
      { fieldName: "Settlement Agent", fieldType: "text" },
      { fieldName: "Manager Name", fieldType: "text" },
      { fieldName: "Manager Title", fieldType: "text" },
      { fieldName: "Manager Company", fieldType: "text" },
      { fieldName: "Manager Phone", fieldType: "text" },
      { fieldName: "Manager Email", fieldType: "text" },
      { fieldName: "Regular Assessment Amount", fieldType: "text" },
      { fieldName: "Assessment Frequency", fieldType: "text" },
      { fieldName: "Last Payment Date", fieldType: "text" },
      { fieldName: "Unpaid Regular Assessments", fieldType: "text" },
      { fieldName: "Special Assessment Amount", fieldType: "text" },
      { fieldName: "Unpaid Special Assessments", fieldType: "text" },
      { fieldName: "Late Fees", fieldType: "text" },
      { fieldName: "Interest Charges", fieldType: "text" },
      { fieldName: "Attorney Fees", fieldType: "text" },
      { fieldName: "Other Charges", fieldType: "text" },
      { fieldName: "Total Amount Due", fieldType: "text" },
      { fieldName: "Date Prepared", fieldType: "text" },
      { fieldName: "Preparer Name", fieldType: "text" },
      { fieldName: "Preparer Signature", fieldType: "text" },
      { fieldName: "Notary Date", fieldType: "text" },
    ];
  }
  
  return [];
}

/**
 * Generate settlement PDF using PDF.co and upload to Supabase
 * @param {Object} formData - The settlement form data
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {string} applicationId - Application ID for file naming
 * @returns {Promise<Object>} - Upload result with public URL
 */
async function generateSettlementPDF(formData, propertyState, applicationId) {
  try {
    const supabase = createClientComponentClient();
    const apiKey = process.env.PDFCO_API_KEY;
    
    if (!apiKey) {
      throw new Error("PDFCO_API_KEY is not set in environment variables.");
    }

    // Get the appropriate template token based on state
    // For now, use the existing template token as fallback
    const templateToken = propertyState === 'VA' 
      ? (process.env.PDFCO_VA_SETTLEMENT_TEMPLATE_TOKEN || process.env.PDFCO_TEMPLATE_TOKEN)
      : (process.env.PDFCO_NC_SETTLEMENT_TEMPLATE_TOKEN || process.env.PDFCO_TEMPLATE_TOKEN);
      
    if (!templateToken) {
      throw new Error(`PDF template token not found for state: ${propertyState}. Please set PDFCO_TEMPLATE_TOKEN or state-specific template tokens.`);
    }

    // Map form data to PDF fields
    const fields = mapSettlementDataToPDFFields(formData, propertyState);
    
    // Generate filename
    const documentType = getSettlementDocumentType(propertyState);
    const filename = `settlement_${propertyState.toLowerCase()}_${applicationId}.pdf`;
    const filePath = `settlement-forms/${applicationId}/${filename}`;

    // Call PDF.co API to fill the template
    const fillResponse = await fetch("https://api.pdf.co/v1/pdf/edit/add", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: templateToken,
        name: filePath,
        async: false,
        fields,
      }),
    });

    const fillData = await fillResponse.json();
    if (!fillData || !fillData.url) {
      throw new Error("PDF.co did not return a filled PDF URL");
    }

    // Download the filled PDF
    const pdfResponse = await fetch(fillData.url);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("bucket0")
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from("bucket0").getPublicUrl(filePath);
    
    return { 
      data, 
      publicURL: publicUrl,
      documentType,
      filename
    };

  } catch (error) {
    console.error('Error generating settlement PDF:', error);
    throw error;
  }
}

/**
 * Prepare settlement form data from application and property information
 * @param {Object} application - Application data from database
 * @param {Object} hoaProperty - HOA property data from database
 * @param {Object} accountantUser - Accountant user profile for auto-fill
 * @returns {Object} - Prepared form data for PDF generation
 */
function prepareSettlementFormData(application, hoaProperty, accountantUser) {
  const propertyState = getPropertyState(hoaProperty.location);
  
  const baseData = {
    // Property Information
    propertyName: hoaProperty.name,
    propertyAddress: application.property_address,
    unitNumber: application.unit_number,
    associationName: hoaProperty.name,
    associationAddress: hoaProperty.address || hoaProperty.location,
    
    // Buyer Information
    buyerName: application.buyer_name,
    buyerEmail: application.buyer_email,
    buyerPhone: application.buyer_phone,
    buyerAddress: `${application.buyer_name}`, // May need additional buyer address field
    
    // Closing Information
    estimatedClosingDate: application.closing_date 
      ? new Date(application.closing_date).toLocaleDateString() 
      : 'TBD',
    settlementAgentCompany: application.submitter_company,
    settlementAgentContact: `${application.submitter_name} - ${application.submitter_email}`,
    settlementAgentName: application.submitter_name,
    
    // Community Manager Information (auto-filled from accountant)
    managerName: accountantUser?.name || '',
    managerTitle: accountantUser?.title || 'Community Manager',
    managerCompany: accountantUser?.company || 'GMG Community Management',
    managerPhone: accountantUser?.phone || '',
    managerEmail: accountantUser?.email || '',
    managerAddress: accountantUser?.address || '',
    
    // Additional data that will be filled by accountant
    currentOwner: application.seller_name || 'Current Owner',
    parcelId: '', // To be filled by accountant
    
    // Assessment fields (to be filled by accountant in form)
    monthlyAssessment: '',
    assessmentDueDate: '',
    unpaidAssessments: '',
    totalAmountDue: '',
    // ... other fields will be filled in the form
  };

  return baseData;
}

/**
 * Generate settlement PDFs for multi-community properties with parallel processing
 * @param {Object} application - Application data from database
 * @param {Array} allProperties - Array of all properties (primary + linked)
 * @param {Object} accountantUser - Accountant user profile for auto-fill
 * @returns {Promise<Array>} - Array of generated PDF results
 */
async function generateMultiCommunitySettlementPDFs(application, allProperties, accountantUser) {
  // Process all properties in parallel for better performance
  const pdfPromises = allProperties.map(async (property, i) => {
    const isPrimary = i === 0;
    
    try {
      // Prepare form data for this property
      const formData = prepareSettlementFormData(application, property, accountantUser);
      
      // Add multi-community context to the form data
      formData.isMultiCommunity = true;
      formData.isPrimaryProperty = isPrimary;
      formData.totalProperties = allProperties.length;
      formData.propertyIndex = i + 1;
      
      // Get property state
      const propertyState = getPropertyState(property.location);
      
      if (!propertyState) {
        console.warn(`Could not determine state for property: ${property.name || property.property_name}`);
        return {
          propertyName: property.name || property.property_name,
          isPrimary,
          propertyIndex: i + 1,
          error: 'Could not determine property state',
          success: false
        };
      }
      
      // Generate PDF for this property
      const result = await generateSettlementPDF(formData, propertyState, application.id);
      
      // Add property context to the result
      result.propertyName = property.name || property.property_name;
      result.propertyState = propertyState;
      result.isPrimary = isPrimary;
      result.propertyIndex = i + 1;
      
      return result;
      
    } catch (error) {
      console.error(`Error generating PDF for property ${property.name || property.property_name}:`, error);
      
      // Return error result to maintain array consistency
      return {
        propertyName: property.name || property.property_name,
        isPrimary,
        propertyIndex: i + 1,
        error: error.message,
        success: false
      };
    }
  });
  
  // Wait for all PDFs to complete
  const results = await Promise.all(pdfPromises);
  
  return results;
}

/**
 * Generate resale certificate PDFs for multi-community properties
 * @param {Object} application - Application data from database
 * @param {Array} allProperties - Array of all properties (primary + linked)
 * @param {Object} accountantUser - Accountant user profile for auto-fill
 * @returns {Promise<Array>} - Array of generated PDF results
 */
async function generateMultiCommunityResalePDFs(application, allProperties, accountantUser) {
  const results = [];
  
  for (let i = 0; i < allProperties.length; i++) {
    const property = allProperties[i];
    const isPrimary = i === 0;
    
    try {
      // Import the resale PDF service
      const { generateResalePDF, prepareResaleFormData } = await import('./pdfService');
      
      // Prepare form data for this property
      const formData = prepareResaleFormData(application, property, accountantUser);
      
      // Add multi-community context to the form data
      formData.isMultiCommunity = true;
      formData.isPrimaryProperty = isPrimary;
      formData.totalProperties = allProperties.length;
      formData.propertyIndex = i + 1;
      
      // Generate PDF for this property
      const result = await generateResalePDF(formData, application.id);
      
      // Add property context to the result
      result.propertyName = property.name || property.property_name;
      result.isPrimary = isPrimary;
      result.propertyIndex = i + 1;
      
      results.push(result);
      
    } catch (error) {
      console.error(`Error generating resale PDF for property ${property.name || property.property_name}:`, error);
      
      // Add error result to maintain array consistency
      results.push({
        propertyName: property.name || property.property_name,
        isPrimary: i === 0,
        propertyIndex: i + 1,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}

/**
 * Generate all required documents for multi-community properties
 * @param {Object} application - Application data from database
 * @param {Array} allProperties - Array of all properties (primary + linked)
 * @param {Object} accountantUser - Accountant user profile for auto-fill
 * @param {Array} requiredForms - Array of required form types
 * @returns {Promise<Object>} - Object with all generated documents
 */
async function generateMultiCommunityDocuments(application, allProperties, accountantUser, requiredForms) {
  const allDocuments = {
    settlement: [],
    resale: [],
    inspection: [],
    errors: []
  };
  
  try {
    // Generate settlement forms if required
    if (requiredForms.includes('settlement_agent_va') || requiredForms.includes('settlement_agent_nc')) {
      allDocuments.settlement = await generateMultiCommunitySettlementPDFs(application, allProperties, accountantUser);
    }
    
    // Generate resale certificates if required
    if (requiredForms.includes('resale_certificate')) {
      allDocuments.resale = await generateMultiCommunityResalePDFs(application, allProperties, accountantUser);
    }
    
    // Generate inspection forms if required
    if (requiredForms.includes('inspection_form')) {
      // Note: Inspection forms are typically filled out by property managers
      // This would generate blank forms for each property
      allDocuments.inspection = allProperties.map((property, index) => ({
        propertyName: property.name || property.property_name,
        isPrimary: index === 0,
        propertyIndex: index + 1,
        formType: 'inspection_form',
        status: 'pending_completion',
        message: 'Inspection form will be completed by property manager'
      }));
    }
    
    // Collect any errors
    allDocuments.errors = [
      ...allDocuments.settlement.filter(doc => doc.error),
      ...allDocuments.resale.filter(doc => doc.error)
    ];
    
    return allDocuments;
    
  } catch (error) {
    console.error('Error generating multi-community documents:', error);
    allDocuments.errors.push({
      error: error.message,
      type: 'general_error'
    });
    return allDocuments;
  }
}

module.exports = {
  mapSettlementDataToPDFFields,
  getSettlementPDFFields,
  generateSettlementPDF,
  prepareSettlementFormData,
  generateMultiCommunitySettlementPDFs,
  generateMultiCommunityResalePDFs,
  generateMultiCommunityDocuments,
  SETTLEMENT_FIELD_MAPPINGS
};