const {
  createClientComponentClient,
} = require("@supabase/auth-helpers-nextjs");
const crypto = require("crypto");

const { fields } = require("./fields");

const FIELD_TO_FORMDATA = {
  "Name of Development": "developmentName",
  "Location of Development CountyCity": "developmentLocation",
  "Association Name": "associationName",
  "Association Address": "associationAddress",
  "Lot Address Number or Reference": "lotAddress",


  "Name": (formData) => formData.preparer.name,
  "Company":  (formData) => formData.preparer.company,
  "ng Address 1": (formData) => formData.preparer.address,
  "Phone Number": (formData) => formData.preparer.phone,
  "Managing Agent_Name": (formData) => formData.managingAgent.name,
  "Managing Agent_Company": (formData) => formData.managingAgent.company,
  "Managing Agent - CIC Manager Lic No": (formData) => formData.managingAgent.licenseNumber,
  "Managing Agent - Address1": (formData) => formData.managingAgent.address,
  "Managing Agent - Phone Number": (formData) => formData.managingAgent.phone,
  "Managing Agent - Email": (formData) => formData.managingAgent.email,
  "Assessment Amount": (formData) => `$${Number(formData.salePrice).toLocaleString()}`,
  "Due Date": (formData) => new Date(formData.closingDate).toLocaleDateString(),
  "Email": (formData) => formData.preparer.email,

  "Date Prepared": (formData) => new Date().toLocaleDateString(),
  "Check Box1": (formData) =>
    formData.disclosures.contactInfoAttached === true ? "True" : "False",
  "Check Box2": (formData) =>
    formData.disclosures.governingDocsAttached === true ? "True" : "False",
  "Check Box4": (formData) =>
    formData.disclosures.assessmentSchedule?.hasAssessments === true
      ? "True"
      : "False",
  "Check Box30": (formData) =>
    formData.disclosures.cicCertification?.reportFiled === true
      ? "True"
      : "False",
  "Check Box_APP6": (formData) =>
    formData.disclosures.governingDocsAttached === true ? "True" : "False",
  "Check Box_App29": (formData) =>
    formData.disclosures.rulesRegulationsAttached === true ? "True" : "False",
  "Check Box11.": (formData) =>
    formData.disclosures.operatingBudget?.budgetAttached === true
      ? "True"
      : "False",
  "Check BoxApp_02.2": (formData) =>
    formData.disclosures.rulesRegulationsAttached === true ? "True" : "False",
  "Check Box_App12_01": (formData) =>
    formData.disclosures.governingDocsAttached === true ? "True" : "False",
  "Group3.Choice1": (formData) =>
    formData.disclosures.restraintsExist === true ? "1" : "0",
  "Group3.Choice2": (formData) =>
    formData.disclosures.restraintsExist === false ? "1" : "0",
  "Group5.Choice1": (formData) =>
    formData.disclosures.fees?.hasOtherFees === true ? "1" : "0",
  "Group5.Choice2": (formData) =>
    formData.disclosures.fees?.hasOtherFees === false ? "1" : "0",
  "Group6.Choice1": (formData) =>
    formData.disclosures.otherEntity?.isLiable === true ? "1" : "0",
  "Group6.Choice2": (formData) =>
    formData.disclosures.otherEntity?.isLiable === false ? "1" : "0",
  "Group7.Choice1": (formData) =>
    formData.disclosures.specialAssessments?.hasApproved === true
      ? "1"
      : "0",
  "Group7.Choice2": (formData) =>
    formData.disclosures.specialAssessments?.hasApproved === false
      ? "1"
      : "0",
  "Group8.Choice1": (formData) =>
    formData.disclosures.capitalExpenditures?.hasApproved === true
      ? "1"
      : "0",
  "Group8.Choice2": (formData) =>
    formData.disclosures.capitalExpenditures?.hasApproved === false
      ? "1"
      : "0",
  "Group9.1.Choice1": (formData) =>
    formData.disclosures.reserves?.hasReserves === true ? "1" : "0",
  "Group9.1.Choice2": (formData) =>
    formData.disclosures.reserves?.hasReserves === false ? "1" : "0",
  "Group9.2.Choice1": (formData) =>
    formData.disclosures.reserves?.hasDesignated === true ? "1" : "0",
  "Group9.2.Choice2": (formData) =>
    formData.disclosures.reserves?.hasDesignated === false ? "1" : "0",
  "Group10.1.Choice1": (formData) =>
    formData.disclosures.financialStatements?.balanceSheetAttached === true
      ? "1"
      : "0",
  "Group10.1.Choice2": (formData) =>
    formData.disclosures.financialStatements?.balanceSheetAttached === false
      ? "1"
      : "0",
  "Group10.2.Choice1": (formData) =>
    formData.disclosures.financialStatements?.incomeStatementAttached === true
      ? "1"
      : "0",
  "Group10.2.Choice2": (formData) =>
    formData.disclosures.financialStatements?.incomeStatementAttached === false
      ? "1"
      : "0",

  "Group11.1.Choice1": (formData) =>
    formData.disclosures.reserves?.hasReserves === true ? "1" : "0",
  "Group11.1.Choice2": (formData) =>
    formData.disclosures.reserves?.hasReserves === false ? "1" : "0",

  "Group12.Choice1": (formData) =>
    formData.disclosures.reserveStudy.type === "current" ? "1" : "0",
  "Group12.Choice2": (formData) =>
    formData.disclosures.reserveStudy.type === "summary" ? "1" : "0",

  "Group13.Choice1": (formData) =>
    formData.disclosures.legalIssues?.hasIssues === true ? "1" : "0",
  "Group13.Choice2": (formData) =>
    formData.disclosures.legalIssues?.hasIssues === false ? "1" : "0",
  "Group14.1.Choice1": (formData) =>
    formData.disclosures.insurance?.associationProvides === true
      ? "1"
      : "0",
  "Group14.1.Choice2": (formData) =>
    formData.disclosures.insurance?.associationProvides === false
      ? "1"
      : "0",
  "Group14.2.Choice1": (formData) =>
    formData.disclosures.insurance?.recommendsOwnerCoverage === true
      ? "1"
      : "0",
  "Group14.2.Choice2": (formData) =>
    formData.disclosures.insurance?.recommendsOwnerCoverage === false
      ? "1"
      : "0",
  "Group15.Choice1": (formData) =>
    formData.disclosures.associationViolations?.hasNotices === true
      ? "1"
      : "0",
  "Group15.Choice2": (formData) =>
    formData.disclosures.associationViolations?.hasNotices === false
      ? "1"
      : "0",
  "Group16.Choice1": (formData) =>
    formData.disclosures.governmentViolations?.hasNotices === true
      ? "1"
      : "0",
  "Group16.Choice2": (formData) =>
    formData.disclosures.governmentViolations?.hasNotices === false
      ? "1"
      : "0",   
  "Group17.Choice1": (formData) =>
    formData.disclosures.boardMinutes.attached === true ? "1" : "0",
  "Group17.Choice2": (formData) =>
    formData.disclosures.boardMinutes.attached === false ? "1" : "0",
  "Group18.Choice1": (formData) =>
    formData.disclosures.associationMinutes.attached === true ? "1" : "0",
  "Group18.Choice2": (formData) =>
    formData.disclosures.associationMinutes.attached === false ? "1" : "0",
  "Group19.Choice1": (formData) =>
    formData.disclosures.leaseholdEstates?.exists === true ? "1" : "0",
  "Group19.Choice2": (formData) =>
    formData.disclosures.leaseholdEstates?.exists === false ? "1" : "0",
  "Group20.Choice1": (formData) =>
    formData.disclosures.occupancyLimitations.hasLimitations === true ? "1" : "0",
  "Group20.Choice2": (formData) =>  
    formData.disclosures.occupancyLimitations.hasLimitations === false ? "1" : "0",
  "Group21.Choice1": (formData) =>
    formData.disclosures.flagRestrictions.hasRestrictions === true ? "1" : "0",
  "Group21.Choice2": (formData) =>
    formData.disclosures.flagRestrictions.hasRestrictions === false ? "1" : "0",
  "Group22.Choice1": (formData) =>
    formData.disclosures.solarRestrictions.hasRestrictions === true ? "1" : "0",
  "Group22.Choice2": (formData) =>
    formData.disclosures.solarRestrictions.hasRestrictions === false ? "1" : "0",
  "Group23.Choice1": (formData) =>
    formData.disclosures.signRestrictions.hasRestrictions === true ? "1" : "0",
  "Group23.Choice2": (formData) =>
    formData.disclosures.signRestrictions.hasRestrictions === false ? "1" : "0", 
  "Group24.Choice1": (formData) =>
    formData.disclosures.parkingRestrictions.hasRestrictions  === true ? "1" : "0",
  "Group24.Choice2": (formData) =>
    formData.disclosures.parkingRestrictions.hasRestrictions  === false ? "1" : "0",
  "Group25.Choice1": (formData) =>
    formData.disclosures.businessRestrictions.hasRestrictions === true ? "1" : "0",
  "Group25.Choice2": (formData) =>
    formData.disclosures.businessRestrictions.hasRestrictions === false ? "1" : "0",
  "Group26.Choice1": (formData) =>
    formData.disclosures.rentalRestrictions?.hasRestrictions === true ? "1" : "0",
  "Group26.Choice2": (formData) =>
    formData.disclosures.rentalRestrictions?.hasRestrictions === false ? "1" : "0",
  "Group27.Choice1": (formData) => 
    formData.disclosures.taxDeductibility.statementAttached === true ? "1" : "0",
  "Group27.Choice2": (formData) =>
    formData.disclosures.taxDeductibility.statementAttached === false ? "1" : "0",
  "Group28.Choice1": (formData) =>
    formData.disclosures.pendingSales?.hasPending === true ? "1" : "0",
  "Group28.Choice2": (formData) =>
    formData.disclosures.pendingSales?.hasPending === false ? "1" : "0",
  "Group29.Choice1": (formData) =>
    formData.disclosures.mortgageApprovals?.hasApprovals === true ? "1" : "0",
  "Group29.Choice2": (formData) =>
    formData.disclosures.mortgageApprovals?.hasApprovals === false ? "1" : "0",

  "Check Box_APP01 - Not applicable": (formData) =>
    formData.managingAgent?.exists === false ? "True" : "False",

  "Article/Section_Section3": (formData) => {
    if (formData.disclosures.restraintsArticleSection || formData.disclosures.restraintsDescription) {
      const articleSection = formData.disclosures.restraintsArticleSection || "";
      const description = formData.disclosures.restraintsDescription || "";
      return `${articleSection} : ${description}`.trim();
    }
  },

  "Monthly": (formData) => formData.disclosures.assessmentSchedule.monthlyAmount,
  "Quarterly": (formData) => formData.disclosures.assessmentSchedule.quarterlyAmount,
  "Interval": (formData) => formData.disclosures.assessmentSchedule.periodicInterval,
  "n the amount of": (formData) => formData.disclosures.assessmentSchedule.periodicAmount,
  "Current assessment due": (formData) => formData.disclosures.assessmentSchedule.currentAssessmentDueDate,
  "Current Assessment": (formData) => formData.disclosures.assessmentSchedule.currentAssessmentDue,
  "UnpaidAssessment": (formData) => formData.disclosures.assessmentSchedule.unpaidAssessments,
  "Assessment Amount": (formData) => formData.disclosures.assessmentSchedule.transferAssessmentAmount,
  "Other fees due": (formData) => formData.disclosures.fees.otherFeesDescription,
  "Description": (formData) => formData.disclosures.fees.unpaidFeesDescription,
  "Unpaid Fees": (formData) => formData.disclosures.fees.unpaidFeesAmount,
  "Other Fees Due": (formData) => formData.disclosures.fees.otherFeesAmount,
  "Group_App3.Choice1": (formData) => formData.disclosures.restraintsExist === true ? "1" : "0",
  "Group_App3.Choice2": (formData) => formData.disclosures.restraintsExist === false ? "1" : "0",
  "Group_Appx4.1.Choice1": (formData) => formData.disclosures.assessmentSchedule.hasAssessments === true ? "1" : "0",
  "Group_Appx4.1.Choice2": (formData) => formData.disclosures.assessmentSchedule.hasTransferAssessment === true ? "1" : "0",
  "Group_Appx4.2.Choice1": (formData) => formData.disclosures.assessmentSchedule.monthly === true ? "1" : "0",
  "Group_Appx4.2.Choice2": (formData) => formData.disclosures.assessmentSchedule.quarterly === true ? "1" : "0",
  "Group_Appx4.2.Choice3": (formData) => formData.disclosures.assessmentSchedule.periodic === true ? "1" : "0",
  "Check Box_Appx5.3": (formData) => formData.disclosures.fees?.hasOtherFees === false ? "True" : "False",
  "Check Appx5.1": (formData) => formData.disclosures.fees.otherFeesAmount !== "" ? "True" : "False",
  "Check BoxAppx5.2": (formData) => formData.disclosures.fees.unpaidFeesAmount !== "" ? "True" : "False",
  "Due Date": (formData) => formData.disclosures.specialAssessments.approvedDueDate,
  "Special Assessment": (formData) => formData.disclosures.specialAssessments.approvedAmount,
  "assessment due": (formData) => formData.disclosures.specialAssessments.unpaidAmount,
  "Capital Expenditures": (formData) => formData.disclosures.capitalExpenditures?.details,
  "Check Box_APP6": (formData) => formData.disclosures.governingDocsAttached === true ? "True" : "False",
  "Group_App7.Choice1": (formData) => formData.disclosures.specialAssessments?.approvedAmount !== "" ? "1" : "0",
  "Group_App7.Choice2": (formData) => formData.disclosures.specialAssessments?.unpaidAmount !== "" ? "1" : "0",
  "Group_App7.Choice3": (formData) => formData.disclosures.specialAssessments?.hasApproved === false ? "1" : "0",
  "Group_App8.Choice1": (formData) => formData.disclosures.reserves.hasReserves === true ? "1" : "0",
  "Group_App8.Choice2": (formData) => formData.disclosures.reserves.hasReserves === false ? "1" : "0",
  "undefined_8": (formData) => formData.disclosures.reserves.totalAmount,
  "Check Box_App9": (formData) => formData.disclosures.reserves.hasDesignated === true ? "True" : "False",
  "Check Box_App12.2": (formData) => formData.disclosures.reserveStudy.type !== "current" && formData.disclosures.reserveStudy.type !== "summary" ? "True" : "False",
  "Group_App10.Choice1": (formData) => formData.disclosures.financialStatements.balanceSheetAttached === true && formData.disclosures.financialStatements.incomeStatementAttached === true ? "1" : "0",
  "Group_App10.Choice2": (formData) => formData.disclosures.financialStatements.balanceSheetAttached === false || formData.disclosures.financialStatements.incomeStatementAttached === false ? "1" : "0",
  "Group_App12.Choice1": (formData) => formData.disclosures.reserveStudy.type === "current" ? "1" : "0",
  "Group_App12.Choice2": (formData) => formData.disclosures.reserveStudy.type === "summary" ? "1" : "0",
  "Group_App12.Choice3": (formData) => formData.disclosures.reserveStudy.type !== "current" && formData.disclosures.reserveStudy.type !== "summary" ? "1" : "0",
  "unsatisfied judgements against the association or pending action(": (formData) => formData.disclosures.legalIssues.details,
  "Group_App13.Choice1": (formData) => formData.disclosures.legalIssues.hasIssues === true ? "1" : "0",
  "Group_App13.Choice2": (formData) => formData.disclosures.legalIssues.hasIssues === false ? "1" : "0",
  "Group_App14.Choice1": (formData) => formData.disclosures.insurance.associationProvides === true ? "1" : "0",
  "Group_App14.Choice2": (formData) => formData.disclosures.insurance.recommendsOwnerCoverage === true ? "1" : "0",
  "Group_App14.Choice3": (formData) => formData.disclosures.insurance.associationProvides !== true && formData.disclosures.insurance.recommendsOwnerCoverage !== true ? "1" : "0",
  "Article/Section-14": (formData) => formData.disclosures.insurance.ownerRequirements,
  "Group_App15.Choice1": (formData) => formData.disclosures.associationViolations.hasNotices === true ? "1" : "0",
  "Group_App15.Choice2": (formData) => formData.disclosures.associationViolations.hasNotices === false ? "1" : "0",
  "Group_App16.Choice1": (formData) => formData.disclosures.governmentViolations.hasNotices === true ? "1" : "0",
  "Group_App16.Choice2": (formData) => formData.disclosures.governmentViolations.hasNotices === false ? "1" : "0",
  "Group_App17.Choice1": (formData) => formData.disclosures.boardMinutes.attached === true ? "1" : "0",
  "Group_App17.Choice2": (formData) => formData.disclosures.boardMinutes.attached === false ? "1" : "0",
  "Group_App18.Choice1": (formData) => formData.disclosures.associationMinutes.attached === true ? "1" : "0",
  "Group_App18.Choice2": (formData) => formData.disclosures.associationMinutes.attached === false ? "1" : "0",
  "Group_App19.Choice1": (formData) => formData.disclosures.leaseholdEstates.exists === true ? "1" : "0",
  "Group_App19.Choice2": (formData) => formData.disclosures.leaseholdEstates.exists === false ? "1" : "0",
  "Group_App20-1.Choice1": (formData) => formData.disclosures.occupancyLimitations.hasLimitations === true ? "1" : "0",
  "Group_App20-1.Choice2": (formData) => formData.disclosures.occupancyLimitations.hasLimitations === false ? "1" : "0",
  "Article20-01": (formData) => formData.disclosures.occupancyLimitations.articleSection,
  "Article20-02": (formData) => formData.disclosures.occupancyLimitations.documentReference,
  "Group_App21.Choice1": (formData) => formData.disclosures.flagRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App21.Choice2": (formData) => formData.disclosures.flagRestrictions.hasRestrictions === false ? "1" : "0",
  "Article21-01": (formData) => formData.disclosures.flagRestrictions.articleSection,
  "Article21-02": (formData) => formData.disclosures.flagRestrictions.documentReference,
  "Group_App22.Choice1": (formData) => formData.disclosures.solarRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App22.Choice2": (formData) => formData.disclosures.solarRestrictions.hasRestrictions === false ? "1" : "0",
  "Article22-01": (formData) => formData.disclosures.solarRestrictions.articleSection,
  "Article22-02": (formData) => formData.disclosures.solarRestrictions.documentReference,
  "Group_App23.Choice1": (formData) => formData.disclosures.signRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App23.Choice2": (formData) => formData.disclosures.signRestrictions.hasRestrictions === false ? "1" : "0",
  "Article-23_01": (formData) => formData.disclosures.signRestrictions.articleSection,
  "Article-23-02": (formData) => formData.disclosures.signRestrictions.documentReference,
  "Group_App24.Choice1": (formData) => formData.disclosures.parkingRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App24.Choice2": (formData) => formData.disclosures.parkingRestrictions.hasRestrictions === false ? "1" : "0",
  "Article-24-01": (formData) => formData.disclosures.parkingRestrictions.articleSection,
  "Article-24-02": (formData) => formData.disclosures.parkingRestrictions.documentReference,
  "Group_App25.Choice1": (formData) => formData.disclosures.businessRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App25.Choice2": (formData) => formData.disclosures.businessRestrictions.hasRestrictions === false ? "1" : "0",
  "Article25-01": (formData) => formData.disclosures.businessRestrictions.articleSection,
  "Article25-02": (formData) => formData.disclosures.businessRestrictions.documentReference,
  "Group_App26.Choice1": (formData) => formData.disclosures.rentalRestrictions.hasRestrictions === true ? "1" : "0",
  "Group_App26.Choice2": (formData) => formData.disclosures.rentalRestrictions.hasRestrictions === false ? "1" : "0",
  "Article26-01": (formData) => formData.disclosures.rentalRestrictions.articleSection,
  "Article26-02": (formData) => formData.disclosures.rentalRestrictions.documentReference,
  "Group_App27.Choice1": (formData) => formData.disclosures.taxDeductibility.statementAttached === true ? "1" : "0",
  "Group_App27.Choice2": (formData) => formData.disclosures.taxDeductibility.statementAttached === false ? "1" : "0",
  "Group_App28.Choice1": (formData) => formData.disclosures.pendingSales.hasPending === true ? "1" : "0",
  "Group_App28.Choice2": (formData) => formData.disclosures.pendingSales.hasPending === false ? "1" : "0",
  "Check Box-App30": (formData) => formData.disclosures.cicCertification.reportFiled === true ? "1" : "0",
  "Association Filing No": (formData) => formData.disclosures.cicCertification.registrationNumber,
  "Filing Expiration Date": (formData) => {
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
function mapFormDataToPDFFields(formData) {
  const entities = formData.disclosures.entities || [];
  const agencies = formData.disclosures.mortgageApprovals.approvedAgencies;
  const coverageDetails = formData.disclosures?.insurance?.coverageDetails || [];
  const designatedProjects = formData.disclosures?.reserves?.designatedProjects || [];

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

  // Filter fields to only process those that have data or are required
  const relevantFields = fields.filter(field => {
    const fieldName = field.fieldName;
    
    // Always include fields that have direct mappings
    if (FIELD_TO_FORMDATA[fieldName]) return true;
    
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

  console.log(`📊 Processing ${relevantFields.length} relevant fields out of ${fields.length} total fields`);

  // Use map with early returns for better performance
  const updatedFields = relevantFields.map((field) => {
    const fieldName = field.fieldName;
    let match;

    // 1. Dynamic mapping for EntityFacility NameRowN
    if ((match = fieldName.match(patterns.entityFacilityName))) {
      const idx = parseInt(match[1], 10) - 1;
      return { ...field, text: entities[idx]?.name || "" };
    }

    // 2. Dynamic mapping for Amount DueRowN
    if ((match = fieldName.match(patterns.amountDue))) {
      const idx = parseInt(match[1], 10) - 1;
      return { ...field, text: entities[idx]?.amountDue || "" };
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
      const idx = parseInt(match[1], 10);
      return { ...field, text: coverageDetails[idx]?.description || "" };
    }

    // 6. Dynamic mapping for Text-App14-0N
    if ((match = fieldName.match(patterns.textApp14))) {
      const idx = parseInt(match[1], 10);
      return { ...field, text: coverageDetails[idx]?.articleSection || "" };
    }

    // 7. Dynamic mapping for Group_App14-N (radio/choice)
    if ((match = fieldName.match(patterns.groupApp14))) {
      const idx = parseInt(match[1], 10);
      const val = coverageDetails[idx - 2]?.certificateAttached;
      return {
        ...field,
        text: typeof val !== "undefined" ? (val ? "Choice1" : "Choice2") : ""
      };
    }

    // 8. Group_App14 choice mapping
    if ((match = fieldName.match(patterns.groupApp14Choice))) {
      const idx = parseInt(match[1], 10);
      const choice = match[2];
      const isAttached = coverageDetails[idx]?.certificateAttached === true;
      const value = (choice === "1") ? isAttached : !isAttached;
      return { ...field, value };
    }

    // 9. Secondary mortgage market agency mapping
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

function downloadPDF(pdfBytes, filename = "filled-resale-certificate.pdf") {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function getAvailablePDFFields() {
  try {
    const response = await fetch("/Resale.pdf");
    const pdfBytes = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    return fields.map((field) => ({
      name: field.getName(),
      type: field.constructor.name,
    }));
  } catch (error) {
    console.error("Error getting PDF fields:", error);
    return [];
  }
}

async function getSignedUrl(filePath) {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase.storage
    .from("bucket0")
    .createSignedUrl(filePath, 30 * 24 * 60 * 60); // 30 days expiry

  if (error) throw error;
  return data.signedUrl;
}

async function savePDFToStorage(pdfBytes, applicationId) {
  const supabase = createClientComponentClient();
  // Use a consistent filename for each application to enable proper replacement
  const fileName = `resale_certificate_${applicationId}.pdf`;
  const filePath = `resale-certificates/${applicationId}/${fileName}`;

  try {
    // Upload PDF to Supabase storage with upsert to replace existing file
    const { data, error } = await supabase.storage
      .from("bucket0")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) throw error;

    // Get both public and signed URLs
    const {
      data: { publicUrl },
    } = supabase.storage.from("bucket0").getPublicUrl(filePath);

    const signedUrl = await getSignedUrl(filePath);

    // Update the applications table with the PDF URL
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        pdf_url: publicUrl,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateError) throw updateError;

    return { publicUrl, signedUrl };
  } catch (error) {
    console.error("Error saving PDF to storage:", error);
    throw error;
  }
}

/**
 * Upload a file to Supabase storage and return the public URL.
 * @param {ArrayBuffer|Buffer} fileBuffer - The file data to upload
 * @param {string} outputPdfPath - The path/filename for the output PDF in Supabase
 * @param {object} supabase - The Supabase client instance
 * @param {string} bucketName - The Supabase storage bucket name
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadFileToSupabase(fileBuffer, outputPdfPath, supabase, bucketName) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(outputPdfPath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
  return publicUrl;
}

/**
 * Generate a filled PDF using PDF.co and upload it to Supabase storage.
 * @param {Array} fields - The fields array for PDF.co
 * @param {string} outputPdfPath - The path/filename for the output PDF in Supabase
 * @param {string} apiKey - Your PDF.co API key
 * @param {object} supabase - The Supabase client instance
 * @param {string} bucketName - The Supabase storage bucket name
 * @returns {Promise<{ data: object, publicURL: string }>} - The upload result and public URL
 */
async function generateAndUploadPDF(fields, outputPdfPath, apiKey, supabase, bucketName) {
  // Generate cache key based on fields content
  const fieldsHash = crypto.createHash('md5').update(JSON.stringify(fields)).digest('hex');
  const cacheKey = `pdf:${fieldsHash}`;
  
  // Check cache first (with dynamic import)
  try {
    const { getCache, setCache } = await import('./redis.js');
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
      console.log('✅ PDF cache HIT - returning cached PDF');
      return cachedResult;
    }
    console.log('❌ PDF cache MISS - generating new PDF');
  } catch (error) {
    console.log('⚠️ Redis not available - proceeding without cache');
  }
  const templateToken = process.env.PDFCO_TEMPLATE_TOKEN;
  if (!templateToken) {
    throw new Error("PDFCO_TEMPLATE_TOKEN is not set in environment variables.");
  }
  // 1. Call PDF.co API synchronously for faster processing with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
  
  let fillData, pdfBuffer;
  
  try {
    const fillRes = await fetch("https://api.pdf.co/v1/pdf/edit/add", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: templateToken,
        name: outputPdfPath,
        async: false, // Use synchronous for faster processing
        fields,
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    fillData = await fillRes.json();
    if (!fillData || !fillData.url) throw new Error("PDF.co did not return a filled PDF URL");

    // 2. Download the filled PDF
    const pdfRes = await fetch(fillData.url);
    pdfBuffer = await pdfRes.arrayBuffer();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("PDF generation timeout - request took longer than 25 seconds");
    }
    throw error;
  }

  // 3. Upload to Supabase
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(outputPdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  // 4. Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
  const result = { data, publicURL: publicUrl };
  
  // Cache the result for 1 hour (3600 seconds) - with dynamic import
  try {
    const { setCache } = await import('./redis.js');
    await setCache(cacheKey, result, 3600);
  } catch (error) {
    console.log('⚠️ Could not cache PDF result - Redis not available');
  }
  
  return result;
}

module.exports = {
  mapFormDataToPDFFields,
  downloadPDF,
  getAvailablePDFFields,
  savePDFToStorage,
  uploadFileToSupabase,
  generateAndUploadPDF,
};
