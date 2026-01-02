/**
 * Mapping Suggestions Service - Generate intelligent field mapping suggestions
 * Combines rule-based matching with AI-powered semantic analysis
 */

/**
 * Rule-based field name matching (fast, ~60% accuracy)
 * @param {string} fieldName - PDF field name
 * @returns {string|null} - Suggested application field name or null
 */
export function applyRuleBasedMatching(fieldName) {
  if (!fieldName) return null;
  
  const normalized = fieldName.toLowerCase().replace(/[_\s-]/g, '');
  
  // Common field name patterns
  const patterns = {
    // Buyer/Borrower fields
    buyer: 'buyerName',
    borrower: 'buyerName',
    purchasername: 'buyerName',
    purchasernam: 'buyerName',
    buyername: 'buyerName',
    borrowername: 'buyerName',
    
    // Seller fields
    seller: 'sellerName',
    sellername: 'sellerName',
    ownername: 'sellerName',
    currentowner: 'sellerName',
    
    // Property fields
    propertyaddress: 'propertyAddress',
    propertyaddr: 'propertyAddress',
    address: 'propertyAddress',
    property: 'propertyAddress',
    lotaddress: 'propertyAddress',
    unitaddress: 'propertyAddress',
    
    // HOA/Association fields
    hoa: 'hoaProperty',
    association: 'hoaProperty',
    community: 'hoaProperty',
    hoaname: 'hoaProperty',
    associationname: 'hoaProperty',
    communityname: 'hoaProperty',
    
    // Date fields
    closingdate: 'closingDate',
    closing: 'closingDate',
    estimatedclosing: 'closingDate',
    expectedclosing: 'closingDate',
    date: 'closingDate',
    
    // Price fields
    saleprice: 'salePrice',
    price: 'salePrice',
    purchaseprice: 'salePrice',
    amount: 'salePrice',
    
    // Submitter fields
    submittername: 'submitterName',
    requestorname: 'submitterName',
    contactname: 'submitterName',
    submitteremail: 'submitterEmail',
    requestoremail: 'submitterEmail',
    contactemail: 'submitterEmail',
    email: 'submitterEmail',
    
    // Package type
    packagetype: 'packageType',
    package: 'packageType',
    servicetype: 'packageType'
  };
  
  // Direct match
  if (patterns[normalized]) {
    return patterns[normalized];
  }
  
  // Partial match
  for (const [pattern, mapping] of Object.entries(patterns)) {
    if (normalized.includes(pattern) || pattern.includes(normalized)) {
      return mapping;
    }
  }
  
  return null;
}

/**
 * Calculate confidence score for a mapping
 * @param {Object} pdfField - PDF field object
 * @param {string} appField - Application field name
 * @returns {number} - Confidence score (0-1)
 */
export function calculateConfidence(pdfField, appField) {
  if (!pdfField || !appField) return 0;
  
  const fieldName = (pdfField.name || '').toLowerCase();
  const normalized = fieldName.replace(/[_\s-]/g, '');
  
  // Check rule-based match
  const ruleMatch = applyRuleBasedMatching(fieldName);
  if (ruleMatch === appField) {
    return 0.9; // High confidence for rule-based match
  }
  
  // Semantic similarity (simple word matching)
  const appFieldWords = appField.toLowerCase().split(/(?=[A-Z])/);
  let matches = 0;
  let totalWords = appFieldWords.length;
  
  for (const word of appFieldWords) {
    if (normalized.includes(word.toLowerCase())) {
      matches++;
    }
  }
  
  // Base confidence on word overlap
  const similarity = matches / totalWords;
  
  // Boost confidence if field types match
  let typeBonus = 0;
  if (pdfField.type) {
    const typeMap = {
      'text': ['text', 'email', 'tel'],
      'date': ['date'],
      'number': ['number'],
      'checkbox': ['boolean'],
      'select': ['select', 'dropdown']
    };
    
    // Check if types are compatible
    for (const [pdfType, appTypes] of Object.entries(typeMap)) {
      if (pdfField.type === pdfType && appTypes.includes(pdfField.type)) {
        typeBonus = 0.1;
        break;
      }
    }
  }
  
  return Math.min(0.95, similarity * 0.8 + typeBonus);
}

/**
 * Validate a mapping
 * @param {Object} mapping - Mapping object
 * @returns {Object} - Validation result
 */
