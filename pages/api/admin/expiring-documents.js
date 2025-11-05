import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin role (only admin can see all properties)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get query parameter for expiration window (default: 30 days)
    // This allows showing documents expiring within a certain timeframe
    const expirationWindowDays = parseInt(req.query.days || '30');

    // Calculate date range: show documents expiring within the window or already expired
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + expirationWindowDays);
    
    const futureDateStr = futureDate.toISOString().split('T')[0];

    // Get documents with expiration dates within the window or already expired
    // Show documents that are expired or expiring within the window
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
      .not('expiration_date', 'is', null)
      .eq('is_not_applicable', false)
      .lte('expiration_date', futureDateStr) // Include expired and upcoming within window
      .order('expiration_date', { ascending: true });

    if (error) throw error;

    // Filter out documents without properties and calculate days until expiration
    const documentsWithDetails = expiringDocs
      .filter(doc => doc.property && doc.property.id)
      .map(doc => {
        const expirationDate = new Date(doc.expiration_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expirationDate.setHours(0, 0, 0, 0);
        
        const daysUntilExpiration = Math.ceil(
          (expirationDate - today) / (1000 * 60 * 60 * 24)
        );

        return {
          id: doc.id,
          document_name: doc.document_name,
          document_key: doc.document_key,
          expiration_date: doc.expiration_date,
          days_until_expiration: daysUntilExpiration,
          file_path: doc.file_path,
          property_id: doc.property.id,
          property_name: doc.property.name,
          property_location: doc.property.location,
          property_owner_email: doc.property.property_owner_email,
          property_owner_name: doc.property.property_owner_name,
          created_at: doc.created_at,
          updated_at: doc.updated_at
        };
      });

    // Sort by expiration date (already sorted by DB, but ensure consistency)
    documentsWithDetails.sort((a, b) => {
      const dateA = new Date(a.expiration_date);
      const dateB = new Date(b.expiration_date);
      return dateA - dateB;
    });

    res.status(200).json({
      success: true,
      count: documentsWithDetails.length,
      documents: documentsWithDetails
    });

  } catch (error) {
    console.error('Error fetching expiring documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch expiring documents',
      details: error.message 
    });
  }
}

