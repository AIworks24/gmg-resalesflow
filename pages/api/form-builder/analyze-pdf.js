import formidable from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { extractPDFFields, convertPDFPageToImage } from '../../../lib/ai/pdfAnalyzer';
import { generateMappingSuggestions, getApplicationFieldsSchema } from '../../../lib/ai/mappingSuggestions';
import { analyzeWithFallback } from '../../../lib/ai/aiProvider';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Convert extracted PDF fields to form structure
 * @param {Array} extractedFields - Fields from PDF analyzer
 * @param {Array} mappingSuggestions - AI-generated mapping suggestions
 * @param {string} formTitle - Form title from PDF metadata or AI
 * @returns {Object} - Form structure with sections and fields
 */
function convertToFormStructure(extractedFields, mappingSuggestions = [], formTitle = '') {
  // Group fields by section (for now, put all in one section)
  // In the future, AI could detect sections from PDF structure
  const section = {
    id: `section-${Date.now()}`,
    title: formTitle || 'Form Fields',
    layout: 'two-column',
    fields: []
  };

  // Create a map of mapping suggestions by PDF field name
  const mappingMap = {};
  mappingSuggestions.forEach(suggestion => {
    mappingMap[suggestion.pdfField] = suggestion;
  });

  // Convert PDF fields to form fields
  extractedFields.forEach((pdfField, index) => {
    const mapping = mappingMap[pdfField.name];
    
    // Determine field type
    let fieldType = pdfField.type || 'text';
    if (fieldType === 'checkbox') fieldType = 'checkbox';
    else if (fieldType === 'radio') fieldType = 'radio';
    else if (fieldType === 'select') fieldType = 'select';
    else if (fieldType === 'text') {
      // Try to infer better type from field name
      const name = (pdfField.name || '').toLowerCase();
      if (name.includes('email')) fieldType = 'email';
      else if (name.includes('phone') || name.includes('tel')) fieldType = 'tel';
      else if (name.includes('date')) fieldType = 'date';
      else if (name.includes('price') || name.includes('amount') || name.includes('cost')) {
        fieldType = 'number';
      }
    }

    // Generate field label from PDF field name
    // Use formatted label if available (from AI), otherwise format the name
    let fieldLabel = pdfField.name;
    
    // If we have a formatted name from AI, use it; otherwise format the original name
    if (pdfField.formattedName) {
      fieldLabel = pdfField.formattedName;
    } else {
      // Import and use label formatter
      const { formatLabel } = require('../../../lib/utils/labelFormatter.js');
      fieldLabel = formatLabel(pdfField.name);
    }

    const formField = {
      id: `field-${Date.now()}-${index}`,
      key: `field_${index + 1}`,
      label: fieldLabel,
      type: fieldType,
      width: fieldType === 'textarea' ? 'full' : 'half',
      required: pdfField.required || false,
      placeholder: '',
      defaultValue: pdfField.value || '',
      // Use originalPdfName if available (for mapping), otherwise use name
      // originalName is set when we improve labels from heuristics
      pdfMapping: pdfField.originalPdfName || pdfField.originalName || pdfField.name, // Map to original PDF field name
      dataSource: mapping?.suggestedMapping || '', // AI-suggested data source
      currency: fieldType === 'number' && (pdfField.name.toLowerCase().includes('price') || pdfField.name.toLowerCase().includes('amount')),
      options: fieldType === 'select' || fieldType === 'radio' ? [] : undefined
    };

    section.fields.push(formField);
  });

  return {
    sections: [section]
  };
}

/**
 * Shared function to analyze PDF - used by both sync and async modes
 * Extracts fields, runs AI vision if needed, generates mappings, and returns form structure
 */
