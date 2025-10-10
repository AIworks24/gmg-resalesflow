import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  BarChart3,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building,
  FileText,
  Calendar,
  RefreshCw,
  User,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/router';
import AdminLayout from './AdminLayout';

const AdminDashboardMetrics = ({ userRole }) => {
  const router = useRouter();

  // SWR fetcher function
  const fetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const error = new Error('Failed to fetch dashboard summary');
      error.info = await res.json();
      error.status = res.status;
      throw error;
    }
    return res.json();
  };

  // Fetch dashboard summary using SWR
  const { data: swrData, error: swrError, isLoading, mutate } = useSWR(
    '/api/admin/dashboard-summary',
    fetcher,
    {
      refreshInterval: 0, // Disable auto-refresh (manual refresh only)
      revalidateOnFocus: false,
      dedupingInterval: 5000, // Prevent duplicate requests within 5 seconds
    }
  );

  // Function to force refresh with cache bypass
  const forceRefresh = async () => {
    await mutate(
      fetch('/api/admin/dashboard-summary?bypass=true').then(res => res.json()),
      { revalidate: false }
    );
  };

  // Extract data from SWR response with defaults
  const metrics = swrData?.metrics || {
    totalApplications: 0,
    pendingApplications: 0,
    completedApplications: 0,
    urgentApplications: 0,
    todaySubmissions: 0,
    nearDeadline: 0,
    overdue: 0,
    formsCompleted: 0,
    emailsSent: 0,
  };
  const workflowDistribution = swrData?.workflowDistribution || [];
  const recentActivity = swrData?.recentActivity || [];


  const navigateToApplications = (filter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.date) params.set('date', filter.date);
    
    const queryString = params.toString();
    router.push(`/admin/applications${queryString ? '?' + queryString : ''}`);
  };

  // Show error state if SWR encountered an error
  if (swrError) {
    return (
      <AdminLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <AlertTriangle className='w-12 h-12 text-red-500 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>Failed to load dashboard</h3>
            <p className='text-gray-600 mb-4'>Please try refreshing the page</p>
            <button
              onClick={forceRefresh}
              className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700'
            >
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Show skeleton loading state
  if (isLoading) {
    return (
      <AdminLayout>
        <div className='max-w-7xl mx-auto p-6'>
          {/* Header Skeleton */}
          <div className='mb-8'>
            <div className='flex items-center justify-between'>
              <div className='flex-1'>
                <div className='h-9 bg-gray-200 rounded w-64 mb-2 animate-pulse'></div>
                <div className='h-5 bg-gray-200 rounded w-96 animate-pulse'></div>
              </div>
              <div className='h-10 w-28 bg-gray-200 rounded animate-pulse'></div>
            </div>
          </div>

          {/* Metric Cards Skeleton */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className='bg-white p-6 rounded-lg shadow-md border'>
                <div className='flex items-center justify-between'>
                  <div className='flex-1'>
                    <div className='h-4 bg-gray-200 rounded w-32 mb-3 animate-pulse'></div>
                    <div className='h-8 bg-gray-200 rounded w-20 mb-2 animate-pulse'></div>
                    <div className='h-3 bg-gray-200 rounded w-24 animate-pulse'></div>
                  </div>
                  <div className='w-12 h-12 bg-gray-100 rounded-full animate-pulse'></div>
                </div>
              </div>
            ))}
          </div>

          {/* Workflow & Recent Activity Skeleton */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8'>
            {/* Workflow Distribution Skeleton */}
            <div className='bg-white p-6 rounded-lg shadow-md border'>
              <div className='h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse'></div>
              <div className='space-y-4'>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i}>
                    <div className='flex items-center justify-between mb-2'>
                      <div className='h-4 bg-gray-200 rounded w-32 animate-pulse'></div>
                      <div className='h-4 bg-gray-200 rounded w-12 animate-pulse'></div>
                    </div>
                    <div className='h-2 bg-gray-200 rounded w-full animate-pulse'></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity Skeleton */}
            <div className='bg-white p-6 rounded-lg shadow-md border'>
              <div className='h-6 bg-gray-200 rounded w-40 mb-4 animate-pulse'></div>
              <div className='space-y-4'>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className='flex items-start gap-3 p-3'>
                    <div className='w-8 h-8 bg-gray-200 rounded-full animate-pulse'></div>
                    <div className='flex-1'>
                      <div className='h-4 bg-gray-200 rounded w-3/4 mb-2 animate-pulse'></div>
                      <div className='h-3 bg-gray-200 rounded w-1/2 animate-pulse'></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className='max-w-7xl mx-auto p-6'>

        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                Dashboard Overview
              </h1>
              <p className='text-gray-600'>
                Analytics and insights for resale certificate management
              </p>
            </div>
            <button
              onClick={forceRefresh}
              disabled={isLoading}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
          {/* Total Applications */}
          <div 
            className='bg-white p-6 rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow'
            onClick={() => navigateToApplications()}
          >
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-gray-600'>Total Applications</p>
                <p className='text-3xl font-bold text-gray-900'>{metrics.totalApplications}</p>
                <p className='text-sm text-gray-500 flex items-center gap-1'>
                  <Calendar className='w-3 h-3' />
                  {metrics.todaySubmissions} today
                </p>
              </div>
              <FileText className='w-12 h-12 text-blue-600 opacity-20' />
            </div>
          </div>

          {/* Pending Applications */}
          <div 
            className='bg-white p-6 rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow'
            onClick={() => navigateToApplications({ status: 'pending' })}
          >
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-gray-600'>Pending Applications</p>
                <p className='text-3xl font-bold text-orange-600'>{metrics.pendingApplications}</p>
                <p className='text-sm text-gray-500'>Requires attention</p>
              </div>
              <Clock className='w-12 h-12 text-orange-600 opacity-20' />
            </div>
          </div>

          {/* Completed Applications */}
          <div 
            className='bg-white p-6 rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow'
            onClick={() => navigateToApplications({ status: 'completed' })}
          >
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-gray-600'>Completed Applications</p>
                <p className='text-3xl font-bold text-green-600'>{metrics.completedApplications}</p>
                <p className='text-sm text-gray-500'>{metrics.emailsSent} emails sent</p>
              </div>
              <CheckCircle className='w-12 h-12 text-green-600 opacity-20' />
            </div>
          </div>

          {/* Urgent Applications */}
          <div 
            className='bg-white p-6 rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow'
            onClick={() => navigateToApplications({ status: 'urgent' })}
          >
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-gray-600'>Urgent Applications</p>
                <p className='text-3xl font-bold text-red-600'>{metrics.urgentApplications}</p>
                <p className='text-sm text-gray-500'>
                  {metrics.overdue > 0 && (
                    <span className='text-red-600'>{metrics.overdue} overdue</span>
                  )}
                  {metrics.overdue > 0 && metrics.nearDeadline > 0 && ' • '}
                  {metrics.nearDeadline > 0 && (
                    <span className='text-orange-600'>{metrics.nearDeadline} near deadline</span>
                  )}
                  {metrics.urgentApplications === 0 && (
                    <span className='text-green-600'>All on track</span>
                  )}
                </p>
              </div>
              <AlertTriangle className='w-12 h-12 text-red-600 opacity-20' />
            </div>
          </div>
        </div>

        {/* Workflow Distribution & Recent Activity */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8'>
          {/* Workflow Distribution */}
          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>Workflow Distribution</h3>
            <div className='space-y-4'>
              {workflowDistribution.map((item, index) => (
                <div 
                  key={index}
                  className='cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors'
                  onClick={() => navigateToApplications({ status: item.name.toLowerCase().replace(' ', '_') })}
                >
                  <div className='flex items-center justify-between mb-2'>
                    <span className='text-sm font-medium text-gray-700'>{item.name}</span>
                    <span className='text-sm font-bold text-gray-900'>{item.count}</span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div 
                      className={`h-2 rounded-full ${item.color}`}
                      style={{ 
                        width: `${metrics.totalApplications > 0 ? (item.count / metrics.totalApplications * 100) : 0}%` 
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>Recent Activity</h3>
            <div className='space-y-4'>
              {recentActivity.map((activity) => (
                <div key={activity.id} className='flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg'>
                  <Building className='w-5 h-5 text-gray-400' />
                  <div className='flex-1'>
                    <p className='text-sm font-medium text-gray-900'>{activity.property}</p>
                    <p className='text-xs text-gray-500'>
                      {activity.submitter} • {new Date(activity.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className='text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded'>
                    {activity.status}
                  </span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => router.push('/admin/applications')}
              className='w-full mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium'
            >
              View all applications →
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className='bg-white p-6 rounded-lg shadow-md border'>
          <h3 className='text-lg font-semibold text-gray-900 mb-4'>Quick Actions</h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <button 
              onClick={() => router.push('/admin/applications')}
              className='flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors'
            >
              <FileText className='w-6 h-6 text-blue-600' />
              <div className='text-left'>
                <p className='font-medium text-gray-900'>View All Applications</p>
                <p className='text-sm text-gray-500'>Manage application workflow</p>
              </div>
            </button>
            
            <button 
              onClick={() => router.push('/admin/properties')}
              className='flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors'
            >
              <Building className='w-6 h-6 text-green-600' />
              <div className='text-left'>
                <p className='font-medium text-gray-900'>Manage Properties</p>
                <p className='text-sm text-gray-500'>Update HOA information</p>
              </div>
            </button>
            
            <button 
              onClick={() => router.push('/admin/reports')}
              className='flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors'
            >
              <BarChart3 className='w-6 h-6 text-purple-600' />
              <div className='text-left'>
                <p className='font-medium text-gray-900'>Generate Reports</p>
                <p className='text-sm text-gray-500'>Export analytics data</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardMetrics;