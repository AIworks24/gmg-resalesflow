import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user email from query parameter or auth header
    const userEmail = req.query.email || req.headers['x-user-email'];
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    // Get all documents expiring within 30 days for properties owned by this user
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = thirtyDaysFromNow.toISOString().split('T')[0];

    // Query documents with property info, filtered by property owner email
    const { data: expiringDocs, error } = await supabase
      .from('property_documents')
      .select(`
        *,
        property:property_id (
          id,
          name,
          location,
          property_owner_email,
          property_owner_name
        )
      `)
      .gte('expiration_date', today)
      .lte('expiration_date', thirtyDaysLater)
      .eq('is_not_applicable', false)
      .not('expiration_date', 'is', null);

    if (error) throw error;

    // Filter documents by property owner email (case-insensitive)
    const userExpiringDocs = expiringDocs.filter(doc => {
      if (!doc.property) return false;
      const docEmail = (doc.property.property_owner_email || '').toLowerCase().trim();
      const userEmailLower = userEmail.toLowerCase().trim();
      // Also handle "owner." prefix that might be in the database
      const normalizedDocEmail = docEmail.replace(/^owner\./, '');
      return normalizedDocEmail === userEmailLower;
    });

    // Group documents by property and calculate days until expiration
    const notifications = [];
    const propertyMap = {};

    userExpiringDocs.forEach(doc => {
      if (!doc.property) return;
      
      const propertyId = doc.property.id;
      if (!propertyMap[propertyId]) {
        propertyMap[propertyId] = {
          property_id: propertyId,
          property_name: doc.property.name,
          property_location: doc.property.location,
          documents: []
        };
      }

      const daysUntilExpiration = Math.ceil(
        (new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      propertyMap[propertyId].documents.push({
        document_id: doc.id,
        document_name: doc.document_name,
        document_key: doc.document_key,
        expiration_date: doc.expiration_date,
        days_until_expiration: daysUntilExpiration,
        file_path: doc.file_path
      });
    });

    // Convert to array and sort by nearest expiration
    notifications.push(...Object.values(propertyMap));
    notifications.forEach(notification => {
      notification.documents.sort((a, b) => 
        new Date(a.expiration_date) - new Date(b.expiration_date)
      );
    });
    notifications.sort((a, b) => {
      const aNearest = a.documents[0]?.days_until_expiration || 999;
      const bNearest = b.documents[0]?.days_until_expiration || 999;
      return aNearest - bNearest;
    });

    // Count total notifications
    const totalCount = userExpiringDocs.length;

    res.status(200).json({
      success: true,
      count: totalCount,
      notifications: notifications
    });

  } catch (error) {
    console.error('Error fetching expiring documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch expiring documents',
      details: error.message 
    });
  }
}











