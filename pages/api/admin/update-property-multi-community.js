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

    const { propertyId, isMultiCommunity } = req.body;

    if (!propertyId || typeof isMultiCommunity !== 'boolean') {
      return res.status(400).json({ error: 'Missing required fields: propertyId and isMultiCommunity' });
    }

    // Convert propertyId to number if it's a string
    const propertyIdNum = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    
    if (isNaN(propertyIdNum)) {
      return res.status(400).json({ error: `Invalid propertyId: ${propertyId}` });
    }

    console.log(`🔍 Updating property ${propertyIdNum} to is_multi_community=${isMultiCommunity}`);

    // First, verify the property exists
    const { data: existingProperty, error: checkError } = await supabaseAdmin
      .from('hoa_properties')
      .select('id, name, is_multi_community')
      .eq('id', propertyIdNum)
      .single();

    if (checkError || !existingProperty) {
      console.error('Property not found:', { propertyId: propertyIdNum, error: checkError });
      return res.status(404).json({ error: `Property ${propertyIdNum} not found`, details: checkError?.message });
    }

    console.log(`✅ Property found: ${existingProperty.name} (current is_multi_community=${existingProperty.is_multi_community})`);

    // If already set to the desired value, return success
    if (existingProperty.is_multi_community === isMultiCommunity) {
      console.log(`ℹ️ Property already has is_multi_community=${isMultiCommunity}, skipping update`);
      return res.status(200).json({ 
        success: true,
        property: existingProperty,
        message: 'Already set to desired value'
      });
    }

    // Update property using service role (bypasses RLS)
    // Match the pattern used elsewhere: update without select, then fetch separately
    const { error: updateError } = await supabaseAdmin
      .from('hoa_properties')
      .update({ 
        is_multi_community: isMultiCommunity,
        updated_at: new Date().toISOString()
      })
      .eq('id', propertyIdNum);

    if (updateError) {
      console.error('❌ Error updating property:', updateError);
      return res.status(500).json({ error: updateError.message, details: updateError });
    }

    console.log(`✅ Update command executed successfully for property ${propertyIdNum}`);

    // Fetch the updated property to verify and return
    const { data: updatedProperty, error: fetchError } = await supabaseAdmin
      .from('hoa_properties')
      .select('id, name, is_multi_community')
      .eq('id', propertyIdNum)
      .single();

    if (fetchError || !updatedProperty) {
      console.warn('⚠️ Could not fetch updated property for verification, but update succeeded:', fetchError);
      // Don't fail - the update might have succeeded even if we can't verify
      // Return success with the existing property data
      return res.status(200).json({ 
        success: true,
        property: { ...existingProperty, is_multi_community: isMultiCommunity },
        warning: 'Update succeeded but verification failed'
      });
    }

    console.log(`✅ Property updated: ${updatedProperty.name} (is_multi_community=${updatedProperty.is_multi_community})`);

    return res.status(200).json({ 
      success: true,
      property: updatedProperty
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

