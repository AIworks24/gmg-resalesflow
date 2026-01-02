/**
 * Google Gemini Service - FREE AI provider for PDF analysis
 * Uses Google Gemini API (gemini-pro-vision) for image analysis
 */

let geminiClient = null;

/**
 * Initialize Gemini client
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
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
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
    const model = process.env.GEMINI_MODEL || 'gemini-pro-vision';
    const genModel = client.getGenerativeModel({ model });
    
    // Convert image to base64
    const imageBase64 = imageBufferToBase64(imageBuffer);
    
    // Determine MIME type (default to PNG)
    const mimeType = 'image/png'; // Can be enhanced to detect actual type
    
    // Prepare parts for Gemini
    const parts = [
      { text: prompt },
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ];
    
    // Call Gemini API
    const result = await genModel.generateContent({ contents: [{ role: 'user', parts }] });
    const response = await result.response;
    const text = response.text();
    
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
      model: model,
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
    const model = process.env.GEMINI_MODEL || 'gemini-pro';
    const genModel = client.getGenerativeModel({ model });
    
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
    
    const result = await genModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const response = await result.response;
    const text = response.text();
    
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

