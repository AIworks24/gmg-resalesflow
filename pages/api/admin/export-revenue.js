import fs from 'fs';
import path from 'path';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { componentToPdf } from '../../../lib/reactPdfService';
import { ReportPdfDocument } from '../../../lib/components/ReportPdfDocument';

const ALLOWED_ROLES = ['admin', 'accounting'];

// ── Application Type labels ────────────────────────────────────────────────

const APP_TYPE_LABELS = {
  single_property:    'Single Resale',
  multi_community:    'Multi-Community Resale',
  settlement_va:      'Single-Community Settlement',
  settlement_nc:      'Single-Community Settlement',
  mc_settlement_va:   'Multi-Community Settlement',
  mc_settlement_nc:   'Multi-Community Settlement',
  public_offering:    'Builder/Developer – Public Offering',
  info_packet:        'Builder/Developer – Info Packet',
  lender_questionnaire: "Lender's Questionnaire",
};

function appTypeLabel(application_type, package_type) {
  const base = APP_TYPE_LABELS[application_type] || 'Single-Community Resale';
  return package_type === 'rush' ? `${base} (Rush)` : base;
}

function isMultiCommunity(application_type) {
  return (
    application_type === 'multi_community' ||
    application_type === 'mc_settlement_va' ||
    application_type === 'mc_settlement_nc' ||
    (application_type || '').startsWith('mc_')
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeCSV(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function fmt(amount) {
  if (amount == null || amount === '' || Number(amount) === 0) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function fmtAlways(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function fmtDate(ds) {
  if (!ds) return '';
  return new Date(ds).toLocaleDateString('en-US');
}

function periodLabel(dateStart, dateEnd) {
  if (dateStart && dateEnd) {
    return `${new Date(dateStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${new Date(dateEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  return 'All Time';
}

function restructureNote(app) {
  if (!app.correction_metadata) return '';
  const m = app.correction_metadata;
  if (m.oldPrimaryPropertyName && m.newPrimaryPropertyName) {
    return `Restructured: ${m.oldPrimaryPropertyName} → ${m.newPrimaryPropertyName}`;
  }
  return 'Restructured';
}

// ── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { format = 'csv', dateStart, dateEnd } = req.query;

    let query = supabase
      .from('applications')
      .select(`
        id, created_at, property_address, package_type, application_type,
        total_amount, payment_status,
        submitter_name, submitter_email, correction_metadata,
        hoa_properties(name)
      `)
      .eq('payment_status', 'completed')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (dateStart) query = query.gte('created_at', dateStart);
    if (dateEnd)   query = query.lte('created_at', dateEnd);

    const { data: apps, error } = await query;
    if (error) throw error;

    const totalRevenue = apps.reduce((s, a) => s + parseFloat(a.total_amount || 0), 0);
    const avgRevenue   = apps.length ? totalRevenue / apps.length : 0;

    // Per-community rollup (by HOA property name)
    const communityMap = {};
    for (const a of apps) {
      const name = a.hoa_properties?.name || 'Unknown';
      if (!communityMap[name]) communityMap[name] = { community: name, count: 0, revenue: 0 };
      communityMap[name].count += 1;
      communityMap[name].revenue += parseFloat(a.total_amount || 0);
    }
    const byComm = Object.values(communityMap).sort((a, b) => b.revenue - a.revenue);

    const period  = periodLabel(dateStart, dateEnd);
    const dateStr = new Date().toISOString().split('T')[0];

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const headers = [
        'Date', 'Application ID', 'Community', 'Application Type',
        'Total', 'Restructured', 'Property Address',
      ];

      const rows = apps.map((a) => [
        fmtDate(a.created_at),
        a.id,
        a.hoa_properties?.name || '',
        appTypeLabel(a.application_type, a.package_type),
        a.total_amount || '0',
        restructureNote(a),
        a.property_address || '',
      ]);

      const csv = [
        `# Revenue Report — ${period}`,
        `# Generated: ${new Date().toLocaleDateString('en-US')}`,
        `# Total Gross Revenue: ${fmtAlways(totalRevenue)} | Applications: ${apps.length} | Avg: ${fmtAlways(avgRevenue)}`,
        '',
        headers.map(escapeCSV).join(','),
        ...rows.map((r) => r.map(escapeCSV).join(',')),
        '',
        '# Per-Community Revenue Summary',
        ['Community', 'Applications', 'Total Revenue', 'Avg per Application'].map(escapeCSV).join(','),
        ...byComm.map((c) => [c.community, c.count, c.revenue.toFixed(2), (c.revenue / c.count).toFixed(2)].map(escapeCSV).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${dateStr}.csv"`);
      return res.status(200).send(csv);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
      if (fs.existsSync(logoPath)) {
        logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
      }
    } catch { /* logo optional */ }

    const kpis = [
      { label: 'Total Gross Revenue', value: fmtAlways(totalRevenue) },
      { label: 'Total Applications',  value: apps.length.toLocaleString() },
      { label: 'Avg per Application', value: fmtAlways(avgRevenue) },
    ];

    const detailColumns = [
      { label: 'Date',             key: 'date',      width: 1.2 },
      { label: 'Application ID',   key: 'id',        width: 1.5 },
      { label: 'Community',        key: 'community', width: 2.5 },
      { label: 'Application Type', key: 'appType',   width: 3 },
      { label: 'Total',            key: 'total',     width: 1.2 },
      { label: 'Property Address', key: 'address',   width: 1.8 },
    ];

    const detailRows = apps.map((a) => ({
      date:      fmtDate(a.created_at),
      id:        String(a.id),
      community: a.hoa_properties?.name || '',
      appType:   appTypeLabel(a.application_type, a.package_type) + (restructureNote(a) ? ' ✦' : ''),
      total:     fmtAlways(a.total_amount),
      address:   a.property_address || '',
    }));

    // Restructured applications section
    const restructuredApps = apps.filter((a) => !!a.correction_metadata);
    const restColumns = [
      { label: 'App ID',    key: 'id',       width: 1.2 },
      { label: 'Date',      key: 'date',     width: 1.5 },
      { label: 'Change',    key: 'change',   width: 5 },
      { label: 'Total',     key: 'total',    width: 1.5 },
    ];
    const restRows = restructuredApps.map((a) => ({
      id:     String(a.id),
      date:   fmtDate(a.created_at),
      change: restructureNote(a),
      total:  fmtAlways(a.total_amount),
    }));

    const sections = [
      { title: 'Transaction Detail', columns: detailColumns, rows: detailRows },
      { title: 'Per-Community Revenue Summary', columns: [
        { label: 'Community',           key: 'community', width: 3 },
        { label: 'Applications',        key: 'count',     width: 1.5 },
        { label: 'Total Revenue',       key: 'revenue',   width: 2 },
        { label: 'Avg per Application', key: 'avg',       width: 2 },
      ], rows: byComm.map((c) => ({
        community: c.community,
        count:     c.count.toLocaleString(),
        revenue:   fmtAlways(c.revenue),
        avg:       fmtAlways(c.revenue / c.count),
      })) },
      ...(restRows.length ? [{ title: 'Restructured Applications', columns: restColumns, rows: restRows }] : []),
    ];

    const pdfBuffer = await componentToPdf(ReportPdfDocument, {
      title:       'Revenue Report',
      subtitle:    'Completed payments only',
      period,
      generatedAt: new Date().toISOString(),
      logoBase64,
      kpis,
      sections,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${dateStr}.pdf"`);
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('[export-revenue]', err);
    return res.status(500).json({ error: 'Failed to export revenue report', message: err.message });
  }
}
