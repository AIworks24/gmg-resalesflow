/**
 * AI Provider Manager - Unified interface for multiple AI providers
 * Supports Google Gemini (FREE) and OpenAI (Premium) with automatic fallback
 */

/**
 * Select AI provider based on configuration
 * @returns {string} - 'gemini', 'openai', or 'mock'
 */
export function selectAIProvider() {
  const configured = process.env.AI_PROVIDER || 'auto';
  
  if (configured === 'auto') {
    // Auto-select based on available keys
    if (process.env.GOOGLE_API_KEY) return 'gemini';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return 'mock'; // Fallback to mock if no keys
  }
  
  return configured; // 'gemini', 'openai', or 'mock'
}

/**
 * Get status of available AI providers
 * @returns {Object} - Status of each provider
 */
export function getProviderStatus() {
  return {
    gemini: {
      available: !!process.env.GOOGLE_API_KEY,
      configured: !!process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-pro-vision'
    },
    openai: {
      available: !!process.env.OPENAI_API_KEY,
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL_VISION || 'gpt-4-vision-preview'
    },
    mock: {
      available: true,
      configured: true,
      model: 'mock'
    }
  };
}

/**
 * Analyze image with AI (unified interface)
 * @param {Buffer|Uint8Array} imageBuffer - Image buffer
 * @param {string} prompt - Analysis prompt
 * @param {string} provider - 'gemini', 'openai', or 'mock'
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeWithAI(imageBuffer, prompt, provider = null) {
  const selectedProvider = provider || selectAIProvider();
  
  try {
    switch (selectedProvider) {
      case 'gemini':
        const { analyzeImageWithGemini } = await import('./geminiService.js');
        return await analyzeImageWithGemini(imageBuffer, prompt);
        
      case 'openai':
        const { analyzeImageWithVision } = await import('./openaiService.js');
        return await analyzeImageWithVision(imageBuffer, prompt);
        
      case 'mock':
        return {
          success: true,
          provider: 'mock',
          data: { message: 'Mock analysis - no AI provider configured' },
          mock: true
        };
        
      default:
        throw new Error(`Unknown AI provider: ${selectedProvider}`);
    }
  } catch (error) {
    console.error(`AI analysis failed with ${selectedProvider}:`, error);
    throw error;
  }
}

/**
 * Analyze with automatic fallback if primary provider fails
 * @param {Buffer|Uint8Array} imageBuffer - Image buffer
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeWithFallback(imageBuffer, prompt) {
  const primary = selectAIProvider();
  const enableFallback = process.env.ENABLE_AI_FALLBACK === 'true';
  
  try {
    return await analyzeWithAI(imageBuffer, prompt, primary);
  } catch (error) {
    if (enableFallback && primary !== 'mock') {
      // Try fallback provider
      const fallback = primary === 'gemini' ? 'openai' : 'gemini';
      console.log(`Primary AI provider (${primary}) failed, trying fallback: ${fallback}`);
      
      try {
        return await analyzeWithAI(imageBuffer, prompt, fallback);
      } catch (fallbackError) {
        console.error(`Fallback provider (${fallback}) also failed:`, fallbackError);
        throw new Error(`Both AI providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
      }
    }
    throw error;
  }
}

/**
 * Generate field mapping suggestions using AI
 * @param {Array<string>} pdfFieldNames - PDF field names
 * @param {Object} context - Additional context (application schema, etc.)
 * @param {string} provider - Optional provider override
 * @returns {Promise<Array>} - Mapping suggestions with confidence scores
 */
export async function generateFieldMappings(pdfFieldNames, context = {}, provider = null) {
  const selectedProvider = provider || selectAIProvider();
  
  try {
    switch (selectedProvider) {
      case 'gemini':
        const { generateFieldMappingsGemini } = await import('./geminiService.js');
        return await generateFieldMappingsGemini(pdfFieldNames, context);
        
      case 'openai':
        const { generateFieldMappings: generateOpenAIMappings } = await import('./openaiService.js');
        return await generateOpenAIMappings(pdfFieldNames, context);
        
      case 'mock':
        // Return mock suggestions based on rule-based matching
        const { applyRuleBasedMatching } = await import('./mappingSuggestions.js');
        return pdfFieldNames.map(fieldName => ({
          pdfField: fieldName,
          suggestedMapping: applyRuleBasedMatching(fieldName) || null,
          confidence: 0.5,
          reasoning: 'Mock provider - rule-based matching only'
        }));
        
      default:
        throw new Error(`Unknown AI provider: ${selectedProvider}`);
    }
  } catch (error) {
    console.error(`Field mapping generation failed with ${selectedProvider}:`, error);
    throw error;
  }
}

/**
 * Check if AI features are available
 * @returns {boolean} - True if at least one AI provider is configured
 */
export function isAIAvailable() {
  const status = getProviderStatus();
  return status.gemini.available || status.openai.available;
}

