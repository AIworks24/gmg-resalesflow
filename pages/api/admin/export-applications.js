import fs from 'fs';
import path from 'path';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { componentToPdf } from '../../../lib/reactPdfService';
import { ReportPdfDocument } from '../../../lib/components/ReportPdfDocument';
import { applyPropertyScope, getPropertyName, resolvePropertyScope } from '../../../lib/reports/propertyFilter';
import { excludeDrafts } from '../../../lib/reports/reportFilters';

const ALLOWED_ROLES = ['admin', 'accounting'];

// The PDF is a scannable summary, not the full 26-column audit trail — a very
// large range would otherwise run to hundreds of pages. Rollups still cover
// every row; the CSV remains uncapped and complete.
const PDF_ROW_CAP = 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US');
}

function fmtMoney(v) {
  const n = parseFloat(v || 0);
  return `$${n.toFixed(2)}`;
}

function periodLabel(dateRange) {
  if (dateRange?.start && dateRange?.end) {
    const f = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${f(dateRange.start)} – ${f(dateRange.end)}`;
  }
  return 'All Time';
}

// Roll a list up into [{ label, count, revenue }], sorted by count desc
function rollup(apps, keyFn) {
  const map = {};
  for (const a of apps) {
    const label = keyFn(a) || 'Unknown';
    if (!map[label]) map[label] = { label, count: 0, revenue: 0 };
    map[label].count += 1;
    if (a.payment_status === 'completed' && a.total_amount) {
      map[label].revenue += parseFloat(a.total_amount);
    }
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { dateRange, propertyId, format = 'csv' } = req.body;

    // Build query
    let query = supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Drafts are never business activity — keep them out of every report
    query = excludeDrafts(query);

    // Apply date filter if provided
    if (dateRange?.start && dateRange?.end) {
      query = query
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);
    }

    // Scope to one community (primary or multi-community member) if provided
    const propertyScope = await resolvePropertyScope(supabase, propertyId);
    query = applyPropertyScope(query, propertyScope);

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

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      let logoBase64 = '';
      try {
        const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
        if (fs.existsSync(logoPath)) {
          logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
        }
      } catch { /* logo optional */ }

      const propertyName = await getPropertyName(supabase, propertyId);
      const scopeLabel   = propertyName ? `Community: ${propertyName}` : 'All Communities';

      // KPIs — computed over every row, not the capped slice
      const completedApps = applications.filter((a) => a.status === 'completed');
      const totalRevenue  = applications.reduce(
        (sum, a) => sum + (a.payment_status === 'completed' ? parseFloat(a.total_amount || 0) : 0),
        0,
      );

      const turnaroundMs = [];
      for (const a of applications) {
        if (a.submitted_at && a.completed_at) {
          const diff = new Date(a.completed_at) - new Date(a.submitted_at);
          if (diff > 0) turnaroundMs.push(diff);
        }
      }
      const avgTurnaroundDays = turnaroundMs.length
        ? Math.round((turnaroundMs.reduce((x, y) => x + y, 0) / turnaroundMs.length) / 86_400_000 * 10) / 10
        : null;

      const kpis = [
        { label: 'Total Applications', value: applications.length.toLocaleString() },
        { label: 'Completed',          value: completedApps.length.toLocaleString() },
        { label: 'Total Revenue',      value: fmtMoney(totalRevenue), sub: 'Completed payments' },
        { label: 'Avg Turnaround',     value: avgTurnaroundDays !== null ? `${avgTurnaroundDays} days` : '—' },
      ];

      // Rollups cover every row
      const byStatus    = rollup(applications, (a) => a.status);
      const byType      = rollup(applications, (a) => getApplicationTypeLabel(a));
      const byCommunity = rollup(applications, (a) => a.hoa_properties?.name);

      const summaryColumns = (firstLabel) => ([
        { label: firstLabel,    key: 'label',   width: 3 },
        { label: 'Applications', key: 'count',   width: 1.2 },
        { label: 'Revenue',      key: 'revenue', width: 1.5 },
      ]);
      const summaryRows = (list) => list.map((r) => ({
        label:   r.label,
        count:   r.count.toLocaleString(),
        revenue: fmtMoney(r.revenue),
      }));

      // Detail table is capped and placed LAST so its repeating header
      // doesn't bleed onto the summary pages.
      const capped  = applications.slice(0, PDF_ROW_CAP);
      const isCapped = applications.length > PDF_ROW_CAP;

      const detailColumns = [
        { label: 'ID',         key: 'id',        width: 0.8 },
        { label: 'Created',    key: 'created',   width: 1.2 },
        { label: 'Community',  key: 'community', width: 2.4 },
        { label: 'Address',    key: 'address',   width: 2.2 },
        { label: 'Type',       key: 'type',      width: 2.6 },
        { label: 'Submitter',  key: 'submitter', width: 1.8 },
        { label: 'Status',     key: 'status',    width: 1.3 },
        { label: 'Payment',    key: 'payment',   width: 1.2 },
        { label: 'Total',      key: 'total',     width: 1.2 },
      ];

      const detailRows = capped.map((a) => ({
        id:        String(a.id),
        created:   fmtDate(a.created_at),
        community: a.hoa_properties?.name || '',
        address:   [a.property_address, a.unit_number].filter(Boolean).join(' #'),
        type:      getApplicationTypeLabel(a),
        submitter: a.submitter_name || '',
        status:    a.status || '',
        payment:   a.payment_status || '',
        total:     fmtMoney(a.total_amount),
      }));

      const sections = [
        { title: 'By Status',           columns: summaryColumns('Status'),    rows: summaryRows(byStatus) },
        { title: 'By Application Type', columns: summaryColumns('Type'),      rows: summaryRows(byType) },
        { title: 'By Community',        columns: summaryColumns('Community'), rows: summaryRows(byCommunity) },
        {
          title: isCapped
            ? `Application Detail (first ${PDF_ROW_CAP.toLocaleString()} of ${applications.length.toLocaleString()})`
            : 'Application Detail',
          columns: detailColumns,
          rows: detailRows,
          repeatHeader: true,
        },
      ];

      const subtitle = isCapped
        ? `${scopeLabel} · detail capped at ${PDF_ROW_CAP.toLocaleString()} rows — use the CSV export for the complete set`
        : scopeLabel;

      const pdfBuffer = await componentToPdf(ReportPdfDocument, {
        title:       'Applications Report',
        subtitle,
        period:      periodLabel(dateRange),
        generatedAt: new Date().toISOString(),
        logoBase64,
        kpis,
        sections,
        orientation: 'landscape',
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="applications-export-${new Date().toISOString().split('T')[0]}.pdf"`);
      return res.status(200).send(pdfBuffer);
    }

    // ── CSV ──────────────────────────────────────────────────────────────────
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
