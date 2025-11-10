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
 * Load PDF template from local filesystem
 * @param {string} templatePath - Path to the PDF template file
 * @returns {Promise<Uint8Array>} - PDF template bytes
 */
async function loadTemplatePDF(templatePath) {
  // Ensure we're on the server side
  if (typeof window !== 'undefined') {
    throw new Error('loadTemplatePDF can only be called server-side');
  }
  
  try {
    const fullPath = path.join(process.cwd(), templatePath);
    const pdfBytes = fs.readFileSync(fullPath);
    return pdfBytes;
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
  try {
    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    
    // Create a map of field names for quick lookup
    const fieldMap = new Map();
    formFields.forEach(field => {
      fieldMap.set(field.getName(), field);
    });
    
    let filledCount = 0;
    let notFoundCount = 0;
    
    // Collect radio group selections first to avoid conflicts
    // Map: groupName -> { option: choice, fieldName: original field name, value: true/false }
    const radioGroupSelections = new Map();
    
    // First pass: collect all radio group choices
    fields.forEach(fieldData => {
      const fieldName = fieldData.fieldName;
      
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
      
      // If field not found, check if it's a radio group choice (e.g., "Group3.Choice1")
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
      
      if (!pdfField) {
        notFoundCount++;
        return;
      }
      
      filledCount++;
      
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
          const checkBox = form.getCheckBox(fieldName);
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
          
          try {
            if (isChecked) {
              checkBox.check();
            } else {
              checkBox.uncheck();
            }
          } catch (error) {
            // Continue if checkbox operation fails
          }
        } else if (fieldType === 'PDFRadioGroup') {
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
 * @param {string} templatePath - Optional path to template PDF (defaults to assets/ResaleCertificate_Template.pdf)
 * @returns {Promise<{ data: object, publicURL: string }>} - The upload result and public URL
 */
async function generateAndUploadPDF(fields, outputPdfPath, supabase, bucketName, templatePath = null) {
  // Generate cache key based on fields content
  const fieldsHash = crypto.createHash('md5').update(JSON.stringify(fields)).digest('hex');
  const cacheKey = `pdf:${fieldsHash}`;
  
  // Check cache first (with dynamic import)
  try {
    const { getCache, setCache } = await import('./redis.js');
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
  } catch (error) {
    // Continue if cache check fails
  }
  
  // Use default template path if not provided
  const templateFile = templatePath || 'assets/ResaleCertificate_Template.pdf';
  
  try {
    // 1. Load PDF template from local filesystem
    const templateBytes = await loadTemplatePDF(templateFile);
    
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
