import fs from 'fs';
import path from 'path';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { componentToPdf } from '../../../lib/reactPdfService';
import { ReportPdfDocument } from '../../../lib/components/ReportPdfDocument';

const ALLOWED_ROLES = ['admin', 'accounting'];

function escapeCSV(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function periodLabel(dateStart, dateEnd) {
  if (dateStart && dateEnd) {
    return `${new Date(dateStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${new Date(dateEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  return 'All Time';
}

function statusColor(status) {
  if (['completed', 'approved'].includes(status))  return 'green';
  if (['rejected', 'cancelled'].includes(status))  return 'red';
  if (['submitted', 'pending_payment', 'payment_confirmed', 'awaiting_property_owner_response'].includes(status)) return 'yellow';
  return null;
}

const STATUS_LABELS = {
  draft:                            'Draft',
  submitted:                        'Submitted',
  pending_payment:                  'Pending Payment',
  payment_confirmed:                'Payment Confirmed',
  awaiting_property_owner_response: 'Awaiting Owner',
  under_review:                     'Under Review',
  compliance_pending:               'Compliance Pending',
  compliance_completed:             'Compliance Completed',
  documents_generated:              'Docs Generated',
  approved:                         'Approved',
  completed:                        'Completed',
  rejected:                         'Rejected',
  cancelled:                        'Cancelled',
};

const statusLabel = (s) => STATUS_LABELS[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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
      .select('id, status, payment_status, total_amount, submitted_at, completed_at')
      .is('deleted_at', null);

    if (dateStart) query = query.gte('created_at', dateStart);
    if (dateEnd)   query = query.lte('created_at', dateEnd);

    const { data: apps, error } = await query;
    if (error) throw error;

    // Roll up by status
    const statusMap = {};
    for (const a of apps) {
      const st = a.status || 'unknown';
      if (!statusMap[st]) statusMap[st] = { status: st, count: 0, revenue: 0 };
      statusMap[st].count += 1;
      if (a.payment_status === 'completed' && a.total_amount) {
        statusMap[st].revenue += parseFloat(a.total_amount);
      }
    }

    const statusRows = Object.values(statusMap).sort((a, b) => b.count - a.count);
    const total = apps.length;

    // Avg turnaround for completed
    const turnaroundMs = apps
      .filter((a) => a.submitted_at && a.completed_at)
      .map((a) => new Date(a.completed_at) - new Date(a.submitted_at))
      .filter((d) => d > 0);
    const avgTurnaround = turnaroundMs.length
      ? Math.round((turnaroundMs.reduce((a, b) => a + b, 0) / turnaroundMs.length) / (1000 * 60 * 60 * 24) * 10) / 10
      : null;

    const completedCount = statusMap['completed']?.count || 0;
    const period = periodLabel(dateStart, dateEnd);
    const dateStr = new Date().toISOString().split('T')[0];

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const headers = ['Status', 'Count', '% of Total', 'Revenue'];
      const rows = statusRows.map((r) => [
        statusLabel(r.status),
        r.count,
        total ? `${((r.count / total) * 100).toFixed(1)}%` : '0%',
        r.revenue.toFixed(2),
      ]);

      const csv = [
        `# Status Summary Report — ${period}`,
        `# Generated: ${new Date().toLocaleDateString('en-US')}`,
        `# Total: ${total} | Completed: ${completedCount} | Avg Turnaround: ${avgTurnaround != null ? avgTurnaround + ' days' : 'N/A'}`,
        '',
        headers.map(escapeCSV).join(','),
        ...rows.map((r) => r.map(escapeCSV).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="status-summary-${dateStr}.csv"`);
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
      { label: 'Total Applications', value: total.toLocaleString() },
      { label: 'Completed',          value: completedCount.toLocaleString() },
      { label: 'Avg Turnaround',     value: avgTurnaround != null ? `${avgTurnaround} days` : 'N/A', sub: 'Submitted → Completed' },
    ];

    const columns = [
      { label: 'Status',      key: 'statusLabel', width: 3 },
      { label: 'Count',       key: 'count',       width: 1 },
      { label: '% of Total',  key: 'pct',         width: 1.5 },
      { label: 'Revenue',     key: 'revenue',     width: 2 },
    ];

    const rows = statusRows.map((r) => ({
      statusLabel: statusLabel(r.status),
      count:       r.count.toLocaleString(),
      pct:         total ? `${((r.count / total) * 100).toFixed(1)}%` : '0%',
      revenue:     fmt(r.revenue),
      _status:     r.status,
    }));

    const sections = [
      {
        title:   'Application Status Breakdown',
        columns,
        rows,
        colorKey: (row) => statusColor(row._status),
      },
    ];

    const pdfBuffer = await componentToPdf(ReportPdfDocument, {
      title:       'Status Summary Report',
      subtitle:    'Application counts by status with revenue',
      period,
      generatedAt: new Date().toISOString(),
      logoBase64,
      kpis,
      sections,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="status-summary-${dateStr}.pdf"`);
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('[export-status-summary]', err);
    return res.status(500).json({ error: 'Failed to export status summary', message: err.message });
  }
}
