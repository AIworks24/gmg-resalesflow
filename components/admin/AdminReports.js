import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  FileText,
  Building,
  DollarSign,
  Clock,
  Download,
  Calendar,
  Filter,
  User,
  ChevronDown,
  LogOut,
  RefreshCw,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import useAdminAuthStore from '../../stores/adminAuthStore';
import { useApplications } from '../../hooks/useApplications';
import AdminLayout from './AdminLayout';
import useSWR from 'swr';

const AdminReports = () => {
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' or 'expiring-documents'

  const router = useRouter();
  const { signOut, user, role } = useAdminAuthStore();
  
  // Fetch expiring documents (admin only)
  const fetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const error = new Error('Failed to fetch expiring documents');
      error.info = await res.json();
      error.status = res.status;
      throw error;
    }
    return res.json();
  };

  const { 
    data: expiringDocsData, 
    error: expiringDocsError, 
    isLoading: isLoadingExpiringDocs,
    mutate: refetchExpiringDocs 
  } = useSWR(
    role === 'admin' ? '/api/admin/expiring-documents?days=30' : null,
    fetcher,
    { 
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      // Refresh when tab becomes active
      refreshInterval: 0, // Disable auto-refresh, rely on manual refresh and focus
    }
  );

  // Filter documents: show expired or expiring within 30 days (already filtered by API)
  const expiringDocuments = expiringDocsData?.documents || [];

  // Get date range for filtering
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateFilter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 86400000) };
      case 'week':
        const weekStart = new Date(today.getTime() - (today.getDay() * 86400000));
        return { start: weekStart, end: new Date() };
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart, end: new Date() };
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
        return { start: quarterStart, end: new Date() };
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          return {
            start: new Date(customDateRange.startDate),
            end: new Date(customDateRange.endDate)
          };
        }
        return null;
      default:
        return null;
    }
  };

  // Fetch applications data
  const filters = useMemo(() => {
    const dateRange = getDateRange();
    return {
      page: 1,
      limit: 100, // Get more data for statistics
      status: 'all',
      search: '',
      dateRange
    };
  }, [dateFilter, customDateRange]);

  const { 
    data: applicationsData, 
    isLoading, 
    isFetching,
    isError,
    refetch 
  } = useApplications(filters);

  // Extract the applications array and count from the API response
  // API response structure: { data: [...], count: X, page: Y, limit: Z }
  const applications = applicationsData?.data || [];
  const totalApplications = applicationsData?.count || 0;

  // Calculate statistics
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Filter applications for this month
    const thisMonthApps = applications.filter(app => 
      new Date(app.created_at) >= thisMonth
    );

    // Calculate total revenue
    const totalRevenue = applications.reduce((sum, app) => {
      return sum + (parseFloat(app.total_amount) || 0);
    }, 0);

    // Count pending applications
    const pendingApps = applications.filter(app => 
      ['draft', 'submitted', 'pending_payment', 'under_review', 'compliance_pending'].includes(app.status)
    ).length;

    return {
      totalApplications: totalApplications,
      thisMonthApplications: thisMonthApps.length,
      totalRevenue: totalRevenue,
      pendingApplications: pendingApps
    };
  }, [applications, totalApplications]);


  const handleExportApplications = async () => {
    try {
      const response = await fetch('/api/admin/export-applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filters),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `applications-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export applications. Please try again.');
    }
  };

  const handleExportProperties = async () => {
    try {
      const response = await fetch('/api/admin/export-properties');

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `properties-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export properties. Please try again.');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Draft',
      submitted: 'Submitted',
      awaiting_property_owner_response: 'Under Review',
      under_review: 'Under Review',
      compliance_pending: 'Compliance Pending',
      compliance_completed: 'Compliance Completed',
      approved: 'Approved',
      completed: 'Completed',
      rejected: 'Rejected',
      payment_completed: 'Payment Completed',
      payment_failed: 'Payment Failed',
    };
    return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'pending_payment':
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      case 'under_review':
      case 'compliance_pending':
        return 'bg-blue-100 text-blue-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getExpirationStatusColor = (daysUntilExpiration) => {
    if (daysUntilExpiration < 0) {
      return 'bg-red-100 text-red-800'; // Expired
    } else if (daysUntilExpiration <= 7) {
      return 'bg-red-100 text-red-800'; // Urgent (7 days or less)
    } else if (daysUntilExpiration <= 30) {
      return 'bg-yellow-100 text-yellow-800'; // Warning (8-30 days)
    } else {
      return 'bg-green-100 text-green-800'; // Normal (30+ days)
    }
  };

  const getExpirationStatusLabel = (daysUntilExpiration) => {
    if (daysUntilExpiration < 0) {
      return `Expired ${Math.abs(daysUntilExpiration)} days ago`;
    } else if (daysUntilExpiration === 0) {
      return 'Expires today';
    } else if (daysUntilExpiration === 1) {
      return 'Expires tomorrow';
    } else {
      return `Expires in ${daysUntilExpiration} days`;
    }
  };

  const handleDocumentClick = (propertyId) => {
    // Invalidate cache before navigating so data refreshes when returning
    refetchExpiringDocs();
    router.push(`/admin/property-files/${propertyId}`);
  };

  // Refresh data when tab becomes active or when returning to the page
  useEffect(() => {
    if (activeTab === 'expiring-documents' && role === 'admin') {
      // Refresh when tab becomes active (with a small delay to avoid unnecessary calls)
      const timer = setTimeout(() => {
        refetchExpiringDocs();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, role, refetchExpiringDocs]);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className='mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              Reports & Analytics
            </h1>
            <p className='text-sm text-gray-500 mt-1'>
              View performance metrics and generate detailed reports
            </p>
          </div>
          <button
            onClick={() => {
              if (activeTab === 'reports') {
                refetch();
              } else {
                refetchExpiringDocs();
              }
            }}
            disabled={activeTab === 'reports' ? isFetching : isLoadingExpiringDocs}
            className='inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm'
          >
            <RefreshCw className={`w-4 h-4 ${(activeTab === 'reports' ? isFetching : isLoadingExpiringDocs) ? 'animate-spin' : ''}`} />
            {(activeTab === 'reports' ? isFetching : isLoadingExpiringDocs) ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {/* Tabs - Admin only for Expiring Documents */}
        {role === 'admin' && (
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => {
                  setActiveTab('reports');
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'reports'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Reports & Analytics
              </button>
              <button
                onClick={() => {
                  setActiveTab('expiring-documents');
                  // Refresh data when switching to this tab
                  refetchExpiringDocs();
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'expiring-documents'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Expiring Documents
                {expiringDocuments.length > 0 && (
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === 'expiring-documents' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {expiringDocuments.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        )}

        {/* Expiring Documents Tab Content */}
        {activeTab === 'expiring-documents' && role === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-900">Documents by Expiration</h2>
              <p className="text-sm text-gray-500 mt-1">
                Documents expiring within 30 days or already expired, across all properties, ordered by expiration date (soonest first)
              </p>
            </div>
            {isLoadingExpiringDocs ? (
              <div className="text-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Loading expiring documents...</p>
              </div>
            ) : expiringDocsError ? (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading documents</h3>
                <p className="text-gray-500">{expiringDocsError.message || 'Failed to load expiring documents'}</p>
              </div>
            ) : expiringDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No expiring documents</h3>
                <p className="text-gray-500">All documents are up to date or have no expiration dates set.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Expiration Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Document Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Property
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Property Owner
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expiringDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        onClick={() => handleDocumentClick(doc.property_id)}
                        className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {formatDate(doc.expiration_date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getExpirationStatusColor(doc.days_until_expiration)}`}>
                            {getExpirationStatusLabel(doc.days_until_expiration)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {doc.document_name || doc.document_key}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600">
                            {doc.property_name || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {doc.property_owner_name || 'N/A'}
                          </div>
                          {doc.property_owner_email && (
                            <div className="text-xs text-gray-500 mt-0.5">{doc.property_owner_email}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {doc.property_location || 'N/A'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab Content */}
        {activeTab === 'reports' && (
          <>

            {/* Date Filter Controls */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-8">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Time Period:</span>
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
                      onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <span className="text-gray-500 text-sm">to</span>
                    <input
                      type="date"
                      value={customDateRange.endDate}
                      onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}

                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Applications</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalApplications}</p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-green-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">This Month</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.thisMonthApplications}</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-yellow-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <DollarSign className="w-5 h-5 text-yellow-600" />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-orange-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Pending Applications</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.pendingApplications}</p>
                  </div>
                  <div className="p-2 bg-orange-50 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Export Data</h2>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleExportApplications}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Export Applications CSV
                </button>
                <button
                  onClick={handleExportProperties}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Export Properties CSV
                </button>
              </div>
            </div>

            {/* Recent Applications Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-lg font-bold text-gray-900">Recent Applications</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Property
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Submitter
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {applications.slice(0, 20).map((app) => (
                      <tr key={app.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {new Date(app.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {app.property_address}
                            </div>
                            {app.unit_number && (
                              <div className="text-xs text-gray-500 mt-0.5">Unit {app.unit_number}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {app.submitter_name}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{app.submitter_email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(app.status)}`}>
                            {getStatusLabel(app.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(app.total_amount || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {applications.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
                  <p className="text-gray-500">No applications match the selected date range.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating Loading Animation */}
      {((activeTab === 'reports' && (isLoading || isFetching)) || (activeTab === 'expiring-documents' && isLoadingExpiringDocs)) && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-white rounded-lg shadow-lg border px-4 py-3 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm text-gray-700">
              {activeTab === 'reports' 
                ? (isLoading && !applicationsData ? 'Loading reports...' : 'Refreshing...')
                : 'Loading expiring documents...'
              }
            </span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminReports;