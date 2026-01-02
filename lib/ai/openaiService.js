/**
 * OpenAI Service - Premium AI provider for PDF analysis
 * Uses OpenAI GPT-4 Vision API for high-quality image analysis
 */

let openaiClient = null;

/**
 * Initialize OpenAI client
 * @returns {Object} - OpenAI client instance
 */
function initOpenAI() {
  if (openaiClient) {
    return openaiClient;
  }
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    return openaiClient;
  } catch (error) {
    throw new Error(`Failed to initialize OpenAI client: ${error.message}`);
  }
}

/**
 * Convert image buffer to base64 for OpenAI API
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
 * Analyze image with OpenAI GPT-4 Vision API
 * @param {Buffer|Uint8Array} imageBuffer - Image buffer (PNG, JPEG, etc.)
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeImageWithVision(imageBuffer, prompt, options = {}) {
  try {
    const client = initOpenAI();
    const model = options.model || process.env.OPENAI_MODEL_VISION || 'gpt-4-vision-preview';
    
    // Convert image to base64
    const imageBase64 = imageBufferToBase64(imageBuffer);
    
    // Determine MIME type (default to PNG)
    const mimeType = options.mimeType || 'image/png';
    
    // Call OpenAI Vision API
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7
    });
    
    const content = response.choices[0]?.message?.content || '';
    
    // Try to parse JSON response
    let parsedData;
    try {
      // Extract JSON from response if wrapped in markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1]);
      } else {
        parsedData = JSON.parse(content);
      }
    } catch (parseError) {
      // If not JSON, return as text
      parsedData = { text: content, raw: true };
    }
    
    // Calculate cost (approximate)
    const cost = estimateCost({
      model: model,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0
    });
    
    return {
      success: true,
      provider: 'openai',
      data: parsedData,
      model: model,
      rawResponse: content,
      usage: response.usage,
      estimatedCost: cost
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI analysis failed: ${error.message}`);
  }
}

/**
 * Generate field mapping suggestions using OpenAI
 * @param {Array<string>} pdfFieldNames - PDF field names
 * @param {Object} context - Additional context
 * @returns {Promise<Array>} - Mapping suggestions
 */
export async function generateFieldMappings(pdfFieldNames, context = {}) {
  try {
    const client = initOpenAI();
    const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4-turbo-preview';
    
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
    
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3 // Lower temperature for more consistent mapping
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    
    // Parse JSON response
    let mappings;
    try {
      const parsed = JSON.parse(content);
      // Handle both {mappings: [...]} and [...] formats
      mappings = Array.isArray(parsed) ? parsed : (parsed.mappings || [parsed]);
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}. Response: ${content}`);
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
    console.error('OpenAI field mapping error:', error);
    throw new Error(`OpenAI field mapping failed: ${error.message}`);
  }
}

/**
 * Estimate cost for OpenAI API call
 * @param {Object} params - Usage parameters
 * @returns {number} - Estimated cost in USD
 */
export function estimateCost({ model, inputTokens, outputTokens }) {
  // Pricing as of 2024 (approximate, may vary)
  const pricing = {
    'gpt-4-vision-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-4-turbo-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 }
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4-turbo-preview'];
  const inputCost = (inputTokens || 0) * modelPricing.input;
  const outputCost = (outputTokens || 0) * modelPricing.output;
  
  return inputCost + outputCost;
}

/**
 * Check if OpenAI is available
 * @returns {boolean}
 */
export function isOpenAIAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

