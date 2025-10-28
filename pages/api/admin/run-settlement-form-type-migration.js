import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Drop existing constraint if it exists
    await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE property_owner_forms 
        DROP CONSTRAINT IF EXISTS property_owner_forms_form_type_check;
      `
    });

    // Add new constraint with settlement_form
    await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE property_owner_forms 
        ADD CONSTRAINT property_owner_forms_form_type_check 
        CHECK (form_type IN ('inspection_form', 'resale_certificate', 'settlement_form'));
      `
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Settlement form type constraint added successfully' 
    });
  } catch (error) {
    console.error('Error running migration:', error);
    return res.status(500).json({ error: error.message });
  }
}
