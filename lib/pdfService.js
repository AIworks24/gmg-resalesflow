const {
  createClientComponentClient,
} = require("@supabase/auth-helpers-nextjs");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

// Import client-safe field mapping function
const { mapFormDataToPDFFields } = require("./pdfFieldMapper");

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
 * Load PDF template from Supabase storage
 * @param {string} templatePath - Path to the PDF template file in Supabase storage (e.g., 'templates/ResaleCertificate_Template.pdf')
 * @param {object} supabase - The Supabase client instance
 * @param {string} bucketName - The Supabase storage bucket name (defaults to 'bucket0')
 * @returns {Promise<Uint8Array>} - PDF template bytes
 */
async function loadTemplatePDF(templatePath, supabase, bucketName = 'bucket0') {
  // Ensure we're on the server side
  if (typeof window !== 'undefined') {
    throw new Error('loadTemplatePDF can only be called server-side');
  }
  
  try {
    // Download template from Supabase storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(templatePath);
    
    if (error) {
      throw new Error(`Failed to download PDF template from Supabase: ${error.message}`);
    }
    
    // Convert blob to buffer/uint8array
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    throw new Error(`Failed to load PDF template: ${error.message}`);
  }
}

/**
 * Fill PDF form fields using pdf-lib
 * @param {PDFDocument} pdfDoc - PDF document instance
 * @param {Array} fields - Array of field objects with fieldName, text, value, etc.
 */
