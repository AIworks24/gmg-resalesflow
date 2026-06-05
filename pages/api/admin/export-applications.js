import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
    const { dateRange } = req.body;

    // Build query
    let query = supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data)
      `)
      .order('created_at', { ascending: false });

    // Apply date filter if provided
    if (dateRange?.start && dateRange?.end) {
      query = query
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);
    }

    const { data: applications, error } = await query;

    if (error) {
      throw error;
    }

    const getApplicationTypeLabel = (app) => {
      if (app.impersonation_metadata) return 'Impersonated';
      switch (app.application_type) {
        case 'lender_questionnaire': return 'Lender Questionnaire';
        case 'settlement_va':
        case 'settlement_nc':       return 'Single or Multicommunity Settlement';
        case 'public_offering':
        case 'info_packet':         return 'Builder/Developer (Public Offering or Info Packet)';
        default:                    return 'Single or Multicommunity Resale';
      }
    };

    // Generate CSV content
    const csvHeaders = [
      'ID',
      'Created Date',
      'Property Address',
      'Unit Number',
      'HOA Property',
      'Application Type',
      'Submitter Name',
      'Submitter Email',
      'Submitter Phone',
      'Buyer Name',
      'Buyer Email',
      'Buyer Phone',
      'Seller Name',
      'Seller Email',
      'Seller Phone',
      'Sale Price',
      'Closing Date',
      'Package Type',
      'Total Amount',
      'Status',
      'Payment Status',
      'Submitted At',
      'Completed At',
      'Property Owner',
      'Property Owner Email',
      'Notes'
    ];

    const csvRows = applications.map(app => [
      app.id,
      new Date(app.created_at).toLocaleDateString(),
      app.property_address || '',
      app.unit_number || '',
      app.hoa_properties?.name || '',
      getApplicationTypeLabel(app),
      app.submitter_name || '',
      app.submitter_email || '',
      app.submitter_phone || '',
      app.buyer_name || '',
      app.buyer_email || '',
      app.buyer_phone || '',
      app.seller_name || '',
      app.seller_email || '',
      app.seller_phone || '',
      app.sale_price || '',
      app.closing_date || '',
      app.package_type || '',
      app.total_amount || '',
      app.status || '',
      app.payment_status || '',
      app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '',
      app.completed_at ? new Date(app.completed_at).toLocaleDateString() : '',
      app.hoa_properties?.property_owner_name || '',
      app.hoa_properties?.property_owner_email || '',
      app.notes || ''
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
    res.setHeader('Content-Disposition', `attachment; filename="applications-export-${new Date().toISOString().split('T')[0]}.csv"`);
    
    return res.status(200).send(csvContent);

  } catch (error) {
    console.error('Export applications error:', error);
    return res.status(500).json({ error: 'Failed to export applications' });
  }
}