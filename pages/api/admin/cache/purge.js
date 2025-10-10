import { deleteCachePattern, deleteCache } from '../../../../lib/redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook secret
    const webhookSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.CACHE_PURGE_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error('CACHE_PURGE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (webhookSecret !== expectedSecret) {
      console.warn('Invalid webhook secret received');
      return res.status(401).json({ error: 'Unauthorized - Invalid webhook secret' });
    }

    const { table, type } = req.body;

    console.log('🧹 Cache purge request:', { table, type });

    // Purge caches based on the table that was modified
    let purged = [];

    if (table === 'applications' || !table) {
      // Purge all application-related caches (using pattern for dynamic keys)
      await deleteCachePattern('admin:applications:*');
      await deleteCache('admin:dashboard:summary');
      purged.push('admin:applications:*');
      purged.push('admin:dashboard:summary');
    }

    if (table === 'hoa_properties' || !table) {
      // Purge all property-related caches (including paginated ones)
      await deleteCachePattern('admin:hoa_properties:*');
      purged.push('admin:hoa_properties:*');
    }

    if (table === 'property_owner_forms' || !table) {
      // Forms affect applications and dashboard, so purge both caches
      await deleteCachePattern('admin:applications:*');
      await deleteCache('admin:dashboard:summary');
      purged.push('admin:applications:*');
      purged.push('admin:dashboard:summary');
    }

    if (table === 'notifications' || !table) {
      // Notifications affect applications and dashboard, so purge both caches
      await deleteCachePattern('admin:applications:*');
      await deleteCache('admin:dashboard:summary');
      purged.push('admin:applications:*');
      purged.push('admin:dashboard:summary');
    }

    if (table === 'profiles' || !table) {
      // Purge all user-related caches (including paginated ones)
      await deleteCachePattern('admin:users:*');
      purged.push('admin:users:*');
    }

    // If no specific table, purge everything
    if (!table) {
      await deleteCachePattern('admin:*');
      await deleteCachePattern('query:*');
      await deleteCachePattern('supabase:*');
      purged.push('admin:*', 'query:*', 'supabase:*');
    } else {
      // Also purge generic query caches for this table
      await deleteCachePattern(`query:${table}:*`);
      await deleteCachePattern(`supabase:${table}:*`);
      purged.push(`query:${table}:*`, `supabase:${table}:*`);
    }

    console.log('✅ Cache purged successfully:', purged);

    return res.status(200).json({ 
      success: true,
      purged,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache purge error:', error);
    return res.status(500).json({ 
      error: 'Failed to purge cache',
      message: error.message 
    });
  }
}