function fillPDFFields(pdfDoc, fields) {
  console.log(`[PDF Service] ========== fillPDFFields() called ==========`);
  console.log(`[PDF Service] Total fields to process:`, fields.length);
  const checkBox11Fields = fields.filter(f => f.fieldName === 'Check Box11.');
  console.log(`[PDF Service] Check Box11. fields in array:`, checkBox11Fields.length);
  checkBox11Fields.forEach((f, idx) => {
    console.log(`[PDF Service]   Field ${idx + 1}: value=${f.value}, text=${f.text}`);
  });
  
  try {
    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    
    // Create a map of field names for quick lookup
    const fieldMap = new Map();
    formFields.forEach(field => {
      fieldMap.set(field.getName(), field);
    });
    
    // Debug: Log all Check Box11 related fields found in PDF
    const checkBox11Fields = Array.from(fieldMap.keys()).filter(k => k.includes('Check Box11'));
    if (checkBox11Fields.length > 0) {
      console.log(`[PDF Service] Found ${checkBox11Fields.length} Check Box11 field(s) in PDF:`, checkBox11Fields);
      // Check if exact match exists
      const exactMatch = checkBox11Fields.find(k => k === 'Check Box11.');
      if (!exactMatch) {
        console.log(`[PDF Service] ⚠️  WARNING: No exact match for "Check Box11." found!`);
        console.log(`[PDF Service] ⚠️  Available variations:`, checkBox11Fields);
        console.log(`[PDF Service] ⚠️  This might be why the checkbox isn't updating!`);
      } else {
        console.log(`[PDF Service] ✓ Exact match "Check Box11." found in PDF`);
      }
    } else {
      console.log(`[PDF Service] ⚠️  No Check Box11 fields found in PDF template!`);
      console.log(`  - Total fields in PDF:`, fieldMap.size);
      console.log(`  - Sample field names:`, Array.from(fieldMap.keys()).slice(0, 20));
      // Check for similar field names
      const similarFields = Array.from(fieldMap.keys()).filter(k => 
        k.toLowerCase().includes('box11') || 
        (k.toLowerCase().includes('11') && k.toLowerCase().includes('check')) ||
        k.toLowerCase().includes('operating') ||
        k.toLowerCase().includes('budget')
      );
      if (similarFields.length > 0) {
        console.log(`  - Similar field names found:`, similarFields);
      }
    }
    
    let filledCount = 0;
    let notFoundCount = 0;
    
    // Collect radio group selections first to avoid conflicts
    // Map: groupName -> { option: choice, fieldName: original field name, value: true/false }
    const radioGroupSelections = new Map();
    
    // First pass: collect all radio group choices
    // Skip Group_App14.Choice1 (it's now cb_provided checkbox), but include Choice2 and Choice3 (they are radio buttons)
    fields.forEach(fieldData => {
      const fieldName = fieldData.fieldName;
      
      // Skip Group_App14.Choice1 only (it's now cb_provided checkbox)
      // Include Choice2 and Choice3 as they are radio buttons
      if (fieldName === 'Group_App14.Choice1') {
        // Don't collect this - it's now handled as cb_provided checkbox
        return;
      }
      
      // Check if this is a radio group choice field
      if (fieldName.includes('.Choice')) {
        const parts = fieldName.split('.Choice');
        const groupName = parts[0];
        const choiceNum = parts[1];
        const option = `Choice${choiceNum}`;
        
        // Check if this choice should be selected
        const shouldSelect = fieldData.value === true || 
                            fieldData.value === 1 ||
                            String(fieldData.value) === '1' ||
                            String(fieldData.text) === '1' ||
                            String(fieldData.text) === 'True' ||
                            String(fieldData.text) === 'true';
        
        if (shouldSelect) {
          // Only store if this choice should be selected
          // If multiple choices are selected, the last one wins (or we could prioritize)
          if (!radioGroupSelections.has(groupName) || shouldSelect) {
            radioGroupSelections.set(groupName, {
              option: option,
              fieldName: fieldName,
              value: true
            });
          }
        }
      }
    });
    
    // Second pass: fill all fields
    fields.forEach(fieldData => {
      const fieldName = fieldData.fieldName;
      let pdfField = fieldMap.get(fieldName);
      let fieldType = pdfField?.constructor?.name;
      
      // Special handling: Group_App14.Choice1 is now cb_provided (checkbox), skip it here
      // Group_App14.Choice2 and Choice3 are radio buttons, handle them normally
      if (fieldName === 'Group_App14.Choice1') {
        // Skip - this is now handled as cb_provided checkbox
        return;
      }
      
      // If field not found, check if it's a radio group choice (e.g., "Group3.Choice1" or "Group_App14.Choice2")
      if (!pdfField && fieldName.includes('.Choice')) {
        const parts = fieldName.split('.Choice');
        const groupName = parts[0]; // "Group3"
        const groupField = fieldMap.get(groupName);
        
        if (groupField && groupField.constructor.name === 'PDFRadioGroup') {
          // Found the radio group! Use it instead
          pdfField = groupField;
          fieldType = 'PDFRadioGroup';
        }
      }
      
      // Try alternative field name for Check Box11 (without period)
      if (!pdfField && fieldName === 'Check Box11.') {
        pdfField = fieldMap.get('Check Box11');
        if (pdfField) {
          console.log(`[PDF Service] ✓ Found "Check Box11" (without period) as alternative to "Check Box11."`);
          fieldType = pdfField.constructor.name;
        }
      } else if (!pdfField && fieldName === 'Check Box11') {
        pdfField = fieldMap.get('Check Box11.');
        if (pdfField) {
          console.log(`[PDF Service] ✓ Found "Check Box11." (with period) as alternative to "Check Box11"`);
          fieldType = pdfField.constructor.name;
        }
      }
      
      // Try alternative field name for Appendix 2 fields
      // "Check Box_App02.2" (with space and underscore) vs "Check BoxApp_02.2" (no space)
      if (!pdfField && fieldName === 'Check Box_App02.2') {
        pdfField = fieldMap.get('Check BoxApp_02.2');
        if (pdfField) {
          console.log(`[PDF Service] ✓ Found "Check BoxApp_02.2" (no space) as alternative to "Check Box_App02.2"`);
          fieldType = pdfField.constructor.name;
        }
      } else if (!pdfField && fieldName === 'Check BoxApp_02.2') {
        pdfField = fieldMap.get('Check Box_App02.2');
        if (pdfField) {
          console.log(`[PDF Service] ✓ Found "Check Box_App02.2" (with space) as alternative to "Check BoxApp_02.2"`);
          fieldType = pdfField.constructor.name;
        }
      }
      
      // Try alternative field names for Appendix 6 Amount Due fields
      // "Amount DueRowN" vs "Amount Due RowN" (with space) vs "AmountDueRowN" (no space)
      if (!pdfField && fieldName.match(/^Amount DueRow(\d+)$/)) {
        const rowNum = fieldName.match(/^Amount DueRow(\d+)$/)[1];
        // Try "Amount Due RowN" (with space)
        const altName1 = `Amount Due Row${rowNum}`;
        pdfField = fieldMap.get(altName1);
        if (pdfField) {
          console.log(`[PDF Service] ✓ Found "${altName1}" (with space) as alternative to "${fieldName}"`);
          fieldType = pdfField.constructor.name;
        } else {
          // Try "AmountDueRowN" (no space)
          const altName2 = `AmountDueRow${rowNum}`;
          pdfField = fieldMap.get(altName2);
          if (pdfField) {
            console.log(`[PDF Service] ✓ Found "${altName2}" (no space) as alternative to "${fieldName}"`);
            fieldType = pdfField.constructor.name;
          }
        }
      }
      
      if (!pdfField) {
        notFoundCount++;
        // Debug: Log if Check Box11 is not found
        if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
          console.log(`[PDF Service] ❌ Check Box11 field NOT FOUND in PDF template!`);
          console.log(`  - Looking for field name: "${fieldName}"`);
          console.log(`  - Available fields containing "Check Box11":`, 
            Array.from(fieldMap.keys()).filter(k => k.includes('Check Box11')));
        }
        // Debug: Log if Appendix 2 fields are not found
        if (fieldName === 'Check BoxApp_02.2' || fieldName === 'Check Box_App02.2') {
          console.log(`[PDF Service] ❌ Appendix 2 Rules and regulations field NOT FOUND in PDF template!`);
          console.log(`  - Looking for field name: "${fieldName}"`);
          console.log(`  - Available fields containing "App02" or "App_02":`, 
            Array.from(fieldMap.keys()).filter(k => k.includes('App02') || k.includes('App_02')));
        }
        if (fieldName === 'Check Box_App12_01') {
          console.log(`[PDF Service] ❌ Appendix 2 Association governing documents field NOT FOUND in PDF template!`);
          console.log(`  - Looking for field name: "${fieldName}"`);
          console.log(`  - Available fields containing "App12":`, 
            Array.from(fieldMap.keys()).filter(k => k.includes('App12')));
        }
        // Debug: Log if Appendix 6 Amount Due fields are not found
        if (fieldName && fieldName.match(/^Amount DueRow\d+$/)) {
          console.log(`[PDF Service] ❌ Appendix 6 Amount Due field NOT FOUND in PDF template!`);
          console.log(`  - Looking for field name: "${fieldName}"`);
          console.log(`  - Available fields containing "Amount" or "Due":`, 
            Array.from(fieldMap.keys()).filter(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('due')));
        }
        return;
      }
      
      filledCount++;
      
      // Debug: Log when Check Box11 field is found
      if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
        console.log(`[PDF Service] ✓ Check Box11 field FOUND in PDF template`);
        console.log(`  - Field type:`, fieldType);
        console.log(`  - Field name in data:`, fieldName);
        console.log(`  - Actual PDF field name:`, pdfField.getName());
      }
      
      // Debug: Log when Appendix 2 fields are found
      if (fieldName === 'Check BoxApp_02.2' || fieldName === 'Check Box_App02.2') {
        console.log(`[PDF Service] ✓ Appendix 2 Rules and regulations field FOUND in PDF template`);
        console.log(`  - Field type:`, fieldType);
        console.log(`  - Field name in data:`, fieldName);
        console.log(`  - Actual PDF field name:`, pdfField.getName());
        console.log(`  - Field value:`, fieldData.value, `(text: ${fieldData.text})`);
      }
      if (fieldName === 'Check Box_App12_01') {
        console.log(`[PDF Service] ✓ Appendix 2 Association governing documents field FOUND in PDF template`);
        console.log(`  - Field type:`, fieldType);
        console.log(`  - Field name in data:`, fieldName);
        console.log(`  - Actual PDF field name:`, pdfField.getName());
        console.log(`  - Field value:`, fieldData.value, `(text: ${fieldData.text})`);
      }
      // Debug: Log when Appendix 6 Amount Due fields are found
      if (fieldName && fieldName.match(/^Amount DueRow\d+$/)) {
        console.log(`[PDF Service] ✓ Appendix 6 Amount Due field FOUND in PDF template`);
        console.log(`  - Field type:`, fieldType);
        console.log(`  - Field name in data:`, fieldName);
        console.log(`  - Actual PDF field name:`, pdfField.getName());
        console.log(`  - Field value:`, fieldData.value, `(text: ${fieldData.text})`);
      }
      
      try {
        // Ensure fieldType is set (fallback to pdfField type if not already set)
        if (!fieldType) {
          fieldType = pdfField.constructor.name;
        }
        
        // Handle different field types
        if (fieldType === 'PDFTextField') {
          const textField = form.getTextField(fieldName);
          const textValue = fieldData.text || fieldData.value || '';
          
          // Set a standard font size to match the template labels
          // Using 9-10pt which is typical for form fields to match label text size
          try {
            textField.setFontSize(9);
          } catch (error) {
            // Continue if font size setting fails
          }
          
          textField.setText(String(textValue));
          
          try {
            textField.updateAppearances();
          } catch (error) {
            // Continue if appearance update fails
          }
        } else if (fieldType === 'PDFCheckBox') {
          // Use the pdfField we already found (it handles the name mismatch via the lookup logic above)
          const checkBox = pdfField;
          
          // Check both value (boolean) and text (string) properties
          // Support multiple formats: boolean true, string "True", string "1", number 1
          const isChecked = fieldData.value === true || 
                          fieldData.value === 'True' || 
                          fieldData.value === 'true' ||
                          fieldData.text === 'True' || 
                          fieldData.text === 'true' ||
                          fieldData.text === '1' ||
                          fieldData.value === 1 ||
                          String(fieldData.value) === '1' ||
                          String(fieldData.text) === '1';
          
          // Debug logging for Check Box11 specifically
          if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
            console.log(`[PDF Service] Processing Check Box11 field:`);
            console.log(`  - Requested field name: "${fieldName}"`);
            console.log(`  - Actual PDF field name: "${checkBox.getName()}"`);
            console.log(`  - fieldData.value:`, fieldData.value, `(type: ${typeof fieldData.value})`);
            console.log(`  - fieldData.text:`, fieldData.text, `(type: ${typeof fieldData.text})`);
            console.log(`  - isChecked calculated:`, isChecked);
            console.log(`  - Field found:`, !!checkBox);
          }
          
          // Debug logging for Appendix 2 fields
          const isAppendix2Field = fieldName === 'Check BoxApp_02.2' || fieldName === 'Check Box_App02.2' || fieldName === 'Check Box_App12_01';
          if (isAppendix2Field) {
            console.log(`[PDF Service] Processing Appendix 2 field:`);
            console.log(`  - Requested field name: "${fieldName}"`);
            console.log(`  - Actual PDF field name: "${checkBox.getName()}"`);
            console.log(`  - fieldData.value:`, fieldData.value, `(type: ${typeof fieldData.value})`);
            console.log(`  - fieldData.text:`, fieldData.text, `(type: ${typeof fieldData.text})`);
            console.log(`  - isChecked calculated:`, isChecked);
            console.log(`  - Field found:`, !!checkBox);
          }
          
          // Debug logging for new Appendix 14 checkbox fields
          const isApp14Checkbox = fieldName === 'cb_provided' || fieldName.startsWith('cb_ci') || fieldName.startsWith('cb_sa');
          if (isApp14Checkbox) {
            console.log(`[PDF Service] Processing Appendix 14 checkbox field:`);
            console.log(`  - Requested field name: "${fieldName}"`);
            console.log(`  - Actual PDF field name: "${checkBox.getName()}"`);
            console.log(`  - fieldData.value:`, fieldData.value, `(type: ${typeof fieldData.value})`);
            console.log(`  - fieldData.text:`, fieldData.text, `(type: ${typeof fieldData.text})`);
            console.log(`  - isChecked calculated:`, isChecked);
            console.log(`  - Field found:`, !!checkBox);
          }
          
          try {
            if (isChecked) {
              checkBox.check();
              if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
                console.log(`[PDF Service] ✓✓✓ Check Box11 CHECKED successfully! ✓✓✓`);
                console.log(`[PDF Service]   - Field "${checkBox.getName()}" is now checked`);
              }
              if (isAppendix2Field) {
                console.log(`[PDF Service] ✓✓✓ Appendix 2 field "${fieldName}" CHECKED successfully! ✓✓✓`);
                console.log(`[PDF Service]   - Field "${checkBox.getName()}" is now checked`);
              }
              if (isApp14Checkbox) {
                console.log(`[PDF Service] ✓✓✓ Appendix 14 checkbox "${fieldName}" CHECKED successfully! ✓✓✓`);
                console.log(`[PDF Service]   - Field "${checkBox.getName()}" is now checked`);
              }
            } else {
              checkBox.uncheck();
              if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
                console.log(`[PDF Service] ✗ Check Box11 UNCHECKED`);
              }
              if (isAppendix2Field) {
                console.log(`[PDF Service] ✗ Appendix 2 field "${fieldName}" UNCHECKED`);
              }
              if (isApp14Checkbox) {
                console.log(`[PDF Service] ✗ Appendix 14 checkbox "${fieldName}" UNCHECKED`);
              }
            }
          } catch (error) {
            if (fieldName === 'Check Box11.' || fieldName === 'Check Box11') {
              console.error(`[PDF Service] ❌❌❌ Error setting Check Box11:`, error);
              console.error(`[PDF Service]   - Error message:`, error.message);
              console.error(`[PDF Service]   - Error stack:`, error.stack);
            }
            if (isAppendix2Field) {
              console.error(`[PDF Service] ❌❌❌ Error setting Appendix 2 field "${fieldName}":`, error);
              console.error(`[PDF Service]   - Error message:`, error.message);
              console.error(`[PDF Service]   - Error stack:`, error.stack);
            }
            // Continue if checkbox operation fails
          }
        } else if (fieldType === 'PDFRadioGroup') {
          // Group_App14.Choice1 is now cb_provided (checkbox), so it won't reach here
          // Group_App14.Choice2 and Choice3 are radio buttons and should be handled here
          
          // Radio groups: Handle fields like "Group3.Choice1" where "Group3" is the group name
          // and "Choice1" is the option to select
          let groupName = fieldName;
          let optionToSelect = '';
          
          // If field name contains ".Choice", extract group name and choice
          // e.g., "Group3.Choice1" -> groupName = "Group3", optionToSelect = "Choice1"
          if (fieldName.includes('.Choice')) {
            const parts = fieldName.split('.Choice');
            groupName = parts[0]; // "Group3"
            const choiceNum = parts[1]; // "1"
            optionToSelect = `Choice${choiceNum}`; // "Choice1"
          } else if (fieldName.includes('Choice')) {
            // Try to extract from "Group3Choice1" format
            const match = fieldName.match(/^(Group[^.]+)Choice(\d+)$/);
            if (match) {
              groupName = match[1];
              optionToSelect = `Choice${match[2]}`;
            }
          }
          
          // For Group_App14 radio buttons, we need priority logic since only one can be selected
          // Note: Choice1 is now cb_provided (checkbox), so only Choice2 and Choice3 are radio buttons
          // Priority: Choice3 (Not applicable) > Choice2 (Recommends)
          if (groupName === 'Group_App14' && (fieldName === 'Group_App14.Choice2' || fieldName === 'Group_App14.Choice3')) {
            const shouldSelectThisChoice = fieldData.value === true || 
                                          fieldData.value === 1 ||
                                          String(fieldData.value) === '1' ||
                                          String(fieldData.text) === '1' ||
                                          String(fieldData.text) === 'True' ||
                                          String(fieldData.text) === 'true';
            
            console.log(`[PDF Service] Processing Group_App14 radio button: ${fieldName}`);
            console.log(`  - optionToSelect: ${optionToSelect}`);
            console.log(`  - shouldSelectThisChoice: ${shouldSelectThisChoice}`);
            console.log(`  - fieldData.value: ${fieldData.value} (type: ${typeof fieldData.value})`);
            console.log(`  - fieldData.text: ${fieldData.text} (type: ${typeof fieldData.text})`);
            
            if (shouldSelectThisChoice) {
              const currentSelection = radioGroupSelections.get(groupName);
              // Priority: Choice3 (Not applicable) > Choice2 (Recommends)
              const currentPriority = currentSelection ? 
                (currentSelection.option === 'Choice3' ? 3 : 
                 currentSelection.option === 'Choice2' ? 2 : 1) : 0;
              const newPriority = optionToSelect === 'Choice3' ? 3 : 
                                 optionToSelect === 'Choice2' ? 2 : 1;
              
              // Only update if new selection has higher priority
              if (!currentSelection || newPriority > currentPriority) {
                radioGroupSelections.set(groupName, {
                  option: optionToSelect,
                  fieldName: fieldName,
                  value: true
                });
                console.log(`[PDF Service] ✓ Group_App14: Storing "${optionToSelect}" (priority ${newPriority})`);
              } else {
                console.log(`[PDF Service] Group_App14: Keeping "${currentSelection.option}" (priority ${currentPriority}) over "${optionToSelect}" (priority ${newPriority})`);
              }
            } else {
              console.log(`[PDF Service] Group_App14: Not selecting "${optionToSelect}" (shouldSelectThisChoice is false)`);
            }
            return; // Skip normal radio group handling - we'll apply at the end
          }
          
          // Check if we already have a selection for this group from our first pass
          const preSelected = radioGroupSelections.get(groupName);
          if (preSelected) {
            optionToSelect = preSelected.option;
          }
          
          // Get the radio group by the group name
          let radioGroup;
          try {
            radioGroup = form.getRadioGroup(groupName);
          } catch (error) {
            try {
              radioGroup = form.getRadioGroup(fieldName);
              groupName = fieldName;
            } catch (e2) {
              return;
            }
          }
          
          // Determine which option to select (prefer pre-selected, then current field)
          let selectedValue = optionToSelect;
          
          // Check if this choice should be selected
          // Support: boolean true, number 1, string "1", string "True"
          const shouldSelectThisChoice = fieldData.value === true || 
                                        fieldData.value === 1 ||
                                        String(fieldData.value) === '1' ||
                                        String(fieldData.text) === '1' ||
                                        String(fieldData.text) === 'True' ||
                                        String(fieldData.text) === 'true';
          
          // Skip immediate selection - we'll apply all radio group selections at the end
          // to avoid conflicts when multiple choices from the same group are processed
          if (!preSelected && shouldSelectThisChoice && selectedValue) {
            if (!radioGroupSelections.has(groupName)) {
              radioGroupSelections.set(groupName, {
                option: selectedValue,
                fieldName: fieldName,
                value: true
              });
            }
          }
        } else if (fieldType === 'PDFDropdown') {
          const dropdown = form.getDropdown(fieldName);
          const selectedValue = fieldData.text || fieldData.value || '';
          if (selectedValue) {
            try {
              dropdown.select(String(selectedValue));
            } catch (error) {
              // Continue if dropdown selection fails
            }
          }
        }
      } catch (error) {
        // Continue with other fields even if one fails
      }
    });
    
    // Apply radio group selections (one per group to avoid conflicts)
    radioGroupSelections.forEach((selection, groupName) => {
      try {
        const radioGroup = form.getRadioGroup(groupName);
        const options = radioGroup.getOptions();
        
        if (options.includes(selection.option)) {
          radioGroup.select(selection.option);
        }
      } catch (error) {
        // Continue if radio group selection fails
      }
    });
    
    // Note: Not flattening the form to keep it editable as requested
  } catch (error) {
    throw error;
  }
}

