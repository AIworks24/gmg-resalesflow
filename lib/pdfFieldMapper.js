/**
 * PDF Field Mapper - Client-safe functions for mapping form data to PDF fields
 * This file can be safely imported in client components
 */

const { fields } = require("./fields");

// Helper function to get current date formatted in timezone
const getCurrentDateInTimezone = (timezone) => {
  try {
    const date = new Date();
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: tz
    });
  } catch (error) {
    // Fallback to default formatting if timezone is invalid
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
};

// Helper function to robustly check if a value is truthy (handles boolean, string, number)
const isTruthy = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value === true;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  if (typeof value === 'number') return value === 1 || value > 0;
  return Boolean(value);
};

const FIELD_TO_FORMDATA = {
  "Name of Development": (formData) => formData.developmentName || "",
  "Location of Development CountyCity": (formData) => formData.developmentLocation || "",
  "Association Name": (formData) => formData.associationName || "",
  "Association Address": (formData) => formData.associationAddress || "",
  "Lot Address Number or Reference": (formData) => formData.lotAddress || "",

  "Name": (formData) => formData.preparer?.name || "",
  "Company":  (formData) => formData.preparer?.company || "",
  "ng Address 1": (formData) => formData.preparer?.address || "",
  "Phone Number": (formData) => formData.preparer?.phone || "",
  "Managing Agent_Name": (formData) => formData.managingAgent?.name || "",
  "Managing Agent_Company": (formData) => formData.managingAgent?.company || "",
  "Managing Agent - CIC Manager Lic No": (formData) => formData.managingAgent?.licenseNumber || "",
  "Managing Agent - Address1": (formData) => formData.managingAgent?.address || "",
  "Managing Agent - Phone Number": (formData) => formData.managingAgent?.phone || "",
  "Managing Agent - Email": (formData) => formData.managingAgent?.email || "",
  "Assessment Amount": (formData) => formData.salePrice ? `$${Number(formData.salePrice).toLocaleString()}` : "",
  "Due Date": (formData) => formData.closingDate ? new Date(formData.closingDate).toLocaleDateString() : "",
  "Email": (formData) => formData.preparer?.email || "",

  "Date Prepared": (formData, timezone) => {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return getCurrentDateInTimezone(tz);
  },
  "Check Box1": (formData) =>
    isTruthy(formData.disclosures?.contactInfoAttached) ? "True" : "False",
  "Check Box2": (formData) =>
    isTruthy(formData.disclosures?.governingDocsAttached) ? "True" : "False",
  "Check Box4": (formData) =>
    isTruthy(formData.disclosures?.assessmentSchedule?.hasAssessments)
      ? "True"
      : "False",
  "Check Box30": (formData) =>
    isTruthy(formData.disclosures?.cicCertification?.reportFiled)
      ? "True"
      : "False",
  // Check Box_APP6 is the "Not applicable" checkbox for Appendix 6 (Other Entity Assessments)
  // It should be checked when isLiable is false
  "Check Box_APP6": (formData) => formData.disclosures?.otherEntity?.isLiable === false ? "True" : "False",
  "Check Box_App29": (formData) =>
    isTruthy(formData.disclosures?.rulesRegulationsAttached) ? "True" : "False",
  // Map both "Check Box11" (without period) and "Check Box11." (with period) to the same data
  "Check Box11": (formData) => {
    // Use the robust isTruthy helper to handle boolean, string, and number values
    const budgetAttached = formData.disclosures?.operatingBudget?.budgetAttached;
    const result = isTruthy(budgetAttached) ? "True" : "False";
    // Debug logging for checkbox #11 (always log to help diagnose)
    console.log('[Check Box11] Mapping function called:');
    console.log('  - budgetAttached value:', budgetAttached);
    console.log('  - type:', typeof budgetAttached);
    console.log('  - isTruthy result:', isTruthy(budgetAttached));
    console.log('  - final result:', result);
    console.log('  - formData.disclosures exists:', !!formData.disclosures);
    console.log('  - formData.disclosures.operatingBudget exists:', !!formData.disclosures?.operatingBudget);
    console.log('  - full operatingBudget:', JSON.stringify(formData.disclosures?.operatingBudget, null, 2));
    return result;
  },
  "Check Box11.": (formData) => {
    // Also support "Check Box11." (with period) for backward compatibility
    const budgetAttached = formData.disclosures?.operatingBudget?.budgetAttached;
    const result = isTruthy(budgetAttached) ? "True" : "False";
    console.log('[Check Box11.] Mapping function called (with period):');
    console.log('  - budgetAttached value:', budgetAttached);
    console.log('  - final result:', result);
    return result;
  },
  "Check Box_App02.2": (formData) =>
    isTruthy(formData.disclosures?.rulesRegulationsAttached) ? "True" : "False",
  // Also map "Check BoxApp_02.2" (no space) - actual field name in PDF Appendix 2
  "Check BoxApp_02.2": (formData) => {
    const rulesRegulationsAttached = formData.disclosures?.rulesRegulationsAttached;
    const result = isTruthy(rulesRegulationsAttached) ? "True" : "False";
    console.log('[Check BoxApp_02.2] Mapping function called (Appendix 2 - Rules and regulations):');
    console.log('  - rulesRegulationsAttached value:', rulesRegulationsAttached);
    console.log('  - type:', typeof rulesRegulationsAttached);
    console.log('  - isTruthy result:', isTruthy(rulesRegulationsAttached));
    console.log('  - final result:', result);
    return result;
  },
  "Check Box_App12_01": (formData) => {
    const governingDocsAttached = formData.disclosures?.governingDocsAttached;
    const result = isTruthy(governingDocsAttached) ? "True" : "False";
    console.log('[Check Box_App12_01] Mapping function called (Appendix 2 - Association governing documents):');
    console.log('  - governingDocsAttached value:', governingDocsAttached);
    console.log('  - type:', typeof governingDocsAttached);
    console.log('  - isTruthy result:', isTruthy(governingDocsAttached));
    console.log('  - final result:', result);
    return result;
  },
  "Group3.Choice1": (formData) =>
    formData.disclosures?.restraintsExist === true ? "1" : "0",
  "Group3.Choice2": (formData) =>
    formData.disclosures?.restraintsExist === false ? "1" : "0",
  "Group5.Choice1": (formData) =>
    formData.disclosures?.fees?.hasOtherFees === true ? "1" : "0",
  "Group5.Choice2": (formData) =>
    formData.disclosures?.fees?.hasOtherFees === false ? "1" : "0",
  "Group6.Choice1": (formData) =>
    formData.disclosures?.otherEntity?.isLiable === true ? "1" : "0",
  "Group6.Choice2": (formData) =>
    formData.disclosures?.otherEntity?.isLiable === false ? "1" : "0",
  "Group7.Choice1": (formData) =>
    formData.disclosures?.specialAssessments?.hasApproved === true
      ? "1"
      : "0",
  "Group7.Choice2": (formData) =>
    formData.disclosures?.specialAssessments?.hasApproved === false
      ? "1"
      : "0",
  "Group8.Choice1": (formData) =>
    formData.disclosures?.capitalExpenditures?.hasApproved === true
      ? "1"
      : "0",
  "Group8.Choice2": (formData) =>
    formData.disclosures?.capitalExpenditures?.hasApproved === false
      ? "1"
      : "0",
  "Group9.1.Choice1": (formData) =>
    formData.disclosures?.reserves?.hasReserves === true ? "1" : "0",
  "Group9.1.Choice2": (formData) =>
    formData.disclosures?.reserves?.hasReserves === false ? "1" : "0",
  "Group9.2.Choice1": (formData) =>
    formData.disclosures?.reserves?.hasDesignated === true ? "1" : "0",
  "Group9.2.Choice2": (formData) =>
    formData.disclosures?.reserves?.hasDesignated === false ? "1" : "0",
  "Group10.1.Choice1": (formData) =>
    formData.disclosures?.financialStatements?.balanceSheetAttached === true
      ? "1"
      : "0",
  "Group10.1.Choice2": (formData) =>
    formData.disclosures?.financialStatements?.balanceSheetAttached === false
      ? "1"
      : "0",
  "Group10.2.Choice1": (formData) =>
    formData.disclosures?.financialStatements?.incomeStatementAttached === true
      ? "1"
      : "0",
  "Group10.2.Choice2": (formData) =>
    formData.disclosures?.financialStatements?.incomeStatementAttached === false
      ? "1"
      : "0",

  "Group11.1.Choice1": (formData) =>
    formData.disclosures?.reserves?.hasReserves === true ? "1" : "0",
  "Group11.1.Choice2": (formData) =>
    formData.disclosures?.reserves?.hasReserves === false ? "1" : "0",

  "Group12.Choice1": (formData) =>
    formData.disclosures?.reserveStudy?.type === "current" ? "1" : "0",
  "Group12.Choice2": (formData) =>
    formData.disclosures?.reserveStudy?.type === "summary" ? "1" : "0",

  "Group13.Choice1": (formData) =>
    formData.disclosures?.legalIssues?.hasIssues === true ? "1" : "0",
  "Group13.Choice2": (formData) =>
    formData.disclosures?.legalIssues?.hasIssues === false ? "1" : "0",
  "Group14.1.Choice1": (formData) =>
    formData.disclosures?.insurance?.associationProvides === true
      ? "1"
      : "0",
  "Group14.1.Choice2": (formData) =>
    formData.disclosures?.insurance?.associationProvides === false
      ? "1"
      : "0",
  "Group14.2.Choice1": (formData) =>
    formData.disclosures?.insurance?.recommendsOwnerCoverage === true
      ? "1"
      : "0",
  "Group14.2.Choice2": (formData) =>
    formData.disclosures?.insurance?.recommendsOwnerCoverage === false
      ? "1"
      : "0",
  "Group15.Choice1": (formData) =>
    formData.disclosures?.associationViolations?.hasNotices === true
      ? "1"
      : "0",
  "Group15.Choice2": (formData) =>
    formData.disclosures?.associationViolations?.hasNotices === false
      ? "1"
      : "0",
  "Group16.Choice1": (formData) =>
    formData.disclosures?.governmentViolations?.hasNotices === true
      ? "1"
      : "0",
  "Group16.Choice2": (formData) =>
    formData.disclosures?.governmentViolations?.hasNotices === false
      ? "1"
      : "0",   
  "Group17.Choice1": (formData) =>
    formData.disclosures?.boardMinutes?.attached === true ? "1" : "0",
  "Group17.Choice2": (formData) =>
    formData.disclosures?.boardMinutes?.attached === false ? "1" : "0",
  "Group18.Choice1": (formData) =>
    formData.disclosures?.associationMinutes?.attached === true ? "1" : "0",
  "Group18.Choice2": (formData) =>
    formData.disclosures?.associationMinutes?.attached === false ? "1" : "0",
  "Group19.Choice1": (formData) =>
    formData.disclosures?.leaseholdEstates?.exists === true ? "1" : "0",
  "Group19.Choice2": (formData) =>
    formData.disclosures?.leaseholdEstates?.exists === false ? "1" : "0",
  "Group20.Choice1": (formData) =>
    formData.disclosures?.occupancyLimitations?.hasLimitations === true ? "1" : "0",
  "Group20.Choice2": (formData) =>  
    formData.disclosures?.occupancyLimitations?.hasLimitations === false ? "1" : "0",
  "Group21.Choice1": (formData) =>
    formData.disclosures?.flagRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group21.Choice2": (formData) =>
    formData.disclosures?.flagRestrictions?.hasRestrictions === false ? "1" : "0",
  "Group22.Choice1": (formData) =>
    formData.disclosures?.solarRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group22.Choice2": (formData) =>
    formData.disclosures?.solarRestrictions?.hasRestrictions === false ? "1" : "0",
  "Group23.Choice1": (formData) =>
    formData.disclosures?.signRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group23.Choice2": (formData) =>
    formData.disclosures?.signRestrictions?.hasRestrictions === false ? "1" : "0", 
  "Group24.Choice1": (formData) =>
    formData.disclosures?.parkingRestrictions?.hasRestrictions  === true ? "1" : "0",
  "Group24.Choice2": (formData) =>
    formData.disclosures?.parkingRestrictions?.hasRestrictions  === false ? "1" : "0",
  "Group25.Choice1": (formData) =>
    formData.disclosures?.businessRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group25.Choice2": (formData) =>
    formData.disclosures?.businessRestrictions?.hasRestrictions === false ? "1" : "0",
  "Group26.Choice1": (formData) =>
    formData.disclosures?.rentalRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group26.Choice2": (formData) =>
    formData.disclosures?.rentalRestrictions?.hasRestrictions === false ? "1" : "0",
  "Group27.Choice1": (formData) => 
    formData.disclosures?.taxDeductibility?.statementAttached === true ? "1" : "0",
  "Group27.Choice2": (formData) =>
    formData.disclosures?.taxDeductibility?.statementAttached === false ? "1" : "0",
  "Group28.Choice1": (formData) =>
    formData.disclosures?.pendingSales?.hasPending === true ? "1" : "0",
  "Group28.Choice2": (formData) =>
    formData.disclosures?.pendingSales?.hasPending === false ? "1" : "0",
  "Group29.Choice1": (formData) =>
    formData.disclosures?.mortgageApprovals?.hasApprovals === true ? "1" : "0",
  "Group29.Choice2": (formData) =>
    formData.disclosures?.mortgageApprovals?.hasApprovals === false ? "1" : "0",

  "Check Box_APP01 - Not applicable": (formData) =>
    formData.managingAgent?.exists === false ? "True" : "False", // Note: This is inverted logic (exists === false)

  "Article/Section_Section3": (formData) => {
    if (formData.disclosures?.restraintsArticleSection || formData.disclosures?.restraintsDescription) {
      const articleSection = formData.disclosures?.restraintsArticleSection || "";
      const description = formData.disclosures?.restraintsDescription || "";
      return `${articleSection} : ${description}`.trim();
    }
  },

  "Monthly": (formData) => formData.disclosures?.assessmentSchedule?.monthlyAmount || "",
  "Quarterly": (formData) => formData.disclosures?.assessmentSchedule?.quarterlyAmount || "",
  "Interval": (formData) => formData.disclosures?.assessmentSchedule?.periodicInterval || "",
  "n the amount of": (formData) => formData.disclosures?.assessmentSchedule?.periodicAmount || "",
  "Current assessment due": (formData) => formData.disclosures?.assessmentSchedule?.currentAssessmentDueDate || "",
  "Current Assessment": (formData) => formData.disclosures?.assessmentSchedule?.currentAssessmentDue || "",
  "UnpaidAssessment": (formData) => formData.disclosures?.assessmentSchedule?.unpaidAssessments || "",
  "Assessment Amount": (formData) => formData.disclosures?.assessmentSchedule?.transferAssessmentAmount || "",
  "Other fees due": (formData) => formData.disclosures?.fees?.otherFeesDescription || "",
  "Description": (formData) => formData.disclosures?.fees?.unpaidFeesDescription || "",
  "Unpaid Fees": (formData) => {
    // Only show unpaid fees if hasOtherFees is true, otherwise clear the field
    if (formData.disclosures?.fees?.hasOtherFees === true) {
      return formData.disclosures?.fees?.unpaidFeesAmount || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "Other Fees Due": (formData) => {
    // Only show other fees if hasOtherFees is true, otherwise clear the field
    if (formData.disclosures?.fees?.hasOtherFees === true) {
      return formData.disclosures?.fees?.otherFeesAmount || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "Group_App3.Choice1": (formData) => formData.disclosures?.restraintsExist === true ? "1" : "0",
  "Group_App3.Choice2": (formData) => formData.disclosures?.restraintsExist === false ? "1" : "0",
  "Group_Appx4.1.Choice1": (formData) => formData.disclosures?.assessmentSchedule?.hasAssessments === true ? "1" : "0",
  "Group_Appx4.1.Choice2": (formData) => formData.disclosures?.assessmentSchedule?.hasTransferAssessment === true ? "1" : "0",
  "Group_Appx4.2.Choice1": (formData) => formData.disclosures?.assessmentSchedule?.monthly === true ? "1" : "0",
  "Group_Appx4.2.Choice2": (formData) => formData.disclosures?.assessmentSchedule?.quarterly === true ? "1" : "0",
  "Group_Appx4.2.Choice3": (formData) => formData.disclosures?.assessmentSchedule?.periodic === true ? "1" : "0",
  "Check Box_Appx5.3": (formData) => formData.disclosures?.fees?.hasOtherFees === false ? "True" : "False", // Note: This is inverted logic
  "Check Appx5.1": (formData) => (formData.disclosures?.fees?.otherFeesAmount || "").trim() !== "" ? "True" : "False",
  "Check BoxAppx5.2": (formData) => (formData.disclosures?.fees?.unpaidFeesAmount || "").trim() !== "" ? "True" : "False",
  "Due Date": (formData) => {
    // Only show due date if hasApproved is true, otherwise clear the field
    if (formData.disclosures?.specialAssessments?.hasApproved === true) {
      return formData.disclosures?.specialAssessments?.approvedDueDate || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "Special Assessment": (formData) => {
    // Only show approved amount if hasApproved is true, otherwise clear the field
    if (formData.disclosures?.specialAssessments?.hasApproved === true) {
      return formData.disclosures?.specialAssessments?.approvedAmount || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "assessment due": (formData) => {
    // Only show unpaid amount if hasApproved is true, otherwise clear the field
    if (formData.disclosures?.specialAssessments?.hasApproved === true) {
      return formData.disclosures?.specialAssessments?.unpaidAmount || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "Capital Expenditures": (formData) => {
    // Only show details if hasApproved is true, otherwise clear the field
    if (formData.disclosures?.capitalExpenditures?.hasApproved === true) {
      return formData.disclosures?.capitalExpenditures?.details || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  // Check Box_APP6 is the "Not applicable" checkbox for Appendix 6 (Other Entity Assessments)
  // It should be checked when isLiable is false
  "Check Box_APP6": (formData) => formData.disclosures?.otherEntity?.isLiable === false ? "True" : "False",
  "Group_App7.Choice1": (formData) => formData.disclosures?.specialAssessments?.approvedAmount !== "" ? "1" : "0",
  "Group_App7.Choice2": (formData) => formData.disclosures?.specialAssessments?.unpaidAmount !== "" ? "1" : "0",
  "Group_App7.Choice3": (formData) => formData.disclosures?.specialAssessments?.hasApproved === false ? "1" : "0",
  // Group_App8 is for Appendix 8 (Capital Expenditures), not reserves!
  "Group_App8.Choice1": (formData) => formData.disclosures?.capitalExpenditures?.hasApproved === true ? "1" : "0",
  "Group_App8.Choice2": (formData) => formData.disclosures?.capitalExpenditures?.hasApproved === false ? "1" : "0",
  "undefined_8": (formData) => {
    // Only show total amount if hasReserves is true, otherwise clear the field
    if (formData.disclosures?.reserves?.hasReserves === true) {
      return formData.disclosures?.reserves?.totalAmount || "";
    }
    return ""; // Clear field when "Not Applicable" is selected
  },
  "Check Box_App9": (formData) => isTruthy(formData.disclosures?.reserves?.hasDesignated) ? "True" : "False",
  "Check Box_App12.2": (formData) => {
    const type = formData.disclosures?.reserveStudy?.type;
    return (type !== "current" && type !== "summary") ? "True" : "False";
  },
  "Group_App10.Choice1": (formData) => formData.disclosures?.financialStatements?.balanceSheetAttached === true && formData.disclosures?.financialStatements?.incomeStatementAttached === true ? "1" : "0",
  "Group_App10.Choice2": (formData) => formData.disclosures?.financialStatements?.balanceSheetAttached === false || formData.disclosures?.financialStatements?.incomeStatementAttached === false ? "1" : "0",
  "Group_App12.Choice1": (formData) => formData.disclosures?.reserveStudy?.type === "current" ? "1" : "0",
  "Group_App12.Choice2": (formData) => formData.disclosures?.reserveStudy?.type === "summary" ? "1" : "0",
  "Group_App12.Choice3": (formData) => formData.disclosures?.reserveStudy?.type !== "current" && formData.disclosures?.reserveStudy?.type !== "summary" ? "1" : "0",
  "unsatisfied judgements against the association or pending action(": (formData) => formData.disclosures?.legalIssues?.details || "",
  "Group_App13.Choice1": (formData) => formData.disclosures?.legalIssues?.hasIssues === true ? "1" : "0",
  "Group_App13.Choice2": (formData) => formData.disclosures?.legalIssues?.hasIssues === false ? "1" : "0",
  // "Insurance coverage provided by the association..." - Now a checkbox named cb_provided
  "cb_provided": (formData) => {
    const associationProvides = formData.disclosures?.insurance?.associationProvides;
    const result = associationProvides === true ? "True" : "False";
    console.log('[cb_provided] Mapping function called (Appendix 14 - Association provides insurance checkbox):');
    console.log('  - associationProvides value:', associationProvides);
    console.log('  - final result:', result);
    return result;
  },
  // Keep Group_App14.Choice1 for backward compatibility (in case old template is used)
  "Group_App14.Choice1": (formData) => {
    const associationProvides = formData.disclosures?.insurance?.associationProvides;
    const result = associationProvides === true ? "1" : "0";
    console.log('[Group_App14.Choice1] Mapping function called (backward compatibility):');
    return result;
  },
  "Group_App14.Choice2": (formData) => {
    // "Any other insurance coverage recommended or required..." checkbox
    // Should be checked when recommendsOwnerCoverage is true (regardless of ownerRequirements value)
    const recommendsOwnerCoverage = formData.disclosures?.insurance?.recommendsOwnerCoverage;
    const result = recommendsOwnerCoverage === true ? "1" : "0";
    console.log('[Group_App14.Choice2] Mapping function called (Appendix 14 - Recommends owner coverage):');
    console.log('  - recommendsOwnerCoverage value:', recommendsOwnerCoverage);
    console.log('  - ownerRequirements value:', formData.disclosures?.insurance?.ownerRequirements);
    console.log('  - final result:', result);
    return result;
  },
  "Group_App14.Choice3": (formData) => {
    const associationProvides = formData.disclosures?.insurance?.associationProvides;
    const recommendsOwnerCoverage = formData.disclosures?.insurance?.recommendsOwnerCoverage;
    const result = (associationProvides !== true && recommendsOwnerCoverage !== true) ? "1" : "0";
    console.log('[Group_App14.Choice3] Mapping function called (Appendix 14 - Not applicable):');
    console.log('  - associationProvides:', associationProvides);
    console.log('  - recommendsOwnerCoverage:', recommendsOwnerCoverage);
    console.log('  - final result:', result);
    return result;
  },
  "Article/Section-14": (formData) => {
    // Show owner requirements only if recommendsOwnerCoverage is true
    // Clear the field when "does not recommend" is selected
    if (formData.disclosures?.insurance?.recommendsOwnerCoverage === true) {
      const ownerRequirements = formData.disclosures?.insurance?.ownerRequirements || "";
      console.log('[Article/Section-14] Mapping function called:');
      console.log('  - recommendsOwnerCoverage:', true);
      console.log('  - ownerRequirements value:', ownerRequirements);
      console.log('  - final result:', ownerRequirements);
      return ownerRequirements;
    }
    console.log('[Article/Section-14] Mapping function called - clearing field (does not recommend)');
    return ""; // Clear field when "does not recommend" is selected
  },
  "Group_App15.Choice1": (formData) => formData.disclosures?.associationViolations?.hasNotices === true ? "1" : "0",
  "Group_App15.Choice2": (formData) => formData.disclosures?.associationViolations?.hasNotices === false ? "1" : "0",
  "Group_App16.Choice1": (formData) => formData.disclosures?.governmentViolations?.hasNotices === true ? "1" : "0",
  "Group_App16.Choice2": (formData) => formData.disclosures?.governmentViolations?.hasNotices === false ? "1" : "0",
  "Group_App17.Choice1": (formData) => formData.disclosures?.boardMinutes?.attached === true ? "1" : "0",
  "Group_App17.Choice2": (formData) => formData.disclosures?.boardMinutes?.attached === false ? "1" : "0",
  "Group_App18.Choice1": (formData) => formData.disclosures?.associationMinutes?.attached === true ? "1" : "0",
  "Group_App18.Choice2": (formData) => formData.disclosures?.associationMinutes?.attached === false ? "1" : "0",
  "Group_App19.Choice1": (formData) => formData.disclosures?.leaseholdEstates?.exists === true ? "1" : "0",
  "Group_App19.Choice2": (formData) => {
    // "The remaining term of the leasehold estate..." checkbox
    // Should be checked only when exists is true AND remainingTerm has a value
    const exists = formData.disclosures?.leaseholdEstates?.exists === true;
    const hasRemainingTerm = (formData.disclosures?.leaseholdEstates?.remainingTerm || "").trim() !== "";
    return (exists && hasRemainingTerm) ? "1" : "0";
  },
  "Group_App19.Choice3": (formData) => {
    // "Not applicable" checkbox
    // Should be checked when exists is false
    return formData.disclosures?.leaseholdEstates?.exists === false ? "1" : "0";
  },
  "App-19": (formData) => {
    // Text field for remaining term
    // Only show if exists is true, otherwise clear
    if (formData.disclosures?.leaseholdEstates?.exists === true) {
      return formData.disclosures?.leaseholdEstates?.remainingTerm || "";
    }
    return ""; // Clear field when "is not" is selected
  },
  "Group_App20-1.Choice1": (formData) => formData.disclosures?.occupancyLimitations?.hasLimitations === true ? "1" : "0",
  "Group_App20-1.Choice2": (formData) => formData.disclosures?.occupancyLimitations?.hasLimitations === false ? "1" : "0",
  "Article20-01": (formData) => formData.disclosures?.occupancyLimitations?.articleSection || "",
  "Article20-02": (formData) => formData.disclosures?.occupancyLimitations?.documentReference || "",
  "Group_App21.Choice1": (formData) => formData.disclosures?.flagRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App21.Choice2": (formData) => formData.disclosures?.flagRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article21-01": (formData) => formData.disclosures?.flagRestrictions?.articleSection || "",
  "Article21-02": (formData) => formData.disclosures?.flagRestrictions?.documentReference || "",
  "Group_App22.Choice1": (formData) => formData.disclosures?.solarRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App22.Choice2": (formData) => formData.disclosures?.solarRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article22-01": (formData) => formData.disclosures?.solarRestrictions?.articleSection || "",
  "Article22-02": (formData) => formData.disclosures?.solarRestrictions?.documentReference || "",
  "Group_App23.Choice1": (formData) => formData.disclosures?.signRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App23.Choice2": (formData) => formData.disclosures?.signRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article-23_01": (formData) => formData.disclosures?.signRestrictions?.articleSection || "",
  "Article-23-02": (formData) => formData.disclosures?.signRestrictions?.documentReference || "",
  "Group_App24.Choice1": (formData) => formData.disclosures?.parkingRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App24.Choice2": (formData) => formData.disclosures?.parkingRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article-24-01": (formData) => formData.disclosures?.parkingRestrictions?.articleSection || "",
  "Article-24-02": (formData) => formData.disclosures?.parkingRestrictions?.documentReference || "",
  "Group_App25.Choice1": (formData) => formData.disclosures?.businessRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App25.Choice2": (formData) => formData.disclosures?.businessRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article25-01": (formData) => formData.disclosures?.businessRestrictions?.articleSection || "",
  "Article25-02": (formData) => formData.disclosures?.businessRestrictions?.documentReference || "",
  "Group_App26.Choice1": (formData) => formData.disclosures?.rentalRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group_App26.Choice2": (formData) => formData.disclosures?.rentalRestrictions?.hasRestrictions === false ? "1" : "0",
  "Article26-01": (formData) => formData.disclosures?.rentalRestrictions?.articleSection || "",
  "Article26-02": (formData) => formData.disclosures?.rentalRestrictions?.documentReference || "",
  "Group_App27.Choice1": (formData) => formData.disclosures?.taxDeductibility?.statementAttached === true ? "1" : "0",
  "Group_App27.Choice2": (formData) => formData.disclosures?.taxDeductibility?.statementAttached === false ? "1" : "0",
  "Group_App28.Choice1": (formData) => formData.disclosures?.pendingSales?.hasPending === true ? "1" : "0",
  "Group_App28.Choice2": (formData) => formData.disclosures?.pendingSales?.hasPending === false ? "1" : "0",
  "Check Box-App30": (formData) => isTruthy(formData.disclosures?.cicCertification?.reportFiled) ? "1" : "0",
  "Association Filing No": (formData) => formData.disclosures?.cicCertification?.registrationNumber || "",
  "Filing Expiration Date": (formData) => {
    if (!formData.disclosures?.cicCertification?.expirationDate) return "";
    const date = new Date(
      formData.disclosures.cicCertification.expirationDate
    );
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }
};

// Function to map form data to PDF fields with performance optimizations
function mapFormDataToPDFFields(formData, timezone) {
  // Default timezone if not provided
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // Safely access disclosures with proper null checks
  const disclosures = formData?.disclosures || {};
  const entities = disclosures?.otherEntity?.entities || [];
  const agencies = disclosures?.mortgageApprovals?.approvedAgencies || [];
  const coverageDetails = disclosures?.insurance?.coverageDetails || [];
  const designatedProjects = disclosures?.reserves?.designatedProjects || [];

  // Pre-compile regex patterns for better performance
  const patterns = {
    entityFacilityName: /^EntityFacility NameRow(\d+)$/,
    amountDue: /^Amount DueRow(\d+)$/,
    specificProject: /^Specific ProjectRow(\d+)$/,
    amountDesignated: /^Amount DesignatedRow(\d+)$/,
    insuranceDescription: /^insurance_Description0(\d+)$/,
    textApp14: /^Text-App14-0(\d+)$/,
    groupApp14: /^Group_App14-(\d+)$/,
    groupApp14Choice: /^Group_App14-(\d+)\.Choice([12])$/,
    secondaryMortgage: /^Secondary Mortgage Market Agency-0(\d+)$/
  };

  // Add new Appendix 14 checkbox fields dynamically (they may not be in fields.js yet)
  const newApp14Fields = [
    'cb_provided',
    'cb_ci1', 'cb_ci2', 'cb_ci3',
    'cb_sa1', 'cb_sa2', 'cb_sa3'
  ];
  
  // Create field objects for the new checkboxes
  const dynamicFields = newApp14Fields.map(fieldName => ({
    fieldName: fieldName,
    type: 'checkbox'
  }));
  
  // Combine original fields with dynamic fields
  const allFields = [...fields, ...dynamicFields];
  
  // Filter fields to only process those that have data or are required
  // IMPORTANT: Include ALL checkbox and choice fields so they can be properly set (checked/unchecked)
  const relevantFields = allFields.filter(field => {
    const fieldName = field.fieldName;
    
    // Always include fields that have direct mappings
    if (FIELD_TO_FORMDATA[fieldName]) return true;
    
    // ALWAYS include checkbox fields (need to set checked/unchecked state)
    if (fieldName.startsWith("Check Box")) return true;
    
    // ALWAYS include the new checkbox fields for Appendix 14
    if (fieldName === 'cb_provided' || fieldName.startsWith('cb_ci') || fieldName.startsWith('cb_sa')) return true;
    
    // ALWAYS include Group Choice fields (these are checkbox or radio fields that need to be set)
    if (fieldName.includes("Choice") && fieldName.includes("Group")) return true;
    if (fieldName.includes("Group") && fieldName.includes("Choice")) return true;
    
    // Include dynamic fields that might have data
    if (patterns.entityFacilityName.test(fieldName) && entities.length > 0) return true;
    if (patterns.amountDue.test(fieldName) && entities.length > 0) return true;
    if (patterns.specificProject.test(fieldName) && designatedProjects.length > 0) return true;
    if (patterns.amountDesignated.test(fieldName) && designatedProjects.length > 0) return true;
    if (patterns.insuranceDescription.test(fieldName) && coverageDetails.length > 0) return true;
    if (patterns.textApp14.test(fieldName) && coverageDetails.length > 0) return true;
    if (patterns.groupApp14.test(fieldName) && coverageDetails.length > 0) return true;
    if (patterns.groupApp14Choice.test(fieldName) && coverageDetails.length > 0) return true;
    if (patterns.secondaryMortgage.test(fieldName) && agencies.length > 0) return true;
    
    // Include specific checkbox fields
    if (fieldName.startsWith("Check Box-App29-") || fieldName.startsWith("Check Box_App29-")) return true;
    
    return false;
  });

  // Use map with early returns for better performance
  const updatedFields = relevantFields.map((field) => {
    const fieldName = field.fieldName;
    let match;

    // 1. Dynamic mapping for EntityFacility NameRowN
    // Combine name and amount in format "Name - Amount"
    if ((match = fieldName.match(patterns.entityFacilityName))) {
      const idx = parseInt(match[1], 10) - 1;
      // Only show entity name if isLiable is true, otherwise clear the field
      if (disclosures?.otherEntity?.isLiable === true) {
        const nameValue = entities[idx]?.name || "";
        const amountValue = entities[idx]?.amountDue || "";
        
        // Combine name and amount in format "Name - $Amount"
        let combinedValue = nameValue;
        if (amountValue && amountValue.trim() !== "") {
          // Remove $ sign if present (it might be in the form data), then add it back
          const cleanAmount = amountValue.replace(/^\$/, "").trim();
          combinedValue = `${nameValue} - $${cleanAmount}`;
        }
        
        console.log(`[EntityFacility NameRow${match[1]}] Mapping function called (Appendix 6):`);
        console.log(`  - Field name: ${fieldName}`);
        console.log(`  - Array index: ${idx}`);
        console.log(`  - Entity at index:`, entities[idx]);
        console.log(`  - name value: "${nameValue}"`);
        console.log(`  - amountDue value: "${amountValue}"`);
        console.log(`  - combined value: "${combinedValue}"`);
        return { ...field, text: combinedValue };
      }
      return { ...field, text: "" }; // Clear field when "Not Applicable" is selected
    }

    // 2. Dynamic mapping for Amount DueRowN
    if ((match = fieldName.match(patterns.amountDue))) {
      const idx = parseInt(match[1], 10) - 1;
      // Only show amount due if isLiable is true, otherwise clear the field
      if (disclosures?.otherEntity?.isLiable === true) {
        const amountValue = entities[idx]?.amountDue || "";
        console.log(`[Amount DueRow${match[1]}] Mapping function called (Appendix 6):`);
        console.log(`  - Field name: ${fieldName}`);
        console.log(`  - Array index: ${idx}`);
        console.log(`  - Entity at index:`, entities[idx]);
        console.log(`  - amountDue value: "${amountValue}"`);
        console.log(`  - isLiable: ${disclosures?.otherEntity?.isLiable}`);
        return { ...field, text: amountValue };
      }
      console.log(`[Amount DueRow${match[1]}] Clearing field (isLiable is false)`);
      return { ...field, text: "" }; // Clear field when "Not Applicable" is selected
    }

    // 3. Dynamic mapping for Specific ProjectRowN
    if ((match = fieldName.match(patterns.specificProject))) {
      const idx = parseInt(match[1], 10) - 1;
      return { ...field, text: designatedProjects[idx]?.project || "" };
    }

    // 4. Dynamic mapping for Amount DesignatedRowN
    if ((match = fieldName.match(patterns.amountDesignated))) {
      const idx = parseInt(match[1], 10) - 1;
      return { ...field, text: designatedProjects[idx]?.amount || "" };
    }

    // 5. Insurance description mapping
    if ((match = fieldName.match(patterns.insuranceDescription))) {
      const idx = parseInt(match[1], 10) - 1; // Subtract 1 because field names are 01, 02, 03 but array is 0-indexed
      const description = idx >= 0 && idx < coverageDetails.length ? coverageDetails[idx]?.description || "" : "";
      console.log(`[Insurance Description] Field: ${fieldName}, Array index: ${idx}, Description: "${description}"`);
      return { ...field, text: description };
    }

    // 6. Dynamic mapping for Text-App14-0N
    if ((match = fieldName.match(patterns.textApp14))) {
      const idx = parseInt(match[1], 10) - 1; // Subtract 1 because field names are 01, 02, 03 but array is 0-indexed
      const articleSection = idx >= 0 && idx < coverageDetails.length ? coverageDetails[idx]?.articleSection || "" : "";
      console.log(`[Text-App14] Field: ${fieldName}, Array index: ${idx}, ArticleSection: "${articleSection}"`);
      return { ...field, text: articleSection };
    }

    // 7. Dynamic mapping for Group_App14-N (radio/choice)
    if ((match = fieldName.match(patterns.groupApp14))) {
      const idx = parseInt(match[1], 10);
      const val = coverageDetails[idx - 2]?.certificateAttached;
      // This appears to be a checkbox field group
      const boolValue = typeof val !== "undefined" ? val === true : false;
      return { ...field, value: boolValue };
    }

    // 8. Certificate of Insurance checkboxes (cb_ci1, cb_ci2, cb_ci3)
    // These are now separate checkboxes, not part of Group_App14-N.Choice1
    if (fieldName === 'cb_ci1' || fieldName === 'cb_ci2' || fieldName === 'cb_ci3') {
      const associationProvides = formData.disclosures?.insurance?.associationProvides;
      if (associationProvides !== true) {
        // If "does not provide" is selected, uncheck all checkboxes
        console.log(`[cb_ci] Field: ${fieldName}, Association does not provide - unchecking checkbox`);
        return { ...field, value: false };
      }
      
      // Extract index from field name: cb_ci1 -> 0, cb_ci2 -> 1, cb_ci3 -> 2
      const idx = parseInt(fieldName.replace('cb_ci', ''), 10) - 1;
      
      if (idx >= 0 && idx < coverageDetails.length) {
        const coverage = coverageDetails[idx];
        const isAttached = coverage?.certificateAttached === true;
        console.log(`[cb_ci] Field: ${fieldName}, Array index: ${idx}, Certificate attached: ${isAttached}`);
        return { ...field, value: isAttached };
      }
      console.log(`[cb_ci] Field: ${fieldName}, No coverage found at index ${idx} - returning false`);
      return { ...field, value: false };
    }
    
    // 9. See Article/Section checkboxes (cb_sa1, cb_sa2, cb_sa3)
    // These are now separate checkboxes, not part of Group_App14-N.Choice2
    // Checkbox should be checked if articleSection has a value
    if (fieldName === 'cb_sa1' || fieldName === 'cb_sa2' || fieldName === 'cb_sa3') {
      const associationProvides = formData.disclosures?.insurance?.associationProvides;
      if (associationProvides !== true) {
        // If "does not provide" is selected, uncheck all checkboxes
        console.log(`[cb_sa] Field: ${fieldName}, Association does not provide - unchecking checkbox`);
        return { ...field, value: false };
      }
      
      // Extract index from field name: cb_sa1 -> 0, cb_sa2 -> 1, cb_sa3 -> 2
      const idx = parseInt(fieldName.replace('cb_sa', ''), 10) - 1;
      
      console.log(`[cb_sa] Processing field: ${fieldName}, Calculated index: ${idx}, Coverage details length: ${coverageDetails.length}`);
      
      if (idx >= 0 && idx < coverageDetails.length) {
        const coverage = coverageDetails[idx];
        const articleSectionValue = coverage?.articleSection || "";
        const trimmedValue = articleSectionValue.trim();
        const shouldCheck = trimmedValue !== "";
        
        console.log(`[cb_sa] Field: ${fieldName}, Array index: ${idx}`);
        console.log(`  - Coverage object:`, JSON.stringify(coverage, null, 2));
        console.log(`  - articleSection raw value: "${articleSectionValue}" (type: ${typeof articleSectionValue})`);
        console.log(`  - trimmed value: "${trimmedValue}"`);
        console.log(`  - shouldCheck: ${shouldCheck}`);
        console.log(`  - Returning value: ${Boolean(shouldCheck)}`);
        
        return { ...field, value: Boolean(shouldCheck) };
      }
      
      // If no coverage found at that index, check if there's any coverage at all
      console.log(`[cb_sa] Field: ${fieldName}, No coverage found at index ${idx}`);
      console.log(`  - Coverage details array:`, JSON.stringify(coverageDetails, null, 2));
      console.log(`  - Returning false`);
      return { ...field, value: false };
    }
    
    // 10. Group_App14 choice mapping (for backward compatibility with old template)
    // Field names are Group_App14-2, Group_App14-3, Group_App14-4 (for rows 1, 2, 3)
    // Array indices are 0, 1, 2, so we need to subtract 2 from the field number
    // Only show checkboxes if associationProvides is true, otherwise uncheck all
    if ((match = fieldName.match(patterns.groupApp14Choice))) {
      const associationProvides = formData.disclosures?.insurance?.associationProvides;
      if (associationProvides !== true) {
        // If "does not provide" is selected, uncheck all checkboxes
        console.log(`[Group_App14 Choice] Field: ${fieldName}, Association does not provide - unchecking checkbox`);
        return { ...field, value: false };
      }
      
      const fieldNum = parseInt(match[1], 10); // 2, 3, 4, etc.
      const idx = fieldNum - 2; // Convert to 0-indexed: 2→0, 3→1, 4→2
      const choice = match[2];
      
      console.log(`[Group_App14 Choice] Field: ${fieldName}, Field number: ${fieldNum}, Array index: ${idx}, Coverage details length: ${coverageDetails.length}`);
      
      if (idx >= 0 && idx < coverageDetails.length) {
        const coverage = coverageDetails[idx];
        const isAttached = coverage?.certificateAttached === true;
        const hasArticleSection = (coverage?.articleSection || "").trim() !== "";
        
        console.log(`[Group_App14 Choice] Coverage found at index ${idx}:`, {
          certificateAttached: coverage?.certificateAttached,
          articleSection: coverage?.articleSection,
          description: coverage?.description
        });
        
        // Choice1 = "Certificate of Insurance attached" checkbox
        // Choice2 = "See Article/Section" checkbox (should only be checked if articleSection has a value)
        if (choice === "1") {
          console.log(`[Group_App14 Choice] Choice1 - Certificate attached: ${isAttached}`);
          return { ...field, value: isAttached };
        } else if (choice === "2") {
          // Only check "See Article/Section" checkbox if articleSection has a non-empty value
          const articleSectionValue = coverage?.articleSection || "";
          const trimmedValue = articleSectionValue.trim();
          const shouldCheck = trimmedValue !== "";
          
          console.log(`[Group_App14 Choice] Choice2 - "See Article/Section" checkbox:`);
          console.log(`  - Raw articleSection value: "${articleSectionValue}"`);
          console.log(`  - Trimmed value: "${trimmedValue}"`);
          console.log(`  - Should check checkbox: ${shouldCheck}`);
          
          return { ...field, value: Boolean(shouldCheck) };
        }
      }
      console.log(`[Group_App14 Choice] No coverage found at index ${idx} - returning false`);
      return { ...field, value: false };
    }

    // 11. Secondary mortgage market agency mapping
    if ((match = fieldName.match(patterns.secondaryMortgage))) {
      const idx = parseInt(match[1], 10) - 1;
      return { ...field, text: agencies[idx] || "" };
    }

    // 10. Specific checkbox mappings (optimized)
    if (fieldName === "Check Box-App29-02") return { ...field, value: !!agencies[0] };
    if (fieldName === "Check Box_App29-03") return { ...field, value: !!agencies[1] };
    if (fieldName === "Check Box_App29-04") return { ...field, value: !!agencies[2] };
    if (fieldName === "Check Box-App29-05") return { ...field, value: !!agencies[3] };

    // 11. Your existing FIELD_TO_FORMDATA mapping logic
    const mapper = FIELD_TO_FORMDATA[fieldName];
    
    // Check if this is a checkbox field (starts with "Check Box")
    const isCheckboxField = fieldName.startsWith("Check Box");
    
    // Check if this is a Group Choice field (radio button option)
    const isGroupChoiceField = fieldName.includes("Choice") && fieldName.includes("Group");
    
    if (typeof mapper === "function") {
      try {
        const mappedValue = mapper(formData, tz);
        
        if (isCheckboxField) {
          // For checkboxes, set value property (boolean)
          const boolValue = mappedValue === "True" || mappedValue === true || mappedValue === "1";
          
          // Debug logging for Check Box11 specifically
          if (fieldName === 'Check Box11.') {
            console.log(`[PDF Field Mapper] Check Box11. field mapping:`);
            console.log(`  - mappedValue:`, mappedValue, `(type: ${typeof mappedValue})`);
            console.log(`  - boolValue calculated:`, boolValue);
            console.log(`  - Returning field with value:`, boolValue);
          }
          
          return { ...field, value: boolValue };
        } else if (isGroupChoiceField) {
          // For Group Choice fields, these are likely individual checkboxes for "is/is not" options
          // Set value based on whether this choice matches the data
          const boolValue = mappedValue === "1" || mappedValue === "True" || mappedValue === true;
          return { ...field, value: boolValue, text: mappedValue != null ? String(mappedValue) : "" };
        } else {
          // For text fields, use text property
          const text = mappedValue != null ? String(mappedValue) : "";
          return { ...field, text };
        }
      } catch (error) {
        return isCheckboxField || isGroupChoiceField 
          ? { ...field, value: false } 
          : { ...field, text: "" };
      }
    } else if (typeof mapper === "string") {
      const text = formData[mapper] != null ? String(formData[mapper]) : "";
      return { ...field, text };
    }

    // Default: return field as-is if no mapper found
    // BUT: For checkbox/choice fields, explicitly set value to false if no data
    // Note: isCheckboxField and isGroupChoiceField are already declared above
    if (isCheckboxField || isGroupChoiceField) {
      // Explicitly set to false if no mapper found
      return { ...field, value: false };
    }
    
    return field;
  });

  return updatedFields;
}

module.exports = {
  mapFormDataToPDFFields,
  FIELD_TO_FORMDATA
};

