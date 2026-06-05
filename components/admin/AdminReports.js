import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  DollarSign,
  Calendar,
  RefreshCw,
  Building,
  AlertTriangle,
  BarChart3,
  Zap,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Clock,
  Download,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import useAdminAuthStore from '../../stores/adminAuthStore';
import { useApplications } from '../../hooks/useApplications';
import AdminLayout from './AdminLayout';
import useSWR from 'swr';

// ─── formatting helpers ────────────────────────────────────────────────────

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

const formatDate = (ds) => {
  if (!ds) return 'N/A';
  return new Date(ds).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending_payment: 'Pending Payment',
  payment_confirmed: 'Payment Confirmed',
  awaiting_property_owner_response: 'Awaiting Owner',
  under_review: 'Under Review',
  compliance_pending: 'Compliance Pending',
  compliance_completed: 'Compliance Completed',
  documents_generated: 'Docs Generated',
  approved: 'Approved',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  completed:   'bg-green-100 text-green-800',
  approved:    'bg-green-100 text-green-800',
  submitted:   'bg-yellow-100 text-yellow-800',
  pending_payment: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  compliance_pending: 'bg-blue-100 text-blue-800',
  rejected:    'bg-red-100 text-red-800',
  cancelled:   'bg-red-100 text-red-800',
  draft:       'bg-gray-100 text-gray-800',
};

const getStatusBadgeColor = (s) => STATUS_COLORS[s] || 'bg-gray-100 text-gray-800';
const getStatusLabel      = (s) =>
  STATUS_LABELS[s] || (s || '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

// ─── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, subValue, loading }) {
  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-pulse">
        <div className="h-3.5 bg-gray-200 rounded w-24 mb-4" />
        <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
    );
  }
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={`p-2 ${iconBg} rounded-lg`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
  );
}

// ─── monthly trend SVG chart ───────────────────────────────────────────────