async function analyzePDF(pdfBuffer) {
  // Extract PDF fields using pdf-lib
  console.log('Extracting PDF fields...');
  let extractedFields = [];
  let metadata = {};
  let formTitle = '';
  let needsAIVision = false;
  
  try {
    const result = await extractPDFFields(pdfBuffer);
    extractedFields = result.fields || [];
    metadata = result.metadata || {};
    formTitle = metadata.formTitle || '';
    console.log(`Extracted ${extractedFields.length} fields from PDF`);
    
    // Check if field names look like internal PDF field names (not user-friendly)
    if (extractedFields.length > 0) {
      const hasGenericNames = extractedFields.some(field => {
        const name = (field.name || '').toLowerCase();
        return name.includes('question') || 
               name.length < 4 || 
               /^[a-z]{1,4}$/.test(name) || 
               /^(clear|print|area|adop|nop)/.test(name);
      });
      
      if (hasGenericNames || !formTitle) {
        needsAIVision = true;
        console.log('Field names appear to be internal PDF field names, using AI vision to get better labels...');
      }
    }
  } catch (error) {
    console.warn('PDF field extraction failed:', error.message);
    needsAIVision = true;
  }

  // If no fillable fields found OR field names are generic, use AI vision to analyze PDF as image
  if (!extractedFields || extractedFields.length === 0 || needsAIVision) {
    console.log('No fillable fields found or field names are generic, attempting AI vision analysis...');
    
    try {
      // Convert first page of PDF to image
      let imageBuffer;
      try {
        imageBuffer = await convertPDFPageToImage(pdfBuffer, 1, 2.0);
      } catch (conversionError) {
        if (conversionError.message.includes('worker') || conversionError.message.includes('GlobalWorkerOptions')) {
          console.warn('PDF to image conversion failed due to worker issues. Improving field labels from names...');
          
          if (extractedFields && extractedFields.length > 0) {
            console.log('Improving field labels from extracted field names...');
            const { formatLabel } = require('../../../lib/utils/labelFormatter.js');
            
            extractedFields = extractedFields.map(field => {
              let improvedLabel = formatLabel(field.name);
              
              return {
                ...field,
                name: improvedLabel,
                originalName: field.originalName || field.name
              };
            });
            
            if (!formTitle && metadata.formTitle) {
              formTitle = metadata.formTitle;
            } else if (!formTitle) {
              formTitle = 'Form';
            }
            
            console.log(`Using improved field labels. Form will be created with ${extractedFields.length} fields.`);
            imageBuffer = null;
          } else {
            throw conversionError;
          }
        } else {
          throw conversionError;
        }
      }
      
      // Only use AI vision if we successfully got an image
      if (imageBuffer) {
        const originalFields = [...extractedFields];
        
        // Build AI vision prompt
        const existingFieldsInfo = extractedFields.length > 0 
          ? `\n\nNote: The PDF has ${extractedFields.length} fillable form fields with these internal names: ${extractedFields.map(f => f.originalName || f.name).join(', ')}. Please match the visible labels on the form to these fields.`
          : '';
        
        const visionPrompt = `You are analyzing a PDF form to extract fields for a web form builder. Your output must be properly formatted for web forms.

AVAILABLE FIELD TYPES AND THEIR USE CASES:
- "text": Single-line text input (names, addresses, IDs, permit numbers, etc.)
- "textarea": Multi-line text input (descriptions, detailed information, long text)
- "email": Email address input (with validation)
- "tel" or "phone": Phone number input (with formatting)
- "date": Date picker (birth dates, expiration dates, transaction dates)
- "number": Numeric input (quantities, amounts, prices - can have currency formatting)
- "select": Dropdown selection (when form shows a list of options to choose from)
- "radio": Radio button group (when multiple options are shown as radio buttons)
- "checkbox": Checkbox (yes/no, agree/disagree, terms acceptance - supports conditional logic)
- "signature": Signature field (for signing documents - draw or upload)
- "label": Read-only text label (for instructions, headers, or non-input text)

CONDITIONAL LOGIC CAPABILITIES:
- Checkboxes can show/hide other fields or sections based on their state
- If a checkbox says "I agree" or "Check if applicable", it likely controls visibility of related fields
- Look for patterns like "If yes, provide..." or "Check this box to show additional fields"

LABEL FORMATTING RULES:
- Format labels properly: "NAME OF PURCHASER" → "Name of Purchaser"
- "TELEPHONE NUMBER" → "Telephone Number"
- "SELLER'S PERMIT" → "Seller's Permit"
- Split concatenated words: "NAMEOFPURCHASER" → "Name of Purchaser"
- Capitalize properly: First letter of each word, except articles/prepositions
- Remove excessive capitalization but preserve proper nouns

${existingFieldsInfo}

Return a JSON object with:
1. "formTitle": The title of the form (properly formatted, e.g., "California Resale Certificate")
2. "fields": Array of field objects, each with:
   - "label": The visible label/text next to the field (PROPERLY FORMATTED for web forms - not all caps, split concatenated words)
   - "type": Field type (choose from the list above based on the field's purpose)
   - "required": boolean if field appears required (look for asterisks, "required" text, or mandatory indicators)
   - "description": Any additional context, instructions, or hints about conditional logic

CRITICAL REQUIREMENTS:
- Extract ACTUAL visible labels from the form
- FORMAT labels properly for web forms (not all caps, split words, proper capitalization)
- Choose appropriate field types based on the field's purpose and appearance
- If you see checkboxes that might control other fields, note this in the description
- Count ALL input fields visible on the form
- Use "textarea" for multi-line text areas
- Use "tel" or "phone" for telephone/phone number fields
- Use "date" for any date fields
- Use "number" for numeric fields (quantities, amounts)
- Use "select" or "radio" if options are visible on the form
- Use "checkbox" for checkboxes (especially if they might control visibility)`;

        const aiResult = await analyzeWithFallback(imageBuffer, visionPrompt);
        
        if (aiResult.success && aiResult.data) {
          try {
            const aiData = aiResult.data.text ? JSON.parse(aiResult.data.text) : aiResult.data;
            
            if (aiData.error || (aiData.formTitle && aiData.formTitle.includes('Error'))) {
              console.warn('AI vision returned an error:', aiData.error || aiData.formTitle);
              if (originalFields.length > 0) {
                extractedFields = originalFields;
              }
            } else {
              if (aiData.formTitle && !aiData.formTitle.includes('Error') && !aiData.formTitle.includes('unreadable')) {
                formTitle = aiData.formTitle.trim();
                metadata.formTitle = formTitle;
                console.log(`✅ AI extracted form title: "${formTitle}"`);
              } else if (!formTitle && metadata.formTitle && !metadata.formTitle.includes('Error')) {
                formTitle = metadata.formTitle.trim();
                console.log(`📄 Using metadata form title: "${formTitle}"`);
              }
              
              if (aiData.fields && Array.isArray(aiData.fields) && aiData.fields.length > 0) {
                const { formatLabel } = await import('../../../lib/utils/labelFormatter.js');
                const existingFields = originalFields.length > 0 ? originalFields : [];
                
                extractedFields = aiData.fields.map((field, index) => {
                  let fieldName = field.label || `Field ${index + 1}`;
                  fieldName = formatLabel(fieldName);
                  
                  const originalPdfFieldName = existingFields[index]?.originalName || existingFields[index]?.name || fieldName;
                  
                  return {
                    id: `field-${Date.now()}-${index}`,
                    name: fieldName,
                    formattedName: fieldName,
                    originalPdfName: originalPdfFieldName,
                    type: field.type || 'text',
                    required: field.required || false,
                    value: null,
                    page: 1,
                    description: field.description || ''
                  };
                });
                
                console.log(`AI vision extracted ${extractedFields.length} fields from PDF image with properly formatted labels`);
              } else {
                extractedFields = originalFields;
              }
            }
          } catch (parseError) {
            console.error('Failed to parse AI vision response:', parseError);
            extractedFields = originalFields;
          }
        } else {
          extractedFields = originalFields;
          if (extractedFields.length > 0) {
            const { formatLabel } = require('../../../lib/utils/labelFormatter.js');
            extractedFields = extractedFields.map(field => {
              let improvedLabel = formatLabel(field.name);
              return {
                ...field,
                name: improvedLabel,
                originalName: field.originalName || field.name
              };
            });
          }
        }
      }
    } catch (visionError) {
      console.error('AI vision analysis failed:', visionError);
      console.log('Continuing with extracted fields despite AI vision failure');
    }
  }
  
  // If still no fields, throw error
  if (!extractedFields || extractedFields.length === 0) {
    throw new Error('No form fields found in PDF');
  }

  // Generate mapping suggestions
  let mappingSuggestions = [];
  try {
    const applicationSchema = getApplicationFieldsSchema();
    mappingSuggestions = await generateMappingSuggestions(
      extractedFields,
      applicationSchema,
      true
    );
    console.log(`Generated ${mappingSuggestions.length} mapping suggestions`);
  } catch (aiError) {
    console.warn('AI mapping generation failed:', aiError.message);
  }

  // Convert to form structure
  const formStructure = convertToFormStructure(extractedFields, mappingSuggestions, formTitle);
  
  return {
    formStructure,
    formTitle: formTitle || metadata.formTitle || 'Untitled Form',
    metadata: {
      ...metadata,
      formTitle: formTitle || metadata.formTitle,
      extractedFieldsCount: extractedFields.length,
      mappingSuggestionsCount: mappingSuggestions.length
    },
    extractedFields: extractedFields.slice(0, 10),
    mappingSuggestions: mappingSuggestions.slice(0, 10)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const asyncMode = fields.async && (Array.isArray(fields.async) ? fields.async[0] : fields.async) === 'true';

    if (!file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    // Validate file type
    const fileExt = '.' + file.originalFilename.split('.').pop().toLowerCase();
    if (fileExt !== '.pdf') {
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
    }

    // Read PDF file
    const pdfBuffer = fs.readFileSync(file.filepath);

    // If async mode, create job and process in background
    if (asyncMode) {
      // Get user ID from request (if available)
      const userId = req.headers['x-user-id'] || null;
      
      // Upload PDF to storage first
      const timestamp = Date.now();
      const fileName = `form-templates/${timestamp}_${file.originalFilename}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('bucket0')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Error uploading PDF to storage:', uploadError);
        fs.unlinkSync(file.filepath);
        return res.status(500).json({ error: 'Failed to upload PDF' });
      }

      // Create job
      const { data: job, error: jobError } = await supabase
        .from('ai_processing_jobs')
        .insert({
          user_id: userId,
          job_type: 'pdf_analysis',
          status: 'pending',
          input_data: {
            pdfPath: uploadData.path,
            fileName: file.originalFilename
          }
        })
        .select()
        .single();

      if (jobError) {
        console.error('Error creating job:', jobError);
        fs.unlinkSync(file.filepath);
        return res.status(500).json({ error: 'Failed to create analysis job' });
      }

      // Process in background (non-blocking)
      processPDFAnalysis(job.id, pdfBuffer, uploadData.path).catch(error => {
        console.error('Background PDF analysis failed:', error);
      });

      // Clean up temp file
      fs.unlinkSync(file.filepath);

      // Return job ID immediately
      return res.status(202).json({
        success: true,
        jobId: job.id,
        status: 'pending',
        message: 'PDF analysis started. Poll job status for results.'
      });
    }

    // Synchronous mode - use shared analyzePDF function
    let result;
    try {
      result = await analyzePDF(pdfBuffer);
    } catch (error) {
      // Handle canvas installation error specifically
      if (error.message.includes('Canvas package not installed')) {
        return res.status(500).json({
          error: 'PDF to image conversion requires canvas package',
          message: 'To enable AI vision analysis for PDFs, please install the canvas package.',
          installation: 'Run: npm install canvas',
          note: 'Note: Canvas requires system dependencies. On macOS: brew install pkg-config cairo pango libpng jpeg giflib librsvg. On Ubuntu/Debian: sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev',
          fallback: 'Alternatively, use the Visual Form Builder to create a form from scratch, or ensure your PDF has interactive form fields with proper names.'
        });
      }
      
      // Handle no fields found error
      if (error.message.includes('No form fields found')) {
        return res.status(400).json({
          error: 'No form fields found in PDF',
          message: 'This PDF does not appear to contain form fields. Please upload a PDF with interactive form fields, or use the Visual Form Builder to create a form from scratch.',
          metadata: result?.metadata || {}
        });
      }
      
      throw error;
    }

    const { formStructure, formTitle, metadata } = result;

    // Upload PDF to Supabase storage for later use
    const syncTimestamp = Date.now();
    const syncFileName = `form-templates/${syncTimestamp}_${file.originalFilename}`;
    
    const { data: syncUploadData, error: syncUploadError } = await supabase.storage
      .from('bucket0')
      .upload(syncFileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (syncUploadError) {
      console.error('Error uploading PDF to storage:', syncUploadError);
      // Continue anyway - the analysis is complete
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    // Return results
    return res.status(200).json({
      success: true,
      formStructure: result.formStructure,
      formTitle: result.formTitle,
      pdfPath: syncUploadData?.path || syncFileName,
      metadata: result.metadata,
      extractedFields: result.extractedFields,
      mappingSuggestions: result.mappingSuggestions
    });

  } catch (error) {
    console.error('PDF analysis error:', error);
    return res.status(500).json({
      error: 'Failed to analyze PDF',
      message: error.message
    });
  }
}

/**
 * Process PDF analysis in background (for async jobs)
 * Uses the shared analyzePDF function
 */
async function processPDFAnalysis(jobId, pdfBuffer, pdfPath) {
  try {
    // Update job status to processing
    await supabase
      .from('ai_processing_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Run analysis using shared function
    const result = await analyzePDF(pdfBuffer);

    // Update job with results
    await supabase
      .from('ai_processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: {
          ...result,
          pdfPath
        }
      })
      .eq('id', jobId);

    console.log(`✅ Background job ${jobId} completed successfully`);

  } catch (error) {
    console.error('PDF analysis job failed:', error);
    await supabase
      .from('ai_processing_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: error.message || 'Unknown error occurred during PDF analysis'
      })
      .eq('id', jobId);
  }
}