/**
 * Generate a filled PDF using pdf-lib and upload it to Supabase storage.
 * @param {Array} fields - The fields array with fieldName, text, value properties
 * @param {string} outputPdfPath - The path/filename for the output PDF in Supabase
 * @param {object} supabase - The Supabase client instance
 * @param {string} bucketName - The Supabase storage bucket name
 * @param {string} templatePath - Optional path to template PDF in Supabase storage (defaults to templates/ResaleCertificate_Template.pdf)
 * @returns {Promise<{ data: object, publicURL: string }>} - The upload result and public URL
 */
async function generateAndUploadPDF(fields, outputPdfPath, supabase, bucketName, templatePath = null, bypassCache = false) {
  // Generate cache key based on fields content
  // IMPORTANT: Sort fields by fieldName to ensure consistent hashing
  const sortedFields = [...fields].sort((a, b) => {
    const nameA = a.fieldName || '';
    const nameB = b.fieldName || '';
    return nameA.localeCompare(nameB);
  });
  const fieldsHash = crypto.createHash('md5').update(JSON.stringify(sortedFields)).digest('hex');
  const cacheKey = `pdf:${fieldsHash}`;
  
  // Check cache first (with dynamic import) - but skip if bypassCache is true
  if (!bypassCache) {
    try {
      const { getCache, setCache } = await import('./redis.js');
      const cachedResult = await getCache(cacheKey);
      if (cachedResult) {
        console.log(`[PDF Service] ⚠️  PDF served from cache (cacheKey: ${cacheKey})`);
        console.log(`[PDF Service] ⚠️  This means fillPDFFields() was NOT called - using cached PDF`);
        // Check if Check Box11 fields are in the fields array
        const checkBox11Fields = fields.filter(f => f.fieldName === 'Check Box11.' || f.fieldName === 'Check Box11');
        if (checkBox11Fields.length > 0) {
          console.log(`[PDF Service] ⚠️  Check Box11 fields in request:`, checkBox11Fields.map(f => ({ fieldName: f.fieldName, value: f.value, text: f.text })));
          console.log(`[PDF Service] ⚠️  But using cached PDF which may have old values!`);
          console.log(`[PDF Service] ⚠️  Consider clearing cache or regenerating to update checkbox values`);
        }
        return cachedResult;
      }
    } catch (error) {
      // Continue if cache check fails
      console.log(`[PDF Service] Cache check failed, continuing with generation:`, error.message);
    }
  } else {
    console.log(`[PDF Service] ⚠️  Cache bypassed - generating new PDF (bypassCache=true)`);
  }
  
  console.log(`[PDF Service] ✓ Cache miss - generating new PDF`);
  console.log(`[PDF Service] ✓ fillPDFFields() will be called`);
  
  // Use default template path if not provided (now pointing to Supabase storage)
  const templateFile = templatePath || 'templates/ResaleCertificate_Template.pdf';
  
  try {
    // 1. Load PDF template from Supabase storage
    const templateBytes = await loadTemplatePDF(templateFile, supabase, bucketName);
    
    // 2. Load PDF document with pdf-lib
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    // 3. Fill form fields
    fillPDFFields(pdfDoc, fields);
    
    // 4. Save PDF to bytes
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    
    // 5. Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(outputPdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // 6. Get public URL
    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
    const result = { data, publicURL: publicUrl };
    
    // Cache the result for 1 hour (3600 seconds) - with dynamic import
    try {
      const { setCache } = await import('./redis.js');
      await setCache(cacheKey, result, 3600);
    } catch (error) {
      // Continue if caching fails
    }
    
    return result;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  mapFormDataToPDFFields,
  downloadPDF,
  getAvailablePDFFields,
  savePDFToStorage,
  uploadFileToSupabase,
  generateAndUploadPDF,
};
