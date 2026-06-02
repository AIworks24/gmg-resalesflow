import fs from 'fs';
import path from 'path';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { componentToPdf } from '../../../lib/reactPdfService';
import { ReportPdfDocument } from '../../../lib/components/ReportPdfDocument';

function escapeCSV(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function fmtDate(ds) {
  if (!ds) return '';
  return new Date(ds).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function urgencyLabel(days) {
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days}d`;
}

function urgencyColor(days) {
  if (days < 0 || days <= 7) return 'red';
  if (days <= 30)            return 'orange';
  return 'green';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — Admin only' });
    }

    const { format = 'csv', days: daysParam = '30' } = req.query;
    const windowDays = Math.max(1, parseInt(daysParam) || 30);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = new Date(today);
    future.setDate(today.getDate() + windowDays);
    const futureDateStr = future.toISOString().split('T')[0];

    const { data: docs, error } = await supabase
      .from('property_documents')
      .select(`
        id, document_name, document_key, expiration_date,
        property:property_id ( id, name, location, property_owner_email, property_owner_name )
      `)
      .not('expiration_date', 'is', null)
      .eq('is_not_applicable', false)
      .lte('expiration_date', futureDateStr)
      .order('expiration_date', { ascending: true });

    if (error) throw error;

    const documents = docs
      .filter((d) => d.property?.id)
      .map((d) => {
        const exp = new Date(d.expiration_date);
        exp.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        return {
          id:                 d.id,
          document_name:      d.document_name || d.document_key || 'Unknown',
          expiration_date:    d.expiration_date,
          days_until:         daysUntil,
          property_name:      d.property.name || '',
          property_owner:     d.property.property_owner_name || '',
          property_email:     d.property.property_owner_email || '',
          property_location:  d.property.location || '',
        };
      });

    const expiredCount   = documents.filter((d) => d.days_until < 0).length;
    const expiring7Count = documents.filter((d) => d.days_until >= 0 && d.days_until <= 7).length;
    const dateStr        = new Date().toISOString().split('T')[0];

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const headers = ['Document Name', 'Property', 'Owner', 'Owner Email', 'Expiration Date', 'Days Until Expiration', 'Status'];
      const rows = documents.map((d) => [
        d.document_name,
        d.property_name,
        d.property_owner,
        d.property_email,
        fmtDate(d.expiration_date),
        d.days_until,
        urgencyLabel(d.days_until),
      ]);

      const csv = [
        `# Expiring Documents Report — Next ${windowDays} Days`,
        `# Generated: ${new Date().toLocaleDateString('en-US')}`,
        `# Total: ${documents.length} | Expired: ${expiredCount} | Expiring ≤7 days: ${expiring7Count}`,
        '',
        headers.map(escapeCSV).join(','),
        ...rows.map((r) => r.map(escapeCSV).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="expiring-documents-${windowDays}d-${dateStr}.csv"`);
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
      { label: 'Total Documents',    value: documents.length.toLocaleString(), sub: `Within ${windowDays}-day window` },
      { label: 'Expired',            value: expiredCount.toLocaleString() },
      { label: 'Expiring ≤ 30 days', value: documents.filter((d) => d.days_until >= 0 && d.days_until <= 30).length.toLocaleString() },
    ];

    const columns = [
      { label: 'Document Name',   key: 'document_name', width: 3 },
      { label: 'Property',        key: 'property_name', width: 2 },
      { label: 'Owner',           key: 'property_owner', width: 2 },
      { label: 'Expiration Date', key: 'expDate',        width: 1.5 },
      { label: 'Status',          key: 'urgencyLabel',   width: 1.5 },
    ];

    const rows = documents.map((d) => ({
      document_name:  d.document_name,
      property_name:  d.property_name,
      property_owner: d.property_owner,
      expDate:        fmtDate(d.expiration_date),
      urgencyLabel:   urgencyLabel(d.days_until),
      _days:          d.days_until,
    }));

    const sections = [
      {
        title:    `Expiring Documents — Next ${windowDays} Days`,
        columns,
        rows,
        colorKey: (row) => urgencyColor(row._days),
      },
    ];

    const pdfBuffer = await componentToPdf(ReportPdfDocument, {
      title:       'Expiring Documents Report',
      subtitle:    `Documents expiring within the next ${windowDays} days`,
      period:      `Next ${windowDays} days from ${fmtDate(today.toISOString())}`,
      generatedAt: new Date().toISOString(),
      logoBase64,
      kpis,
      sections,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expiring-documents-${windowDays}d-${dateStr}.pdf"`);
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('[export-expiring-documents]', err);
    return res.status(500).json({ error: 'Failed to export expiring documents', message: err.message });
  }
}