export function validateMapping(mapping) {
  const errors = [];
  const warnings = [];
  
  if (!mapping.pdfField) {
    errors.push('PDF field name is required');
  }
  
  if (!mapping.suggestedMapping) {
    warnings.push('No suggested mapping provided');
  }
  
  if (mapping.confidence !== undefined) {
    if (mapping.confidence < 0 || mapping.confidence > 1) {
      errors.push('Confidence score must be between 0 and 1');
    }
    if (mapping.confidence < 0.5) {
      warnings.push('Low confidence mapping - review recommended');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

/**
 * Generate mapping suggestions using hybrid approach
 * @param {Array<Object>} pdfFields - PDF field objects
 * @param {Object} applicationSchema - Application data schema
 * @param {boolean} useAI - Whether to use AI (default: true)
 * @returns {Promise<Array>} - Mapping suggestions
 */
export async function generateMappingSuggestions(pdfFields, applicationSchema = {}, useAI = true) {
  const suggestions = [];
  
  // First pass: Rule-based matching (instant)
  for (const pdfField of pdfFields) {
    const ruleMatch = applyRuleBasedMatching(pdfField.name);
    if (ruleMatch) {
      const confidence = calculateConfidence(pdfField, ruleMatch);
      suggestions.push({
        pdfField: pdfField.name,
        pdfFieldId: pdfField.id,
        suggestedMapping: ruleMatch,
        confidence: confidence,
        method: 'rule-based',
        reasoning: `Rule-based pattern match for "${pdfField.name}"`
      });
    }
  }
  
  // Second pass: AI-powered matching (if enabled and available)
  if (useAI) {
    try {
      const { generateFieldMappings } = await import('./aiProvider.js');
      const aiSuggestions = await generateFieldMappings(
        pdfFields.map(f => f.name),
        { applicationFields: Object.keys(applicationSchema) }
      );
      
      // Merge AI suggestions with rule-based (AI takes precedence for same field)
      for (const aiSuggestion of aiSuggestions) {
        const existingIndex = suggestions.findIndex(
          s => s.pdfField === aiSuggestion.pdfField
        );
        
        if (existingIndex >= 0) {
          // Update existing suggestion if AI confidence is higher
          if (aiSuggestion.confidence > suggestions[existingIndex].confidence) {
            suggestions[existingIndex] = {
              ...suggestions[existingIndex],
              suggestedMapping: aiSuggestion.suggestedMapping,
              confidence: aiSuggestion.confidence,
              method: 'ai-enhanced',
              reasoning: aiSuggestion.reasoning
            };
          }
        } else {
          // Add new AI suggestion
          suggestions.push({
            pdfField: aiSuggestion.pdfField,
            pdfFieldId: pdfFields.find(f => f.name === aiSuggestion.pdfField)?.id,
            suggestedMapping: aiSuggestion.suggestedMapping,
            confidence: aiSuggestion.confidence,
            method: 'ai',
            reasoning: aiSuggestion.reasoning
          });
        }
      }
    } catch (error) {
      console.warn('AI mapping generation failed, using rule-based only:', error);
    }
  }
  
  // Sort by confidence (highest first)
  suggestions.sort((a, b) => b.confidence - a.confidence);
  
  return suggestions;
}

/**
 * Get available application fields schema
 * @returns {Object} - Application fields with descriptions
 */
export function getApplicationFieldsSchema() {
  return {
    buyerName: {
      type: 'string',
      description: 'Buyer/borrower full name',
      examples: ['John Doe', 'Jane Smith']
    },
    sellerName: {
      type: 'string',
      description: 'Seller full name',
      examples: ['Bob Johnson', 'Mary Williams']
    },
    propertyAddress: {
      type: 'string',
      description: 'Property street address',
      examples: ['123 Main St', '456 Oak Ave']
    },
    hoaProperty: {
      type: 'string',
      description: 'HOA community name',
      examples: ['Sunset Hills', 'Oakwood Community']
    },
    closingDate: {
      type: 'date',
      description: 'Transaction closing date (MM/DD/YYYY)',
      examples: ['01/15/2026', '02/28/2026']
    },
    salePrice: {
      type: 'number',
      description: 'Sale price in dollars',
      examples: [350000, 500000]
    },
    submitterName: {
      type: 'string',
      description: 'Form submitter name',
      examples: ['Real Estate Agent', 'Settlement Agent']
    },
    submitterEmail: {
      type: 'string',
      description: 'Form submitter email',
      examples: ['agent@example.com']
    },
    packageType: {
      type: 'string',
      description: 'Package type',
      enum: ['standard', 'rush'],
      examples: ['standard', 'rush']
    }
  };
}

