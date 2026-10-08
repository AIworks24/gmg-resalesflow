import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { deleteCachePattern } from '../../../lib/redis';
import { PROPERTY_STATUS } from '../../../lib/propertyStatus';
import { publishPropertyStatusChanged } from '../../../lib/realtime/publish';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Publish a property (make it orderable by requesters) or move it back to draft.
 * Admin only — a DB trigger also rejects status changes from non-admin sessions.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, email')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin role required' });
    }

    const { propertyId, status } = req.body || {};
    if (!propertyId) {
      return res.status(400).json({ error: 'propertyId is required' });
    }
    if (status !== PROPERTY_STATUS.DRAFT && status !== PROPERTY_STATUS.PUBLISHED) {
      return res.status(400).json({ error: "status must be 'draft' or 'published'" });
    }

    const { data: property, error: fetchError } = await supabaseAdmin
      .from('hoa_properties')
      .select('id, status, deleted_at')
      .eq('id', propertyId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (property.deleted_at) {
      return res.status(400).json({ error: 'Retired properties must be restored before changing publish status' });
    }

    const patch = {
      status,
      status_changed_by: user.id,
      updated_at: new Date().toISOString(),
    };
    if (status === PROPERTY_STATUS.PUBLISHED && property.status !== PROPERTY_STATUS.PUBLISHED) {
      patch.published_at = new Date().toISOString();
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('hoa_properties')
      .update(patch)
      .eq('id', propertyId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    try {
      await deleteCachePattern('admin:hoa_properties:*');
    } catch (cacheError) {
      console.warn('Could not invalidate property cache:', cacheError);
    }

    // Tell admins currently working on this property who changed it (realtime toast)
    if (property.status !== status) {
      const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
        || profile.email || user.email || 'An admin';
      await publishPropertyStatusChanged({
        propertyId: updated.id,
        propertyName: updated.name,
        status,
        actorId: user.id,
        actorName,
      });
    }

    return res.status(200).json({ success: true, property: updated });
  } catch (error) {
    console.error('Error setting property status:', error);
    return res.status(500).json({ error: error.message || 'Failed to update property status' });
  }
}
