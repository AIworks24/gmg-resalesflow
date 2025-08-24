/**
 * Settlement PDF Service - Modular service for generating settlement forms
 * Handles both VA "Dues Request - Escrow Instructions" and NC "Statement of Unpaid Assessments"
 */

const { createClientComponentClient } = require("@supabase/auth-helpers-nextjs");
const { getPropertyState, getSettlementDocumentType } = require('./pricingUtils');

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
      { fieldName: "Buyer Name", fieldType: "text" },
      { fieldName: "Buyer Email", fieldType: "text" },
      { fieldName: "Estimated Closing Date", fieldType: "text" },
      { fieldName: "Manager Name", fieldType: "text" },
      { fieldName: "Monthly Assessment", fieldType: "text" },
      { fieldName: "Date Prepared", fieldType: "text" },
      // Add more fields as needed based on actual PDF template
    ];
  } else if (propertyState === 'NC') {
    // NC "Statement of Unpaid Assessments" fields
    return [
      { fieldName: "Property Name", fieldType: "text" },
      { fieldName: "Property Address", fieldType: "text" },
      { fieldName: "Unit Number", fieldType: "text" },
      { fieldName: "Current Owner", fieldType: "text" },
      { fieldName: "Buyer Name", fieldType: "text" },
      { fieldName: "Estimated Closing Date", fieldType: "text" },
      { fieldName: "Manager Name", fieldType: "text" },
      { fieldName: "Regular Assessment Amount", fieldType: "text" },
      { fieldName: "Total Amount Due", fieldType: "text" },
      { fieldName: "Date Prepared", fieldType: "text" },
      // Add more fields as needed based on actual PDF template
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
    const templateToken = propertyState === 'VA' 
      ? process.env.PDFCO_VA_SETTLEMENT_TEMPLATE_TOKEN
      : process.env.PDFCO_NC_SETTLEMENT_TEMPLATE_TOKEN;
      
    if (!templateToken) {
      throw new Error(`PDF template token not found for state: ${propertyState}`);
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

module.exports = {
  mapSettlementDataToPDFFields,
  getSettlementPDFFields,
  generateSettlementPDF,
  prepareSettlementFormData,
  SETTLEMENT_FIELD_MAPPINGS
};