function MonthlyTrendChart({ data }) {
  if (!data || data.length === 0) return null;

  const maxCount   = Math.max(...data.map((d) => d.count), 1);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const W = 520, H = 72, LABEL = 16;
  const slotW = W / data.length;
  const countBarW   = Math.max(6, slotW * 0.50);
  const revenueBarW = Math.max(3, slotW * 0.24);

  return (
    <svg
      viewBox={`0 0 ${W} ${H + LABEL}`}
      className="w-full"
      role="img"
      aria-label="Monthly application and revenue trend"
    >
      {data.map((d, i) => {
        const slotX    = i * slotW;
        const countH   = Math.max(2, (d.count   / maxCount)   * H);
        const revenueH = Math.max(1, (d.revenue / maxRevenue) * H);
        const countX   = slotX + (slotW - countBarW - revenueBarW - 2) / 2;
        const revenueX = countX + countBarW + 2;
        const label    = format(new Date(d.month + '-01'), 'MMM');

        return (
          <g key={d.month}>
            <rect
              x={countX} y={H - countH} width={countBarW} height={countH}
              fill="#3b82f6" rx={2} opacity={d.count === 0 ? 0.18 : 0.85}
            >
              <title>{d.count} application{d.count !== 1 ? 's' : ''} — {format(new Date(d.month + '-01'), 'MMMM yyyy')}</title>
            </rect>
            <rect
              x={revenueX} y={H - revenueH} width={revenueBarW} height={revenueH}
              fill="#10b981" rx={2} opacity={d.revenue === 0 ? 0.18 : 0.75}
            >
              <title>{formatCurrency(d.revenue)} — {format(new Date(d.month + '-01'), 'MMMM yyyy')}</title>
            </rect>
            <text
              x={slotX + slotW / 2} y={H + LABEL - 2}
              textAnchor="middle" fontSize={9} fill="#9ca3af"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── standard vs rush pill bar ─────────────────────────────────────────────

function PackageSplitBar({ data }) {
  const standard = data?.find((d) => d.type === 'standard') || { count: 0, rushFeeTotal: 0 };
  const rush     = data?.find((d) => d.type === 'rush')     || { count: 0, rushFeeTotal: 0 };
  const total    = standard.count + rush.count || 1;
  const stdPct   = Math.round((standard.count / total) * 100);
  const rushPct  = 100 - stdPct;

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3.5 bg-gray-100 mb-4">
        {standard.count > 0 && (
          <div
            className="bg-blue-500 h-full transition-all duration-500"
            style={{ width: `${stdPct}%` }}
            title={`Standard ${stdPct}%`}
          />
        )}
        {rush.count > 0 && (
          <div
            className="bg-amber-500 h-full transition-all duration-500"
            style={{ width: `${rushPct}%` }}
            title={`Rush ${rushPct}%`}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="flex items-start gap-2.5">
          <div className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Standard</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">
              {standard.count}
              <span className="text-sm font-normal text-gray-400 ml-1">({stdPct}%)</span>
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <div className="mt-1 w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Rush</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">
              {rush.count}
              <span className="text-sm font-normal text-gray-400 ml-1">({rushPct}%)</span>
            </p>
            {rush.rushFeeTotal > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-1">
                +{formatCurrency(rush.rushFeeTotal)} in rush fees
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── period comparison card ────────────────────────────────────────────────

function DeltaBadge({ pct }) {
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  const positive = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
      {positive
        ? <TrendingUp className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{pct}%
    </span>
  );
}

function ComparisonCard({ label, current, previous, deltaCount, deltaRevenue, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
        <div className="h-3.5 bg-gray-200 rounded w-28 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-16" />
            <div className="h-7 bg-gray-200 rounded w-12" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-16" />
            <div className="h-7 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{label.current} vs {label.previous}</h3>
      </div>

      {/* Applications row */}
      <div className="mb-3 pb-3 border-b border-gray-50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Applications
          </span>
          <DeltaBadge pct={deltaCount} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{current.count.toLocaleString()}</span>
          <span className="text-sm text-gray-400 tabular-nums">vs {previous.count.toLocaleString()}</span>
        </div>
      </div>

      {/* Revenue row */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Revenue
          </span>
          <DeltaBadge pct={deltaRevenue} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(current.revenue)}</span>
          <span className="text-sm text-gray-400 tabular-nums">vs {formatCurrency(previous.revenue)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── expiration helpers ────────────────────────────────────────────────────

const getExpirationStatusColor = (days) => {
  if (days < 0 || days <= 7) return 'bg-red-100 text-red-800';
  if (days <= 30)             return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
};

const getExpirationStatusLabel = (days) => {
  if (days < 0)  return `Expired ${Math.abs(days)} days ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
};

// ─── export reports tab ────────────────────────────────────────────────────

function DownloadButton({ loading, onClick, icon, label, variant = 'secondary' }) {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary:   `${base} bg-[#0f4734] text-white hover:bg-[#0d3d2e] focus:ring-[#0f4734]/40`,
    secondary: `${base} bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-200`,
  };
  return (
    <button onClick={onClick} disabled={loading} className={styles[variant]}>
      {loading
        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        : <Download className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function ReportCard({ title, description, reportKey, hasPdf, handleDownload, exportLoading, extra }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {extra && <div className="mt-2">{extra}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <DownloadButton
          loading={exportLoading[`${reportKey}-csv`]}
          onClick={() => handleDownload(reportKey, 'csv')}
          label="CSV"
        />
        {hasPdf && (
          <DownloadButton
            loading={exportLoading[`${reportKey}-pdf`]}
            onClick={() => handleDownload(reportKey, 'pdf')}
            label="PDF"
            variant="primary"
          />
        )}
      </div>
    </div>
  );
}

function ExportReportsTab({
  exportDateFilter, setExportDateFilter,
  exportCustomRange, setExportCustomRange,
  exportPeriodLabel,
  exportExpiringDays, setExportExpiringDays,
  exportLoading, handleDownload,
}) {
  return (
    <div className="space-y-4">
      {/* Date range control */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Date range:</span>
          </div>
          <div className="relative">
            <select
              value={exportDateFilter}
              onChange={(e) => setExportDateFilter(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
          {exportDateFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={exportCustomRange.startDate}
                onChange={(e) => setExportCustomRange((p) => ({ ...p, startDate: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={exportCustomRange.endDate}
                onChange={(e) => setExportCustomRange((p) => ({ ...p, endDate: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          )}
          <span className="ml-1 text-xs text-gray-400 font-medium bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1">
            {exportPeriodLabel}
          </span>
        </div>
      </div>

      {/* Report cards */}
      <ReportCard
        title="Revenue Report"
        description="Completed payments · fee breakdown · per-community totals"
        reportKey="revenue"
        hasPdf
        handleDownload={handleDownload}
        exportLoading={exportLoading}
      />

      <ReportCard
        title="Applications (full export)"
        description="All fields, all statuses — complete audit trail"
        reportKey="applications"
        hasPdf={false}
        handleDownload={handleDownload}
        exportLoading={exportLoading}
      />

      <ReportCard
        title="Expiring Documents"
        description="Urgency-coded: red = expired/≤7 days · orange = ≤30 days · green = beyond"
        reportKey="expiring-documents"
        hasPdf
        handleDownload={handleDownload}
        exportLoading={exportLoading}
        extra={
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Window:</span>
            <div className="relative">
              <select
                value={exportExpiringDays}
                onChange={(e) => setExportExpiringDays(Number(e.target.value))}
                className="pl-2.5 pr-7 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            </div>
          </div>
        }
      />
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────

const AdminReports = () => {
  const [dateFilter, setDateFilter]         = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [activeTab, setActiveTab]           = useState('reports');
  const [expiringDays, setExpiringDays]     = useState(30);

  // Export Reports tab state
  const [exportDateFilter, setExportDateFilter]         = useState('month');
  const [exportCustomRange, setExportCustomRange]       = useState({ startDate: '', endDate: '' });
  const [exportExpiringDays, setExportExpiringDays]     = useState(30);
  const [exportLoading, setExportLoading]               = useState({});

  const router      = useRouter();
  const { role }    = useAdminAuthStore();

  // ── computed date range ──────────────────────────────────────────────────

  const dateRange = useMemo(() => {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateFilter) {
      case 'today':
        return {
          start: today.toISOString(),
          end:   new Date(today.getTime() + 86_400_000).toISOString(),
        };
      case 'week': {
        const weekStart = new Date(today.getTime() - today.getDay() * 86_400_000);
        return { start: weekStart.toISOString(), end: now.toISOString() };
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      }
      case 'quarter': {
        const q      = Math.floor(now.getMonth() / 3);
        const qStart = new Date(now.getFullYear(), q * 3, 1);
        return { start: qStart.toISOString(), end: now.toISOString() };
      }
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          return {
            start: new Date(customDateRange.startDate).toISOString(),
            end:   new Date(customDateRange.endDate + 'T23:59:59').toISOString(),
          };
        }
        return null;
      default:
        return null;
    }
  }, [dateFilter, customDateRange]);

  // ── summary query (parallel with recent, both auto-fire) ─────────────────

  const summaryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange?.start) p.set('dateStart', dateRange.start);
    if (dateRange?.end)   p.set('dateEnd',   dateRange.end);
    return p.toString();
  }, [dateRange]);

  const summaryQuery = useQuery({
    queryKey: ['reports-summary', summaryParams],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/admin/reports/summary?${summaryParams}`, { signal });
      if (!res.ok) throw new Error('Failed to load summary');
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 2 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
    retry: (count, err) => err?.status >= 500 && count < 2,
  });

  // Stripe revenue — sourced directly from Stripe's balance transactions.
  // Loads in parallel; always live mode regardless of test-mode cookies.
  // Resolves historical payments that pre-date stripe_payment_intent_id storage.
  const stripeQuery = useQuery({
    queryKey: ['stripe-revenue', summaryParams],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/admin/reports/stripe-revenue?${summaryParams}`, { signal });
      if (!res.ok) throw new Error('Failed to load Stripe revenue');
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime:  60 * 60 * 1000, // 1 hour — matches server-side Redis TTL
    gcTime:     2 * 60 * 60 * 1000,
    retry: (count, err) => err?.status >= 500 && count < 1,
  });

  // Comparison is period-independent — always this week/month vs previous
  const comparisonQuery = useQuery({
    queryKey: ['reports-comparison'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/admin/reports/comparison', { signal });
      if (!res.ok) throw new Error('Failed to load comparison');
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
    gcTime:    15 * 60 * 1000,
    retry: (count, err) => err?.status >= 500 && count < 2,
  });

  // ── recent applications (table only, limit 20) ───────────────────────────

  const recentFilters = useMemo(() => ({
    page: 1,
    limit: 20,
    status: 'all',
    search: '',
    dateRange: dateRange
      ? { start: new Date(dateRange.start), end: new Date(dateRange.end) }
      : null,
  }), [dateRange]);

  const recentQuery = useApplications(recentFilters);

  // ── expiring documents (SWR, admin only) ─────────────────────────────────

  const expiringFetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      throw Object.assign(new Error('Failed to fetch expiring documents'), { info, status: res.status });
    }
    return res.json();
  };

  const {
    data:      expiringDocsData,
    error:     expiringDocsError,
    isLoading: isLoadingExpiring,
    mutate:    refetchExpiring,
  } = useSWR(
    role === 'admin' ? `/api/admin/expiring-documents?days=${expiringDays}` : null,
    expiringFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2 * 60 * 1000, // don't refetch more than once every 2 min on focus
    },
  );

  const expiringDocuments = expiringDocsData?.documents || [];

  // ── derived booleans ──────────────────────────────────────────────────────

  const summary             = summaryQuery.data;
  const comparison          = comparisonQuery.data;
  const stripeData          = stripeQuery.data;
  const isLoadingSummary    = summaryQuery.isLoading;
  const isLoadingComparison = comparisonQuery.isLoading;
  const isLoadingStripe     = stripeQuery.isLoading;
  const isRefreshing        = summaryQuery.isFetching || recentQuery.isFetching || comparisonQuery.isFetching || stripeQuery.isFetching;
  const recentApps          = recentQuery.data?.data || [];
  const paidNotSubmitted    = recentApps.filter(
    (app) => app.payment_status === 'completed' && !app.submitted_at
  );

  // ── export date range ─────────────────────────────────────────────────────

  const exportDateRange = useMemo(() => {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (exportDateFilter) {
      case 'today':
        return { start: today.toISOString(), end: new Date(today.getTime() + 86_400_000).toISOString() };
      case 'week': {
        const weekStart = new Date(today.getTime() - today.getDay() * 86_400_000);
        return { start: weekStart.toISOString(), end: now.toISOString() };
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      }
      case 'quarter': {
        const q      = Math.floor(now.getMonth() / 3);
        const qStart = new Date(now.getFullYear(), q * 3, 1);
        return { start: qStart.toISOString(), end: now.toISOString() };
      }
      case 'year': {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return { start: yearStart.toISOString(), end: now.toISOString() };
      }
      case 'custom':
        if (exportCustomRange.startDate && exportCustomRange.endDate) {
          return {
            start: new Date(exportCustomRange.startDate).toISOString(),
            end:   new Date(exportCustomRange.endDate + 'T23:59:59').toISOString(),
          };
        }
        return null;
      default:
        return null;
    }
  }, [exportDateFilter, exportCustomRange]);

  const exportPeriodLabel = useMemo(() => {
    const labels = {
      today:   'Today',
      week:    'This Week',
      month:   'This Month',
      quarter: 'This Quarter',
      year:    'This Year',
      all:     'All Time',
      custom:  exportCustomRange.startDate && exportCustomRange.endDate
        ? `${exportCustomRange.startDate} – ${exportCustomRange.endDate}`
        : 'Custom Range',
    };
    return labels[exportDateFilter] || 'This Month';
  }, [exportDateFilter, exportCustomRange]);

  // ── download handler ──────────────────────────────────────────────────────

  const handleDownload = useCallback(async (reportKey, format, opts = {}) => {
    setExportLoading((prev) => ({ ...prev, [`${reportKey}-${format}`]: true }));
    try {
      if (reportKey === 'applications') {
        const body = exportDateRange
          ? { dateRange: { start: exportDateRange.start, end: exportDateRange.end } }
          : {};
        const res  = await fetch('/api/admin/export-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        triggerDownload(blob, `applications-export.csv`);
        return;
      }

      const params = new URLSearchParams({ format });
      if (reportKey === 'expiring-documents') {
        params.set('days', opts.days ?? exportExpiringDays);
      } else {
        if (exportDateRange?.start) params.set('dateStart', exportDateRange.start);
        if (exportDateRange?.end)   params.set('dateEnd',   exportDateRange.end);
      }

      const endpointMap = {
        revenue:            '/api/admin/export-revenue',
        turnaround:         '/api/admin/export-turnaround',
        'expiring-documents': '/api/admin/export-expiring-documents',
      };

      const res = await fetch(`${endpointMap[reportKey]}?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const ext  = format === 'pdf' ? 'pdf' : 'csv';
      triggerDownload(blob, `${reportKey}-export.${ext}`);
    } catch (err) {
      console.error(`Export ${reportKey} ${format} failed:`, err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExportLoading((prev) => ({ ...prev, [`${reportKey}-${format}`]: false }));
    }
  }, [exportDateRange, exportExpiringDays]);

  function triggerDownload(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    summaryQuery.refetch();
    recentQuery.refetch();
    comparisonQuery.refetch();
    stripeQuery.refetch();
  };


  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-6">

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Performance metrics and data exports</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>

        {/* Tabs — admin + accounting */}
        {(role === 'admin' || role === 'accounting') && (
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'reports',            label: 'Reports & Analytics',                          show: true },
                { id: 'expiring-documents', label: 'Expiring Documents', badge: expiringDocuments.length, show: role === 'admin' },
                { id: 'export-reports',     label: 'Export Reports',                                show: true },
              ].filter((t) => t.show).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'expiring-documents') refetchExpiring();
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.badge > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* ─── EXPIRING DOCUMENTS TAB ─────────────────────────────────────── */}
        {activeTab === 'expiring-documents' && role === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Documents by Expiration</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Across all properties, ordered by expiration date (soonest first)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={expiringDays}
                  onChange={(e) => setExpiringDays(Number(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value={30}>Next 30 days</option>
                  <option value={60}>Next 60 days</option>
                  <option value={90}>Next 90 days</option>
                </select>
                <DownloadButton
                  loading={exportLoading[`expiring-documents-csv`]}
                  onClick={() => handleDownload('expiring-documents', 'csv', { days: expiringDays })}
                  label="CSV"
                />
                <DownloadButton
                  loading={exportLoading[`expiring-documents-pdf`]}
                  onClick={() => handleDownload('expiring-documents', 'pdf', { days: expiringDays })}
                  label="PDF"
                  variant="primary"
                />
              </div>
            </div>

            {isLoadingExpiring ? (
              <div className="text-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Loading expiring documents…</p>
              </div>
            ) : expiringDocsError ? (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading documents</h3>
                <p className="text-gray-500">{expiringDocsError.message}</p>
              </div>
            ) : expiringDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No expiring documents</h3>
                <p className="text-gray-500">All documents are up to date within the selected window.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      {['Expiration Date', 'Status', 'Document Name', 'Property', 'Property Owner', 'Location'].map((h) => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expiringDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        onClick={() => router.push(`/admin/property-files/${doc.property_id}`)}
                        className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatDate(doc.expiration_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getExpirationStatusColor(doc.days_until_expiration)}`}>
                            {getExpirationStatusLabel(doc.days_until_expiration)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {doc.document_name || doc.document_key}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {doc.property_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{doc.property_owner_name || 'N/A'}</div>
                          {doc.property_owner_email && (
                            <div className="text-xs text-gray-500 mt-0.5">{doc.property_owner_email}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {doc.property_location || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── EXPORT REPORTS TAB ─────────────────────────────────────────── */}
        {activeTab === 'export-reports' && (role === 'admin' || role === 'accounting') && (
          <ExportReportsTab
            exportDateFilter={exportDateFilter}
            setExportDateFilter={setExportDateFilter}
            exportCustomRange={exportCustomRange}
            setExportCustomRange={setExportCustomRange}
            exportPeriodLabel={exportPeriodLabel}
            exportExpiringDays={exportExpiringDays}
            setExportExpiringDays={setExportExpiringDays}
            exportLoading={exportLoading}
            handleDownload={handleDownload}
          />
        )}

        {/* ─── REPORTS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <>
            {/* Date filter bar */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Time period:</span>
                </div>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="custom">Custom Range</option>
                </select>

                {dateFilter === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customDateRange.startDate}
                      onChange={(e) => setCustomDateRange((p) => ({ ...p, startDate: e.target.value }))}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <span className="text-gray-400 text-sm">to</span>
                    <input
                      type="date"
                      value={customDateRange.endDate}
                      onChange={(e) => setCustomDateRange((p) => ({ ...p, endDate: e.target.value }))}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}

                {summaryQuery.isError && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    Failed to load summary data
                  </span>
                )}
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
              <KpiCard
                icon={FileText}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                label="Total Applications"
                loading={isLoadingSummary}
                value={summary ? summary.totals.count.toLocaleString() : '—'}
                subValue={dateFilter === 'all' ? 'All time, excluding test transactions' : undefined}
              />
              {/* Revenue card — shows DB estimate instantly, then Stripe ground truth once loaded */}
              <div className={`bg-white p-6 rounded-xl shadow-sm border transition-shadow hover:shadow-md ${
                stripeData ? 'border-emerald-200' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <div className={`p-2 rounded-lg ${stripeData ? 'bg-emerald-50' : 'bg-emerald-50'}`}>
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                </div>
                {(isLoadingSummary && isLoadingStripe) ? (
                  <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-20" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                      {stripeData
                        ? formatCurrency(stripeData.grossRevenue)
                        : summary
                          ? formatCurrency(summary.totals.revenue)
                          : '—'}
                    </p>
                    {stripeData ? (
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        {stripeData.refundedTotal > 0 && (
                          <span className="text-xs text-gray-400">
                            {formatCurrency(stripeData.refundedTotal)} refunded · net {formatCurrency(stripeData.netRevenue)}
                          </span>
                        )}
                      </div>
                    ) : (
                      !isLoadingStripe && (
                        <p className="text-xs text-gray-400 mt-1">Stripe-completed payments only</p>
                      )
                    )}
                  </>
                )}
              </div>
              <KpiCard
                icon={Clock}
                iconBg="bg-violet-50"
                iconColor="text-violet-500"
                label="Avg. Turnaround"
                loading={isLoadingSummary}
                value={
                  summary?.avgTurnaroundDays != null
                    ? `${summary.avgTurnaroundDays}d`
                    : '—'
                }
                subValue="Submitted → Completed"
              />
            </div>

            {/* Period comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <ComparisonCard
                label={comparison?.week?.label || { current: 'This Week', previous: 'Last Week' }}
                current={comparison?.week?.current   || { count: 0, revenue: 0 }}
                previous={comparison?.week?.previous  || { count: 0, revenue: 0 }}
                deltaCount={comparison?.week?.deltaCount   ?? 0}
                deltaRevenue={comparison?.week?.deltaRevenue ?? 0}
                loading={isLoadingComparison}
              />
              <ComparisonCard
                label={comparison?.month?.label || { current: 'This Month', previous: 'Last Month' }}
                current={comparison?.month?.current   || { count: 0, revenue: 0 }}
                previous={comparison?.month?.previous  || { count: 0, revenue: 0 }}
                deltaCount={comparison?.month?.deltaCount   ?? 0}
                deltaRevenue={comparison?.month?.deltaRevenue ?? 0}
                loading={isLoadingComparison}
              />
            </div>

            {/* Monthly trend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Monthly Trend</h2>
                  <span className="text-xs text-gray-400 ml-1">last 12 months</span>
                </div>
                <div className="flex items-center gap-5">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                    Applications
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                    Revenue
                  </span>
                </div>
              </div>
              {isLoadingSummary ? (
                <div className="h-20 bg-gray-50 rounded-lg animate-pulse" />
              ) : (
                <MonthlyTrendChart data={summary?.byMonth || []} />
              )}
            </div>

            {/* 3-Column Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* Left: Top Communities (tall) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-5">
                  <Building className="w-5 h-5 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Top Communities</h2>
                </div>
                {isLoadingSummary ? (
                  <div className="space-y-3 animate-pulse">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-8 bg-gray-100 rounded" />
                    ))}
                  </div>
                ) : !summary?.byProperty?.length ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No data for the selected period
                  </p>
                ) : (
                  <ol className="space-y-3 flex-1">
                    {summary.byProperty.map((p, i) => {
                      const maxC = summary.byProperty[0]?.count || 1;
                      const pct  = Math.round((p.count / maxC) * 100);
                      return (
                        <li key={i} className="flex items-center gap-3">
                          <span className="w-5 text-xs font-semibold text-gray-400 text-right flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                              <span className="text-xs font-bold text-gray-700 ml-2 flex-shrink-0 tabular-nums">
                                {p.count}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-400 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                                {formatCurrency(p.revenue)}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Middle: Top Power Users (tall) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-5 h-5 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Top Power Users</h2>
                </div>
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">by Stripe spend, completed payments only</p>

                {isLoadingSummary ? (
                  <div className="flex flex-col gap-3 animate-pulse">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-14 bg-gray-100 rounded-lg" />
                    ))}
                  </div>
                ) : !summary?.topPowerUsers?.length ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No completed Stripe payments in the selected period
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 flex-1">
                    {summary.topPowerUsers.map((u, i) => {
                      const maxSpend = summary.topPowerUsers[0]?.totalSpend || 1;
                      const pct = Math.round((u.totalSpend / maxSpend) * 100);
                      const medals = ['🥇', '🥈', '🥉'];
                      return (
                        <div
                          key={u.email}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
                        >
                          <span className="w-6 text-center text-base flex-shrink-0">
                            {medals[i] || (
                              <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                                  {u.name}
                                </p>
                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-gray-900 tabular-nums">
                                  {formatCurrency(u.totalSpend)}
                                </p>
                                <p className="text-xs text-gray-400 tabular-nums">
                                  {u.count} app{u.count !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Stacked smaller cards (Standard vs Rush + Export) */}
              <div className="flex flex-col gap-6">
                
                {/* Standard vs Rush */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Zap className="w-5 h-5 text-gray-400" />
                    <h2 className="text-base font-semibold text-gray-900">Standard vs Rush</h2>
                  </div>
                  {isLoadingSummary ? (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-3.5 bg-gray-200 rounded-full" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-12 bg-gray-100 rounded" />
                        <div className="h-12 bg-gray-100 rounded" />
                      </div>
                    </div>
                  ) : (
                    <PackageSplitBar data={summary?.byPackage} />
                  )}
                </div>

              </div>
            </div>

            {/* Recent Applications table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900">Recent Applications</h2>
                {paidNotSubmitted.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    <AlertCircle className="w-3 h-3" />
                    {paidNotSubmitted.length} not submitted
                  </span>
                )}
              </div>

              {recentQuery.isLoading ? (
                <div className="divide-y divide-gray-50">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="px-6 py-4 flex gap-6 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-24" />
                      <div className="h-4 bg-gray-200 rounded w-40" />
                      <div className="h-4 bg-gray-200 rounded w-32" />
                      <div className="h-4 bg-gray-200 rounded w-20" />
                      <div className="h-4 bg-gray-200 rounded w-16" />
                    </div>
                  ))}
                </div>
              ) : recentApps.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
                  <p className="text-gray-500">No applications match the selected date range.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "220px" }} />
                      <col style={{ width: "200px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "100px" }} />
                    </colgroup>
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr>
                        {['Date', 'Property', 'Submitter', 'Status', 'Payment', 'Submitted', 'Amount'].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentApps.map((app) => {
                        const flagged = app.payment_status === 'completed' && !app.submitted_at;
                        return (
                          <tr
                            key={app.id}
                            className={`transition-colors ${flagged ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-blue-50/30'}`}
                          >
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatDate(app.created_at)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm font-semibold text-gray-900 truncate">{app.property_address}</div>
                              {app.unit_number && (
                                <div className="text-xs text-gray-500 mt-0.5">Unit {app.unit_number}</div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm font-medium text-gray-900 truncate">{app.submitter_name}</div>
                              <div className="text-xs text-gray-500 mt-0.5 truncate">{app.submitter_email}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(app.status)}`}>
                                {getStatusLabel(app.status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {app.payment_status === 'completed' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Paid
                                </span>
                              ) : app.payment_status === 'not_required' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                  Not required
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  {app.payment_status || 'Pending'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {app.submitted_at ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  {formatDate(app.submitted_at)}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${flagged ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-400'}`}>
                                  {flagged && <AlertCircle className="w-3 h-3" />}
                                  Not submitted
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 tabular-nums">
                              {formatCurrency(app.total_amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating refresh indicator */}
      {isRefreshing && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-white rounded-lg shadow-lg border px-4 py-3 flex items-center gap-3">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm text-gray-700">Refreshing…</span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminReports;
