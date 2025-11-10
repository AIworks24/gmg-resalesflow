import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create a Supabase client with service role key for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify user authentication using auth helpers
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin, staff, or accounting role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    const { propertyId } = req.body;

    if (propertyId) {
      // Sync a specific property
      const { count } = await supabaseAdmin
        .from('linked_properties')
        .select('*', { count: 'exact', head: true })
        .eq('primary_property_id', propertyId);

      const hasLinks = (count || 0) > 0;

      const { error: updateError } = await supabaseAdmin
        .from('hoa_properties')
        .update({ is_multi_community: hasLinks })
        .eq('id', propertyId);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      return res.status(200).json({ 
        success: true,
        propertyId,
        is_multi_community: hasLinks,
        linkedCount: count
      });
    } else {
      // Sync all properties
      const { data: allProperties, error: propertiesError } = await supabaseAdmin
        .from('hoa_properties')
        .select('id');

      if (propertiesError) {
        return res.status(500).json({ error: propertiesError.message });
      }

      let updated = 0;
      let errors = [];

      for (const property of allProperties) {
        const { count } = await supabaseAdmin
          .from('linked_properties')
          .select('*', { count: 'exact', head: true })
          .eq('primary_property_id', property.id);

        const hasLinks = (count || 0) > 0;

        const { error: updateError } = await supabaseAdmin
          .from('hoa_properties')
          .update({ is_multi_community: hasLinks })
          .eq('id', property.id);

        if (updateError) {
          errors.push({ propertyId: property.id, error: updateError.message });
        } else {
          updated++;
        }
      }

      return res.status(200).json({ 
        success: true,
        updated,
        total: allProperties.length,
        errors: errors.length > 0 ? errors : undefined
      });
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}









