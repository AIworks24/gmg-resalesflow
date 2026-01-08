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
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Check if cache should be bypassed (for manual refresh)
    const bypassCache = req.query.bypass === 'true';

    // Try to get from cache first (unless bypassed)
    // Include user ID to prevent cache collisions between concurrent users
    const cacheKey = `admin:dashboard:summary:${user.id}`;
    
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
    let query = supabase
      .from('applications')
      .select(`
        *,
        property_owner_forms(form_type, status, property_group_id),
        notifications(notification_type, sent_at),
        application_property_groups(
          id,
          status,
          pdf_status,
          pdf_url,
          email_status,
          email_completed_at,
          inspection_status
        )
      `)
      .neq('status', 'draft')
      .neq('status', 'pending_payment')
      .is('deleted_at', null); // Only count non-deleted applications

    // All admin, staff, and accounting users can see all applications
    // (No role-based filtering - accounting users now have full visibility)

    const { data: applications, error: queryError } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Helper function to check if a multi-community settlement application is fully completed
    const isMultiCommunitySettlementCompleted = (app) => {
      const propertyGroups = app.application_property_groups || [];
      
      // If no property groups, it's not a multi-community application
      if (propertyGroups.length === 0) {
        return false;
      }

      // Check if this is a settlement application
      const isSettlementApp = app.submitter_type === 'settlement' || 
                              app.application_type?.startsWith('settlement');
      
      // Only apply special logic for settlement multi-community applications
      if (!isSettlementApp) {
        return false;
      }

      // For multi-community settlement applications, ALL properties must be completed
      // Each property needs: settlement form completed, PDF generated, and email sent
      for (const group of propertyGroups) {
        // Find settlement form for this property group
        const settlementForm = app.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && form.property_group_id === group.id
        );
        
        const formCompleted = settlementForm?.status === 'completed';
        const pdfCompleted = group.pdf_status === 'completed' || !!group.pdf_url;
        const emailCompleted = group.email_status === 'completed' || !!group.email_completed_at;
        
        // If any property is not fully completed, the application is not completed
        if (!formCompleted || !pdfCompleted || !emailCompleted) {
          return false;
        }
      }
      
      // All properties are completed
      return true;
    };

    // Helper function to check if a regular (non-multi-community) application is fully completed
    // This matches the logic in getWorkflowStep to ensure consistency
    const isRegularApplicationCompleted = (app) => {
      // Check if this is a lender questionnaire application
      const isLenderQuestionnaire = app.application_type === 'lender_questionnaire';
      
      if (isLenderQuestionnaire) {
        // Lender questionnaire: needs original file, completed file, and email sent
        const hasOriginalFile = !!app.lender_questionnaire_file_path;
        const hasCompletedFile = !!app.lender_questionnaire_completed_file_path;
        const hasNotificationSent = app.notifications?.some(n => n.notification_type === 'application_approved');
        const hasEmailCompletedAt = !!app.email_completed_at;
        return hasOriginalFile && hasCompletedFile && (hasNotificationSent || hasEmailCompletedAt);
      }
      
      // Check if this is a settlement application (single property)
      const isSettlementApp = app.submitter_type === 'settlement' || 
                              app.application_type?.startsWith('settlement');
      
      if (isSettlementApp) {
        // Settlement: needs form completed, PDF generated, and email sent
        const settlementForm = app.property_owner_forms?.find(form => form.form_type === 'settlement_form');
        const settlementFormStatus = settlementForm?.status || 'not_started';
        const settlementFormCompleted = !!app.settlement_form_completed_at || settlementFormStatus === 'completed';
        const hasPDF = !!app.pdf_url || !!app.pdf_completed_at;
        const hasNotificationSent = app.notifications?.some(n => n.notification_type === 'application_approved');
        const hasEmailCompletedAt = !!app.email_completed_at;
        const hasEmailSent = hasNotificationSent || hasEmailCompletedAt;
        
        return settlementFormCompleted && hasPDF && hasEmailSent;
      }
      
      // Standard application: needs both forms completed, PDF generated, and email sent
      const inspectionForm = app.property_owner_forms?.find(form => form.form_type === 'inspection_form');
      const resaleForm = app.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
      const inspectionStatus = inspectionForm?.status || 'not_started';
      const resaleStatus = resaleForm?.status || 'not_started';
      const hasPDF = !!app.pdf_url;
      const hasNotificationSent = app.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = !!app.email_completed_at;
      const hasEmailSent = hasNotificationSent || hasEmailCompletedAt;
      
      return inspectionStatus === 'completed' && resaleStatus === 'completed' && hasPDF && hasEmailSent;
    };

    // Calculate metrics
    const total = applications.length;
    const completed = applications.filter(app => {
      // For multi-community settlement applications, use special completion check
      if (isMultiCommunitySettlementCompleted(app)) {
        return true;
      }
      
      // For regular applications, use strict completion check (matches getWorkflowStep logic)
      return isRegularApplicationCompleted(app);
    }).length;
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
      // Skip completed applications (use strict completion check)
      if (isMultiCommunitySettlementCompleted(app)) {
        return;
      }
      if (isRegularApplicationCompleted(app)) {
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

    // Emails sent - count actual emails, not applications
    // For multi-community: count each property group email
    // For regular applications: count each application email
    let emailsSent = 0;
    applications.forEach(app => {
      const propertyGroups = app.application_property_groups || [];
      const isSettlementApp = app.submitter_type === 'settlement' || 
                              app.application_type?.startsWith('settlement');
      
      // Check if this is a multi-community settlement application
      if (propertyGroups.length > 0 && isSettlementApp) {
        // For multi-community settlement: count each property group that had an email sent
        propertyGroups.forEach(group => {
          if (group.email_status === 'completed' || group.email_completed_at) {
            emailsSent++;
          }
        });
      } else if (propertyGroups.length > 0) {
        // For multi-community standard applications: count each property group that had an email sent
        propertyGroups.forEach(group => {
          if (group.email_status === 'completed' || group.email_completed_at) {
            emailsSent++;
          }
        });
      } else {
        // For regular single-property applications: count if email was sent
        const hasApprovalEmail = app.notifications?.some(n => n.notification_type === 'application_approved');
        const hasEmailCompletedAt = !!app.email_completed_at;
        if (hasApprovalEmail || hasEmailCompletedAt) {
          emailsSent++;
        }
      }
    });

    // Helper function to determine workflow step
    const getWorkflowStep = (application) => {
      const forms = application.property_owner_forms || [];
      const hasPDF = application.pdf_url;
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = !!application.email_completed_at;
      const hasEmail = hasNotificationSent || hasEmailCompletedAt;

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
          // Skip multi-community settlement applications that are already completed
          if (isMultiCommunitySettlementCompleted(app)) {
            return false;
          }
          const hasApprovalEmail = app.notifications?.some(n => n.notification_type === 'application_approved');
          const hasEmailCompletedAt = !!app.email_completed_at;
          const isCompletedStatus = app.status === 'completed';
          return app.pdf_url && !hasApprovalEmail && !hasEmailCompletedAt && !isCompletedStatus;
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
