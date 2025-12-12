// Document ordering utility
// This defines the order in which documents should appear and be sent in emails

// Default order based on DOCUMENT_TYPES array order (excluding public_offering_statement)
const DEFAULT_DOCUMENT_ORDER = [
  'architectural_guidelines',
  'declaration_ccrs',
  'resolutions_policies',
  'balance_sheet',
  'budget',
  'reserve_study',
  'insurance_dec',
  'board_minutes',
  'association_minutes',
  'annual_registration',
  'articles_incorporation',
  'bylaws',
  'litigation',
  'rules_regulations',
  'special_assessments',
  'unit_ledger',
  'welcome_package',
  // Note: public_offering_statement is excluded from email sending
];

// Get document order for EMAIL SENDING (ignores property-specific order)
// Priority: Environment variable > Default order
export const getEmailDocumentOrder = () => {
  // Check if custom order is defined in environment variable
  const customOrder = process.env.NEXT_PUBLIC_DOCUMENT_SEND_ORDER;
  
  if (customOrder) {
    try {
      // Parse comma-separated list of document keys
      return customOrder.split(',').map(key => key.trim());
    } catch (error) {
      console.warn('Invalid DOCUMENT_SEND_ORDER format, using default order');
    }
  }
  
  // Default order
  return DEFAULT_DOCUMENT_ORDER;
};

// Get document order for DISPLAY (uses property-specific order if available)
// Priority: Property-specific order > Environment variable > Default order
export const getDisplayDocumentOrder = async (propertyId = null, supabaseClient = null) => {
  // Priority 1: Check for property-specific order in database (for display only)
  if (propertyId && supabaseClient) {
    try {
      const { data: property, error } = await supabaseClient
        .from('hoa_properties')
        .select('document_order')
        .eq('id', propertyId)
        .single();

      if (!error && property?.document_order && Array.isArray(property.document_order) && property.document_order.length > 0) {
        return property.document_order;
      }
    } catch (error) {
      console.warn('Error fetching property-specific document order:', error);
    }
  }

  // Priority 2: Check if custom order is defined in environment variable
  const customOrder = process.env.NEXT_PUBLIC_DOCUMENT_SEND_ORDER;
  
  if (customOrder) {
    try {
      // Parse comma-separated list of document keys
      return customOrder.split(',').map(key => key.trim());
    } catch (error) {
      console.warn('Invalid DOCUMENT_SEND_ORDER format, using default order');
    }
  }
  
  // Priority 3: Default order
  return DEFAULT_DOCUMENT_ORDER;
};

// Sort documents by the EMAIL order (for sending emails - ignores property-specific order)
export const sortDocumentsByEmailOrder = (documents) => {
  const order = getEmailDocumentOrder();
  const orderMap = new Map(order.map((key, index) => [key, index]));
  
  return [...documents].sort((a, b) => {
    const aOrder = orderMap.get(a.document_key);
    const bOrder = orderMap.get(b.document_key);
    
    // Documents in the order list come first
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder;
    }
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    
    // Documents not in the order list are sorted by created_at (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
};

// Sort documents by the DISPLAY order (for UI display - uses property-specific order)
export const sortDocumentsByDisplayOrder = async (documents, propertyId = null, supabaseClient = null) => {
  const order = await getDisplayDocumentOrder(propertyId, supabaseClient);
  const orderMap = new Map(order.map((key, index) => [key, index]));
  
  return [...documents].sort((a, b) => {
    const aOrder = orderMap.get(a.document_key);
    const bOrder = orderMap.get(b.document_key);
    
    // Documents in the order list come first
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder;
    }
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    
    // Documents not in the order list are sorted by created_at (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
};

