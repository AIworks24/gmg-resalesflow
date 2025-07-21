import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use service role key for server-side operations (no auth required)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Test if bucket0 exists and is accessible
    const { data: files, error } = await supabase.storage
      .from('bucket0')
      .list('resale-certificates', { limit: 1 });
    
    if (error) {
      return res.status(500).json({ 
        error: 'Bucket access failed', 
        details: error.message,
        bucketName: 'bucket0',
        status: 'error'
      });
    }
    
    return res.status(200).json({ 
      message: 'Bucket0 is accessible', 
      bucketName: 'bucket0',
      folderPath: 'resale-certificates',
      status: 'success'
    });
    
  } catch (error) {
    console.error('Error testing bucket:', error);
    return res.status(500).json({ 
      error: error.message,
      bucketName: 'bucket0',
      status: 'error'
    });
  }
} 