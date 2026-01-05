/**
 * Google Gemini Service - FREE AI provider for PDF analysis
 * Uses Google Gemini API (@google/genai) for image analysis and text generation
 * Based on official docs: https://ai.google.dev/gemini-api/docs
 */

let geminiClient = null;

/**
 * Initialize Gemini client using the new @google/genai SDK
 * @returns {Object} - Gemini client instance
 */
function initGemini() {
  if (geminiClient) {
    return geminiClient;
  }
  
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }
  
  try {
    // Use new SDK (@google/genai) - official recommended SDK
    const { GoogleGenAI } = require('@google/genai');
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY
    });
    return geminiClient;
  } catch (error) {
    throw new Error(`Failed to initialize Gemini client: ${error.message}`);
  }
}

/**
 * Convert image buffer to base64 for Gemini API
 * @param {Buffer|Uint8Array} imageBuffer - Image buffer
 * @returns {string} - Base64 encoded image
 */
function imageBufferToBase64(imageBuffer) {
  if (Buffer.isBuffer(imageBuffer)) {
    return imageBuffer.toString('base64');
  }
  if (imageBuffer instanceof Uint8Array) {
    return Buffer.from(imageBuffer).toString('base64');
  }
  throw new Error('Invalid image buffer type');
}

/**
 * Analyze image with Gemini Vision API
 * @param {Buffer|Uint8Array} imageBuffer - Image buffer (PNG, JPEG, etc.)
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeImageWithGemini(imageBuffer, prompt) {
  try {
    const client = initGemini();
    
    // Convert image to base64
    const imageBase64 = imageBufferToBase64(imageBuffer);
    
    // Determine MIME type (default to PNG)
    const mimeType = 'image/png'; // Can be enhanced to detect actual type
    
    let text;
    
    // Use new SDK (@google/genai) - official API structure
    // Try models in order: gemini-2.5-flash (free tier) -> gemini-3-flash-preview -> gemini-2.5-pro
    const modelNames = [
      process.env.GEMINI_MODEL_VISION || process.env.GEMINI_MODEL,
      'gemini-2.5-flash',        // Free tier, fast, multimodal
      'gemini-3-flash-preview',  // Latest preview
      'gemini-2.5-pro',          // More capable
      'gemini-2.5-flash-lite'    // Fastest, most cost-efficient
    ].filter(Boolean);
    
    let lastError;
    for (const modelName of modelNames) {
      try {
        // New SDK API: client.models.generateContent()
        const result = await client.models.generateContent({
          model: modelName,
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            }
          ]
        });
        
        // Response structure: result.text (property, not method)
        text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          console.log(`✅ Successfully used model: ${modelName}`);
          break; // Success, exit loop
        }
      } catch (error) {
        lastError = error;
        const errorMsg = error.message || error.toString();
        console.warn(`Model ${modelName} failed: ${errorMsg.substring(0, 100)}`);
        continue;
      }
    }
    
    if (!text) {
      throw lastError || new Error('All model attempts failed');
    }
    
    // Try to parse JSON response
    let parsedData;
    try {
      // Extract JSON from response if wrapped in markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1]);
      } else {
        parsedData = JSON.parse(text);
      }
    } catch (parseError) {
      // If not JSON, return as text
      parsedData = { text, raw: true };
    }
    
    return {
      success: true,
      provider: 'gemini',
      data: parsedData,
      model: 'gemini-2.5-flash',
      rawResponse: text
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Gemini analysis failed: ${error.message}`);
  }
}

/**
 * Generate field mapping suggestions using Gemini
 * @param {Array<string>} pdfFieldNames - PDF field names
 * @param {Object} context - Additional context
 * @returns {Promise<Array>} - Mapping suggestions
 */
export async function generateFieldMappingsGemini(pdfFieldNames, context = {}) {
  try {
    const client = initGemini();
    
    // Build prompt for field mapping
    const applicationFields = context.applicationFields || [
      'buyerName', 'sellerName', 'propertyAddress', 'hoaProperty',
      'closingDate', 'salePrice', 'submitterName', 'submitterEmail', 'packageType'
    ];
    
    const prompt = `Given these PDF field names from a lender questionnaire or form,
suggest the best mapping to application data fields.

PDF Fields:
${pdfFieldNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Available Application Fields:
${applicationFields.map((field, i) => `- ${field}`).join('\n')}

Return a JSON array with suggestions and confidence scores (0-1).

Example format:
[
  {
    "pdfField": "Borrower_Name",
    "suggestedMapping": "buyerName",
    "confidence": 0.95,
    "reasoning": "Direct match - borrower is the buyer"
  }
]

Return only valid JSON, no markdown formatting.`;
    
    let text;
    
    // Use new SDK (@google/genai) - official API structure
    // Try models in order: gemini-2.5-flash (free tier) -> gemini-3-flash-preview -> gemini-2.5-pro
    const modelNames = [
      process.env.GEMINI_MODEL_TEXT || process.env.GEMINI_MODEL,
      'gemini-2.5-flash',        // Free tier, fast, multimodal
      'gemini-3-flash-preview',  // Latest preview
      'gemini-2.5-pro',          // More capable
      'gemini-2.5-flash-lite'    // Fastest, most cost-efficient
    ].filter(Boolean);
    
    let lastError;
    for (const modelName of modelNames) {
      try {
        // New SDK API: client.models.generateContent()
        const result = await client.models.generateContent({
          model: modelName,
          contents: [{ text: prompt }]
        });
        
        // Response structure: result.text (property, not method)
        text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          console.log(`✅ Successfully used model: ${modelName}`);
          break; // Success, exit loop
        }
      } catch (error) {
        lastError = error;
        const errorMsg = error.message || error.toString();
        console.warn(`Model ${modelName} failed: ${errorMsg.substring(0, 100)}`);
        continue;
      }
    }
    
    if (!text) {
      throw lastError || new Error('All model attempts failed');
    }
    
    // Parse JSON response
    let mappings;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        mappings = JSON.parse(jsonMatch[1]);
      } else {
        mappings = JSON.parse(text);
      }
    } catch (parseError) {
      throw new Error(`Failed to parse Gemini response: ${parseError.message}. Response: ${text}`);
    }
    
    // Ensure it's an array
    if (!Array.isArray(mappings)) {
      mappings = [mappings];
    }
    
    return mappings.map(mapping => ({
      pdfField: mapping.pdfField || mapping.field,
      suggestedMapping: mapping.suggestedMapping || mapping.mapping,
      confidence: mapping.confidence || 0.5,
      reasoning: mapping.reasoning || 'No reasoning provided'
    }));
  } catch (error) {
    console.error('Gemini field mapping error:', error);
    throw new Error(`Gemini field mapping failed: ${error.message}`);
  }
}

/**
 * Check if Gemini is available
 * @returns {boolean}
 */
export function isGeminiAvailable() {
  return !!process.env.GOOGLE_API_KEY;
}

