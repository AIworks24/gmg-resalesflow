import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../lib/redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client (handles auth properly)
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin or staff role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!profile || !['admin', 'staff'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Check if cache should be bypassed (for manual refresh)
    const bypassCache = req.query.bypass === 'true';

    // Try to get from cache first (unless bypassed)
    const cacheKey = 'admin:dashboard:summary';
    
    if (!bypassCache) {
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        console.log('✅ Dashboard cache HIT');
        return res.status(200).json({ 
          ...cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log('⚡ Cache bypassed - forcing fresh fetch');
    }

    console.log('❌ Dashboard cache MISS - fetching from database');

    // Cache miss - fetch from database
    const { data: applications, error: queryError } = await supabase
      .from('applications')
      .select(`
        *,
        property_owner_forms(form_type, status),
        notifications(notification_type, sent_at)
      `)
      .neq('status', 'draft');

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

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

      // Calculate deadline (7 days from submission)
      const submittedDate = new Date(app.created_at);
      const deadline = new Date(submittedDate);
      deadline.setDate(deadline.getDate() + 7);

      const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

      if (hoursUntilDeadline < 0) {
        overdueCount++;
        urgentCount++;
      } else if (hoursUntilDeadline < 24) {
        nearDeadlineCount++;
        urgentCount++;
      } else if (hoursUntilDeadline < 48) {
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

    // Helper function to determine workflow step
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
    const recentActivity = applications
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(app => ({
        id: app.id,
        property: app.property_address,
        submitter: app.submitter_name,
        date: app.created_at,
        status: getWorkflowStep(app).text
      }));

    const summary = {
      metrics: {
        totalApplications: total,
        pendingApplications: pending,
        completedApplications: completed,
        urgentApplications: urgentCount,
        todaySubmissions,
        nearDeadline: nearDeadlineCount,
        overdue: overdueCount,
        formsCompleted,
        emailsSent,
      },
      workflowDistribution: distribution,
      recentActivity
    };

    // Store in cache with 5-minute TTL
    await setCache(cacheKey, summary, 300);

    return res.status(200).json({ 
      ...summary,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard summary API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch dashboard summary',
      message: error.message 
    });
  }
}
