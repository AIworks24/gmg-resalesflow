import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  DollarSign,
  Clock,
  Download,
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
  ShieldCheck,
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

// ─── main component ────────────────────────────────────────────────────────

const AdminReports = () => {
  const [dateFilter, setDateFilter]         = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [activeTab, setActiveTab]           = useState('reports');
  const [expiringDays, setExpiringDays]     = useState(30);

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

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    summaryQuery.refetch();
    recentQuery.refetch();
    comparisonQuery.refetch();
    stripeQuery.refetch();
  };

  const downloadCsv = async (url, method, body, filename) => {
    try {
      const res = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body:    body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error('Export failed');
      const blob    = await res.blob();
      const objUrl  = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.style.display = 'none';
      a.href          = objUrl;
      a.download      = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(objUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please try again.');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const handleExportApplications = () =>
    downloadCsv('/api/admin/export-applications', 'POST', { dateRange }, `applications-${today}.csv`);
  const handleExportProperties = () =>
    downloadCsv('/api/admin/export-properties', 'GET', null, `properties-${today}.csv`);

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

        {/* Tabs — admin only */}
        {role === 'admin' && (
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'reports',             label: 'Reports & Analytics' },
                { id: 'expiring-documents',  label: 'Expiring Documents', badge: expiringDocuments.length },
              ].map((tab) => (
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
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Documents by Expiration</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Across all properties, ordered by expiration date (soonest first)
                </p>
              </div>
              <select
                value={expiringDays}
                onChange={(e) => setExpiringDays(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value={30}>Next 30 days</option>
                <option value={60}>Next 60 days</option>
                <option value={90}>Next 90 days</option>
              </select>
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
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <ShieldCheck className="w-3 h-3" />
                          Stripe verified — live data
                        </span>
                        {stripeData.refundedTotal > 0 && (
                          <span className="text-xs text-gray-400">
                            {formatCurrency(stripeData.refundedTotal)} refunded · net {formatCurrency(stripeData.netRevenue)}
                          </span>
                        )}
                        {stripeData.stripeFees > 0 && (
                          <span className="text-xs text-gray-400">
                            {formatCurrency(stripeData.stripeFees)} in Stripe fees
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">
                        {isLoadingStripe ? 'Verifying with Stripe…' : 'Stripe-completed payments only'}
                      </p>
                    )}
                  </>
                )}
              </div>
              <KpiCard
                icon={Clock}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
                label="Avg. Turnaround"
                loading={isLoadingSummary}
                value={
                  summary?.avgTurnaroundDays != null
                    ? `${summary.avgTurnaroundDays} days`
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

                {/* Export Data */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex-1 relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                    <span className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full shadow-sm">
                      Coming Soon
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-5 opacity-50">
                    <Download className="w-5 h-5 text-gray-400" />
                    <h2 className="text-base font-semibold text-gray-900">Export Data</h2>
                  </div>
                  <div className="flex flex-col gap-3 opacity-50 pointer-events-none">
                    <button
                      disabled
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Export Applications
                    </button>
                    <button
                      disabled
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Export Properties
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-2 leading-relaxed">
                      Exports respect your current date filter and exclude test transactions.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Recent Applications table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-base font-semibold text-gray-900">Recent Applications</h2>
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
                  <table className="w-full">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr>
                        {['Date', 'Property', 'Submitter', 'Status', 'Amount'].map((h) => (
                          <th
                            key={h}
                            className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentApps.map((app) => (
                        <tr key={app.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatDate(app.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900">{app.property_address}</div>
                            {app.unit_number && (
                              <div className="text-xs text-gray-500 mt-0.5">Unit {app.unit_number}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{app.submitter_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{app.submitter_email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(app.status)}`}>
                              {getStatusLabel(app.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 tabular-nums">
                            {formatCurrency(app.total_amount)}
                          </td>
                        </tr>
                      ))}
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
