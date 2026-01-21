import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import settlementFormFields from '../../lib/settlementFormFields.json';
import fs from 'fs';
import path from 'path';
import { formatDateTimeInTimezone } from '../../lib/timeUtils';

// Helper function to format property address with unit number
const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and has proper role
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId, formData: formDataFromClient, propertyGroupId, timezone } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }
    
    // Get user's timezone or default to UTC
    const userTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Get application data with settlement form
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, location),
        property_owner_forms(id, form_type, form_data, property_group_id)
      `)
      .eq('id', applicationId)
      .single();

    if (appError) throw appError;

    // Get settlement form from nested data - filter by property_group_id for multi-community
    let settlementForm;
    if (propertyGroupId) {
      // Multi-community: find settlement form for this specific property group
      settlementForm = application.property_owner_forms?.find(
        (f) => f.form_type === 'settlement_form' && f.property_group_id === propertyGroupId
      );
    } else {
      // Single property: find settlement form without property_group_id
      settlementForm = application.property_owner_forms?.find(
        (f) => f.form_type === 'settlement_form' && !f.property_group_id
      );
    }

    // Use form_data from database if available, otherwise use client formData
    const formData = settlementForm?.form_data || formDataFromClient || {};

    // If no form data available, return error
    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }
    

    // Determine property state - check for VA/Virginia or NC/North Carolina
    const location = application.hoa_properties?.location?.toUpperCase() || '';
    
    // Debug: Log location to help diagnose issues
    console.log('PDF Generation - Property Location:', application.hoa_properties?.location);
    console.log('PDF Generation - Uppercase Location:', location);
    
    let propertyState = 'NC'; // Default to NC
    if (location.includes('VA') || location.includes('VIRGINIA')) {
      propertyState = 'VA';
    } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
      propertyState = 'NC';
    }
    
    console.log('PDF Generation - Detected Property State:', propertyState);
    
    const documentType = propertyState === 'VA' 
      ? 'Dues Request - Escrow Instructions' 
      : 'Statement of Unpaid Assessments';
    
    console.log('PDF Generation - Document Type:', documentType);

    // Helper function to format values
    const formatValue = (value, fieldType) => {
      if (value === null || value === undefined || value === '') return '';
      
      if (fieldType === 'date' && value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
          }
        } catch (e) {
          // If date parsing fails, return as is
        }
      }
      
      return String(value);
    };

    // Helper function to format field label
    const formatLabel = (key, label) => {
      return label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    };

    // Helper function to escape HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    };

    // Define fee fields that should be grouped together (but not in comments)
    const feeFields = {
      VA: ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee', 'totalAmountDue'],
      NC: ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'totalAmountDue', 'resaleCertificateFee']
    };

    // Get sections for the property state
    const sections = settlementFormFields.forms[propertyState]?.sections || [];
    
    // Organize fields by section, separating fees
    const organizedSections = [];
    const feesSection = { section: 'Fees', fields: [] };
    
    for (const section of sections) {
      const sectionFields = [];
      
      // Special handling for Assessment Information section - need to preserve order
      const isAssessmentSection = section.section === 'Assessment Information';
      
      // Skip adding Fees section as a regular section - it will be added specially later with the table
      const isFeesSection = section.section === 'Fees';
      
      for (const field of section.fields) {
        const fieldKey = field.key;
        const fieldValue = formData[fieldKey];
        
        // Skip empty/null/undefined values, except for address fields and fee fields which should always be shown
        // Fee fields should be included even if 0, so they appear in the fees table
        const isFeeField = feeFields[propertyState].includes(fieldKey);
        if (!fieldValue && fieldValue !== 0 && fieldValue !== false && fieldKey !== 'gmgAddress' && fieldKey !== 'associationAddress' && !isFeeField) continue;
        
        // Check if it's a fee field - add to fees section with payableTo
        // Skip address fields (they're not fee fields, they'll be shown separately)
        if (feeFields[propertyState].includes(fieldKey) && fieldKey !== 'gmgAddress' && fieldKey !== 'associationAddress') {
          // Skip totalAmountDue from the table (it will be shown separately)
          if (fieldKey !== 'totalAmountDue') {
            const payableToKey = `${fieldKey}_payableTo`;
            let payableToValue = formData[payableToKey] || '';
            
            // Remove "Payable to " prefix if present
            if (payableToValue && payableToValue.startsWith('Payable to ')) {
              payableToValue = payableToValue.replace(/^Payable to /i, '');
            }
            
            // Normalize "Goodman Management" to "Goodman Management Group" for consistency
            if (payableToValue && (payableToValue === 'Goodman Management' || payableToValue.toLowerCase() === 'goodman management')) {
              payableToValue = 'Goodman Management Group';
            }
            
            // Format the value - ensure it has $ prefix
            let formattedValue = formatValue(fieldValue, field.type);
            if (formattedValue && !formattedValue.startsWith('$')) {
              // Try to parse as number and format
              const numValue = parseFloat(formattedValue.replace(/[^0-9.]/g, ''));
              if (!isNaN(numValue)) {
                formattedValue = `$${numValue.toFixed(2)}`;
              } else if (formattedValue) {
                formattedValue = `$${formattedValue}`;
              }
            }
            
            // Calculate numeric value
            const numericValue = parseFloat((formattedValue || '').replace(/[^0-9.]/g, '')) || 0;
            
            // Always add fee to section (even if 0) so it appears in the table
            // The table will show all fees, including $0.00 ones
            feesSection.fields.push({
              key: fieldKey,
              label: field.label || formatLabel(fieldKey),
              value: formattedValue || '$0.00',
              payableTo: payableToValue,
              type: 'fee',
              numericValue: numericValue
            });
          }
          continue;
        }
        
        // Regular field - add to its section
        // For address fields, use default value if empty
        let displayValue = fieldValue;
        if ((fieldKey === 'gmgAddress' || fieldKey === 'associationAddress') && !displayValue) {
          displayValue = field.defaultValue || '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060';
        }
        
        // For Assessment Information, include order information
        const fieldData = {
          key: fieldKey,
          label: field.label || formatLabel(fieldKey),
          value: formatValue(displayValue, field.type),
          type: field.type
        };
        
        if (isAssessmentSection) {
          // Store order from formData (same logic as frontend)
          fieldData.order = formData[`${fieldKey}_order`] !== undefined 
            ? formData[`${fieldKey}_order`] 
            : section.fields.findIndex(f => f.key === fieldKey);
          fieldData.isCustom = false;
        }
        
        sectionFields.push(fieldData);
      }
      
      // Only add section if it has fields, but skip Fees section (it will be added specially later)
      if (sectionFields.length > 0 && !isFeesSection) {
        organizedSections.push({
          section: section.section,
          fields: sectionFields
        });
      }
    }
    
    // Process custom fee fields and add them to fees section
    if (formData.customFields && Array.isArray(formData.customFields) && formData.customFields.length > 0) {
      formData.customFields.forEach(customField => {
        if (customField.name && customField.type === 'fee' && customField.value) {
          let payableToValue = customField.payableTo || '';
          // Remove "Payable to " prefix if present
          if (payableToValue && payableToValue.startsWith('Payable to ')) {
            payableToValue = payableToValue.replace(/^Payable to /i, '');
          }
          // Normalize "Goodman Management" to "Goodman Management Group"
          if (payableToValue && (payableToValue === 'Goodman Management' || payableToValue.toLowerCase() === 'goodman management')) {
            payableToValue = 'Goodman Management Group';
          }
          
          // Format the value - ensure it has $ prefix
          let formattedValue = customField.value || '';
          if (formattedValue && !formattedValue.startsWith('$')) {
            const numValue = parseFloat(formattedValue.replace(/[^0-9.]/g, ''));
            if (!isNaN(numValue)) {
              formattedValue = `$${numValue.toFixed(2)}`;
            } else if (formattedValue) {
              formattedValue = `$${formattedValue}`;
            }
          }
          
          feesSection.fields.push({
            key: `custom_${customField.id}`,
            label: customField.name,
            value: formattedValue,
            payableTo: payableToValue,
            type: 'fee',
            numericValue: parseFloat(formattedValue.replace(/[^0-9.]/g, '')) || 0
          });
        }
      });
    }
    
    // Add fees section if it has fields
    if (feesSection.fields.length > 0) {
      // Calculate separate totals for GMG and Association
      let totalGMG = 0;
      let totalAssociation = 0;
      
      feesSection.fields.forEach(field => {
        if (field.type === 'fee' && field.numericValue) {
          const payableTo = (field.payableTo || '').toLowerCase();
          // Match both "Goodman Management" and "Goodman Management Group" for backward compatibility
          if (payableTo.includes('goodman management') || payableTo.includes('gmg')) {
            totalGMG += field.numericValue;
          } else if (payableTo.includes('association')) {
            totalAssociation += field.numericValue;
          }
        }
      });
      
      // Add totals to fees section
      if (totalGMG > 0) {
        feesSection.fields.push({
          key: 'totalGMG',
          label: 'Total for Goodman Management Group',
          value: `$${totalGMG.toFixed(2)}`,
          type: 'total',
          payableTo: 'Goodman Management Group'
        });
      }
      
      if (totalAssociation > 0) {
        feesSection.fields.push({
          key: 'totalAssociation',
          label: 'Total for Association',
          value: `$${totalAssociation.toFixed(2)}`,
          type: 'total',
          payableTo: 'Association'
        });
      }
      
      // Add overall total (sum of both)
      const overallTotal = totalGMG + totalAssociation;
      if (overallTotal > 0) {
        feesSection.fields.push({
          key: 'overallTotal',
          label: 'Overall Total',
          value: `$${overallTotal.toFixed(2)}`,
          type: 'total',
          payableTo: 'Overall'
        });
      }
      
      organizedSections.push(feesSection);
    }
    
    // Extract address fields from formData for payment instructions
    const gmgAddress = formData.gmgAddress || '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060';
    
    // Association address should be the HOA name (e.g., "VA Property")
    // For multi-community, try to get from property group's HOA properties if available
    let hoaNameForAssociation = null;
    if (propertyGroupId) {
      // Try to get property group's HOA name
      const { data: propertyGroup } = await supabase
        .from('application_property_groups')
        .select(`
          hoa_properties(name)
        `)
        .eq('id', propertyGroupId)
        .eq('application_id', applicationId)
        .single();
      
      if (propertyGroup?.hoa_properties?.name) {
        hoaNameForAssociation = propertyGroup.hoa_properties.name;
      }
    }
    
    // Use formData value first, then property group HOA name, then application HOA name, then default
    const associationAddress = formData.associationAddress || 
                               hoaNameForAssociation ||
                               application.hoa_properties?.name || 
                               '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060';
    
    // Calculate payment amounts for GMG and Association from fees
    let gmgPaymentAmount = 0;
    let associationPaymentAmount = 0;
    
    if (feesSection.fields.length > 0) {
      feesSection.fields.forEach(field => {
        if (field.type === 'fee' && field.numericValue) {
          const payableTo = (field.payableTo || '').toLowerCase();
          if (payableTo.includes('goodman management') || payableTo.includes('gmg')) {
            gmgPaymentAmount += field.numericValue;
          } else if (payableTo.includes('association')) {
            associationPaymentAmount += field.numericValue;
          }
        }
      });
    }
    
    // Generate confirmation number from application ID (first 8 characters, uppercase)
    const confirmationNumber = applicationId ? applicationId.toString().substring(0, 8).toUpperCase() : 'N/A';

    // Handle Assessment Information section with custom fields and proper ordering
    const assessmentSection = organizedSections.find(s => s.section === 'Assessment Information');
    if (assessmentSection) {
      // Get all standard fields with their order
      const standardFields = assessmentSection.fields.map(field => ({
        ...field,
        isCustom: false
      }));
      
      // Get custom fields with their order (exclude fee fields as they're handled separately)
      const customFields = [];
      if (formData.customFields && Array.isArray(formData.customFields) && formData.customFields.length > 0) {
        formData.customFields.forEach(customField => {
          if (customField.name && customField.type !== 'fee') {
            // Regular custom fields go to Assessment Information
            let displayValue = customField.value || '—';
            
            // Format based on field type
            if (customField.type === 'number' && customField.value) {
              const numValue = parseFloat(customField.value);
              if (!isNaN(numValue)) {
                displayValue = `$${numValue.toFixed(2)}`;
              }
            }
            
            customFields.push({
              key: `custom_${customField.id}`,
              label: customField.name,
              value: displayValue,
              type: customField.type || 'text',
              order: customField.order || 0,
              isCustom: true
            });
          }
        });
      }
      
      // Combine standard and custom fields, then sort by order (same logic as frontend)
      const allFields = [...standardFields, ...customFields].sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Replace the section's fields with the properly ordered fields
      assessmentSection.fields = allFields;
    } else if (formData.customFields && Array.isArray(formData.customFields) && formData.customFields.length > 0) {
      // If Assessment Information section doesn't exist but we have custom fields, create it
      const customFields = [];
      formData.customFields.forEach(customField => {
        if (customField.name) {
          let displayValue = customField.value || '—';
          
          if (customField.type === 'number' && customField.value) {
            const numValue = parseFloat(customField.value);
            if (!isNaN(numValue)) {
              displayValue = `$${numValue.toFixed(2)}`;
            }
          }
          
          customFields.push({
            key: `custom_${customField.id}`,
            label: customField.name,
            value: displayValue,
            type: customField.type || 'text',
            order: customField.order || 0,
            isCustom: true
          });
        }
      });
      
      // Sort custom fields by order
      customFields.sort((a, b) => (a.order || 0) - (b.order || 0));
      
      organizedSections.push({
        section: 'Assessment Information',
        fields: customFields
      });
    }

    // Load and encode company logo
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    } catch (error) {
      console.warn('Could not load company logo:', error);
    }

    // Convert organized sections to format expected by SettlementPdfDocument
    // Define optimal section order for better document flow
    const sectionOrder = [
      'Property Information',
      'Seller Information',
      'Buyer Information',
      'Requestor Information',
      'Community Manager Information',
      'Assessment Information',
      'Fees', // Fees should come after Assessment but before other info sections
      'Delinquency Information',
      'Insurance Information',
      'Closing Information',
      'Status Information',
      'Comments' // Always last
    ];
    
    // Reorder sections according to optimal flow
    const reorderedSections = [];
    const sectionsMap = new Map(organizedSections.map(s => [s.section, s]));
    
    // Add sections in optimal order
    sectionOrder.forEach(sectionName => {
      const section = sectionsMap.get(sectionName);
      if (section) {
        reorderedSections.push(section);
        sectionsMap.delete(sectionName);
      }
    });
    
    // Add any remaining sections that weren't in the order list (shouldn't happen, but safety)
    sectionsMap.forEach((section) => {
      reorderedSections.push(section);
    });
    
    const pdfSections = reorderedSections.map(section => ({
      title: section.section,
      fields: section.fields.map(field => ({
        label: formatLabel(field.key, field.label),
        value: field.value,
        type: field.type || 'text',
        payableTo: field.payableTo || '', // Include payableTo for fee fields
        key: field.key // Include key for reference
      }))
    }));
    

    // Use dedicated React PDF component for settlement form (same approach as inspection form)
    console.log('Creating settlement form PDF using React PDF component');
    const formattedAddress = formatPropertyAddress(application.property_address, application.unit_number);
    const filename = `${documentType.replace(/[^a-zA-Z0-9]/g, '_')}_${formattedAddress.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    const React = await import('react');
    const ReactPDF = await import('@react-pdf/renderer');
    const { SettlementPdfDocument } = await import('../../lib/components/SettlementPdfDocument.js');
    
    const pdfElement = React.createElement(SettlementPdfDocument, {
      documentType: documentType,
      propertyAddress: formatPropertyAddress(application.property_address, application.unit_number),
      hoaName: application.hoa_properties.name,
      generatedDate: formatDateTimeInTimezone(new Date(), userTimezone),
      logoBase64: logoBase64,
      sections: pdfSections,
      requestorName: formData.requestorName || application.submitter_name || '',
      requestorCompany: formData.requestorCompany || application.submitter_company || '',
      requestorPhone: formData.requestorPhone || application.submitter_phone || '',
      gmgAddress: gmgAddress,
      associationAddress: associationAddress,
      gmgPaymentAmount: gmgPaymentAmount,
      associationPaymentAmount: associationPaymentAmount,
      confirmationNumber: confirmationNumber
    });
    
    const stream = await ReactPDF.default.renderToStream(pdfElement);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);
    
    // Validate PDF buffer is not empty
    if (!pdfBuffer || pdfBuffer.byteLength === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Upload PDF to Supabase storage
    const fileName = `${Date.now()}-${filename}`;
    const filePath = `settlement-forms/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('bucket0')
      .getPublicUrl(filePath);

    // Add cache-busting query parameter to force browser to fetch new version
    const cacheBuster = `?t=${Date.now()}`;
    const publicUrlWithCacheBuster = publicUrl.includes('?') 
      ? `${publicUrl}&t=${Date.now()}` 
      : `${publicUrl}${cacheBuster}`;

    // Update both applications table and property_owner_forms table with PDF URL
    const timestamp = new Date().toISOString();
    
    // For multi-community, update the property group instead of application-level
    if (propertyGroupId) {
      // Update the specific property group with PDF URL
      const { error: groupUpdateError } = await supabase
        .from('application_property_groups')
        .update({
          pdf_url: publicUrlWithCacheBuster,
          pdf_status: 'completed',
          pdf_completed_at: timestamp,
          updated_at: timestamp,
        })
        .eq('id', propertyGroupId)
        .eq('application_id', applicationId);

      if (groupUpdateError) throw groupUpdateError;
    } else {
      // Single property: update application with PDF URL
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          pdf_url: publicUrlWithCacheBuster,
          pdf_generated_at: timestamp,
          pdf_completed_at: timestamp,
          updated_at: timestamp, // Explicitly set updated_at to match pdf_generated_at
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;
    }

    // Also update the settlement form with PDF URL
    if (settlementForm?.id) {
      const { error: formUpdateError } = await supabase
        .from('property_owner_forms')
        .update({
          pdf_url: publicUrlWithCacheBuster,
        })
        .eq('id', settlementForm.id);

      if (formUpdateError) {
        console.warn('Failed to update property_owner_forms with pdf_url:', formUpdateError);
        // Don't throw - application was updated successfully
      }
    }

    return res.status(200).json({ 
      success: true, 
      pdfUrl: publicUrlWithCacheBuster 
    });
  } catch (error) {
    console.error('Error in generate-settlement-pdf:', error);
    return res.status(500).json({ error: error.message });
  }
}
