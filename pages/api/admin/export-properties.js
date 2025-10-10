import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Get all properties
    const { data: properties, error } = await supabase
      .from('hoa_properties')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Generate CSV content
    const csvHeaders = [
      'ID',
      'Name',
      'Location',
      'Property Owner Name',
      'Property Owner Email',
      'Property Owner Phone',
      'Management Contact',
      'Phone',
      'Email',
      'Special Requirements',
      'Documents Folder',
      'Active',
      'Created Date',
      'Updated Date'
    ];

    const csvRows = properties.map(property => [
      property.id,
      property.name || '',
      property.location || '',
      property.property_owner_name || '',
      property.property_owner_email || '',
      property.property_owner_phone || '',
      property.management_contact || '',
      property.phone || '',
      property.email || '',
      property.special_requirements || '',
      property.documents_folder || '',
      property.active ? 'Yes' : 'No',
      new Date(property.created_at).toLocaleDateString(),
      new Date(property.updated_at).toLocaleDateString()
    ]);

    // Convert to CSV format
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => 
        row.map(field => {
          // Escape commas and quotes in CSV fields
          const stringField = String(field || '');
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      )
    ].join('\n');

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="properties-export-${new Date().toISOString().split('T')[0]}.csv"`);
    
    return res.status(200).send(csvContent);

  } catch (error) {
    console.error('Export properties error:', error);
    return res.status(500).json({ error: 'Failed to export properties' });
  }
}