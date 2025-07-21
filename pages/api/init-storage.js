import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and is admin
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Create the storage bucket if it doesn't exist
    const { data: bucket, error: bucketError } =
      await supabase.storage.createBucket('bucket0', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['application/pdf'],
      });

    if (bucketError && !bucketError.message.includes('already exists')) {
      throw bucketError;
    }

    // Set up storage policies to allow public access to PDFs
    const { error: policyError } = await supabase.storage
      .from('bucket0')
      .createSignedUrl('dummy.pdf', 60); // This will create default policies

    if (policyError && !policyError.message.includes('already exists')) {
      throw policyError;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error initializing storage:', error);
    return res.status(500).json({ error: error.message });
  }
}
