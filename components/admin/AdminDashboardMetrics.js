import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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

const AdminDashboardMetrics = ({ userRole }) => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalApplications: 0,
    pendingApplications: 0,
    completedApplications: 0,
    urgentApplications: 0,
    todaySubmissions: 0,
    nearDeadline: 0,
    overdue: 0,
    formsCompleted: 0,
    emailsSent: 0,
  });
  const [workflowDistribution, setWorkflowDistribution] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    loadMetrics();
    fetchUserEmail();
  }, []);

  const fetchUserEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserEmail(user?.email || '');
  };

  const loadMetrics = async () => {
    setRefreshing(true);
    try {
      // Get basic application counts
      const { data: applications, error } = await supabase
        .from('applications')
        .select(`
          *,
          property_owner_forms(form_type, status),
          notifications(notification_type, sent_at)
        `);

      if (error) throw error;

      // Calculate metrics
      const total = applications.length;
      const completed = applications.filter(app => 
        app.notifications?.some(n => n.notification_type === 'application_approved')
      ).length;
      const pending = total - completed;

      // Today's submissions
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todaySubmissions = applications.filter(app => 
        new Date(app.created_at) >= todayStart
      ).length;

      // Deadline calculations
      const now = new Date();
      let urgentCount = 0;
      let nearDeadlineCount = 0;
      let overdueCount = 0;

      applications.forEach(app => {
        // Skip completed applications
        if (app.notifications?.some(n => n.notification_type === 'application_approved')) {
          return;
        }

        // Calculate deadline (e.g., 7 days from submission)
        const submittedDate = new Date(app.created_at);
        const deadline = new Date(submittedDate);
        deadline.setDate(deadline.getDate() + 7); // 7-day deadline

        const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

        if (hoursUntilDeadline < 0) {
          overdueCount++;
          urgentCount++;
        } else if (hoursUntilDeadline < 24) {
          // Less than 24 hours
          nearDeadlineCount++;
          urgentCount++;
        } else if (hoursUntilDeadline < 48) {
          // Less than 48 hours
          nearDeadlineCount++;
        }
      });

      // Forms completed
      const allForms = applications.flatMap(app => app.property_owner_forms || []);
      const formsCompleted = allForms.filter(form => form.status === 'completed').length;

      // Emails sent
      const emailsSent = applications.filter(app => 
        app.notifications?.some(n => n.notification_type === 'application_approved')
      ).length;

      // Workflow distribution
      const distribution = [
        { 
          name: 'Forms Required', 
          count: applications.filter(app => {
            const forms = app.property_owner_forms || [];
            return forms.length === 0 || forms.every(f => f.status === 'not_created');
          }).length,
          color: 'bg-yellow-500'
        },
        { 
          name: 'Forms In Progress', 
          count: applications.filter(app => {
            const forms = app.property_owner_forms || [];
            return forms.some(f => f.status === 'in_progress' || f.status === 'not_started');
          }).length,
          color: 'bg-blue-500'
        },
        { 
          name: 'Generate PDF', 
          count: applications.filter(app => {
            const forms = app.property_owner_forms || [];
            const allFormsCompleted = forms.length >= 2 && forms.every(f => f.status === 'completed');
            return allFormsCompleted && !app.pdf_url;
          }).length,
          color: 'bg-orange-500'
        },
        { 
          name: 'Send Email', 
          count: applications.filter(app => {
            const hasEmail = app.notifications?.some(n => n.notification_type === 'application_approved');
            return app.pdf_url && !hasEmail;
          }).length,
          color: 'bg-purple-500'
        },
        { 
          name: 'Completed', 
          count: completed,
          color: 'bg-green-500'
        }
      ];

      // Recent activity (last 5 applications)
      const recent = applications
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(app => ({
          id: app.id,
          property: app.property_address,
          submitter: app.submitter_name,
          date: app.created_at,
          status: getWorkflowStep(app).text
        }));

      setMetrics({
        totalApplications: total,
        pendingApplications: pending,
        completedApplications: completed,
        urgentApplications: urgentCount,
        todaySubmissions,
        nearDeadline: nearDeadlineCount,
        overdue: overdueCount,
        formsCompleted,
        emailsSent,
      });

      setWorkflowDistribution(distribution);
      setRecentActivity(recent);

    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getWorkflowStep = (application) => {
    const forms = application.property_owner_forms || [];
    const hasPDF = application.pdf_url;
    const hasEmail = application.notifications?.some(n => n.notification_type === 'application_approved');

    if (forms.length === 0) {
      return { step: 1, text: 'Forms Required' };
    }
    
    if (forms.some(f => f.status !== 'completed')) {
      return { step: 2, text: 'Forms In Progress' };
    }
    
    if (!hasPDF) {
      return { step: 3, text: 'Generate PDF' };
    }
    
    if (!hasEmail) {
      return { step: 4, text: 'Send Email' };
    }
    
    return { step: 5, text: 'Completed' };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  const navigateToApplications = (filter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.date) params.set('date', filter.date);
    
    const queryString = params.toString();
    router.push(`/admin/applications${queryString ? '?' + queryString : ''}`);
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='flex items-center gap-3 text-gray-600'>
          <RefreshCw className='w-5 h-5 animate-spin' />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-100'>
      <div className='max-w-7xl mx-auto p-6'>
        {/* Admin Navbar */}
        <div className='flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-md border'>
          <div className='flex items-center gap-3'>
            <BarChart3 className='w-8 h-8 text-blue-600' />
            <span className='text-xl font-bold text-gray-900'>
              Dashboard
            </span>
          </div>
          <div className='flex items-center gap-4'>
            <button
              onClick={() => router.push('/admin/applications')}
              className='px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium'
            >
              Applications
            </button>
            {userRole === 'admin' && (
              <button
                onClick={() => router.push('/admin/users')}
                className='px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium'
              >
                Users
              </button>
            )}
            <button
              onClick={() => router.push('/admin/properties')}
              className='px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium'
            >
              Properties
            </button>
            <button
              onClick={() => router.push('/admin/reports')}
              className='px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium'
            >
              Reports
            </button>
            
            {/* User Menu */}
            <div className='relative'>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className='flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium'
              >
                <User className='w-4 h-4' />
                {userRole && (
                  <span className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded'>
                    {userRole}
                  </span>
                )}
                <ChevronDown className='w-4 h-4' />
              </button>

              {showUserMenu && (
                <div className='absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border z-50'>
                  <div className='py-2'>
                    <div className='px-4 py-2 text-sm text-gray-700 border-b'>
                      <div className='font-medium'>Signed in as:</div>
                      <div className='text-gray-600 truncate'>{userEmail}</div>
                    </div>
                    <div className='border-t mt-2'>
                      <button
                        onClick={() => {
                          handleLogout();
                          setShowUserMenu(false);
                        }}
                        className='w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2'
                      >
                        <LogOut className='w-4 h-4' />
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                GMG ResaleFlow Dashboard
              </h1>
              <p className='text-gray-600'>
                Analytics and insights for resale certificate management
              </p>
            </div>
            <button
              onClick={loadMetrics}
              disabled={refreshing}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
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
    </div>
  );
};

export default AdminDashboardMetrics;