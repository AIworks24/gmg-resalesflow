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

    // Fetch all applications with same order as list (most recent first, nulls last) so
    // urgent count is from the same full set the list uses when status=urgent.
    const MAX_APPLICATIONS = 10000;
    query = query
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .range(0, MAX_APPLICATIONS - 1);

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
      // Rejected applications count as completed (terminal state)
      if (app.status === 'rejected') return true;
      // For multi-community settlement applications, use special completion check
      if (isMultiCommunitySettlementCompleted(app)) {
        return true;
      }
      
      // For regular applications, use strict completion check (matches getWorkflowStep logic)
      return isRegularApplicationCompleted(app);
    }).length;
    const pending = total - completed;

    // Today's submissions - calculate based on user's timezone
    // Get timezone from query parameter (defaults to UTC if not provided)
    const userTimezone = req.query.timezone || 'UTC';
    
    // Helper function to get start of today in user's timezone, converted to UTC
    const getTodayStartUTC = (timezone) => {
      const now = new Date();
      
      // Get today's date string in user's timezone (YYYY-MM-DD format)
      const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
      const [year, month, day] = todayDateStr.split('-').map(Number);
      
      // Find the UTC time that corresponds to midnight (00:00:00) in the user's timezone
      // We'll binary search by trying different UTC times until we find one that
      // displays as midnight in the user's timezone
      
      // Start with a reasonable guess: UTC midnight for today's date
      let candidateUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      
      // Check what time this shows in user's timezone
      let checkTime = candidateUTC.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      let checkDate = candidateUTC.toLocaleDateString('en-CA', { timeZone: timezone });
      
      // If it's not midnight on the right date, adjust
      // We'll search within a ±24 hour window
      let iterations = 0;
      const maxIterations = 48; // Max 48 hours offset
      
      while (iterations < maxIterations && (checkDate !== todayDateStr || checkTime !== '00:00')) {
        if (checkDate < todayDateStr || (checkDate === todayDateStr && checkTime < '00:00')) {
          // Too early, move forward
          candidateUTC.setUTCHours(candidateUTC.getUTCHours() + 1);
        } else {
          // Too late, move backward
          candidateUTC.setUTCHours(candidateUTC.getUTCHours() - 1);
        }
        
        checkTime = candidateUTC.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
        checkDate = candidateUTC.toLocaleDateString('en-CA', { timeZone: timezone });
        iterations++;
      }
      
      return candidateUTC;
    };
    
    // Get start of today in user's timezone (as UTC timestamp)
    const todayStartUTC = getTodayStartUTC(userTimezone);
    
    const todaySubmissions = applications.filter(app => {
      const appDate = new Date(app.created_at);
      return appDate >= todayStartUTC;
    }).length;

    // Helper function to calculate business days deadline
    const calculateBusinessDaysDeadline = (startDate, businessDays) => {
      const date = new Date(startDate);
      let daysAdded = 0;
      
      while (daysAdded < businessDays) {
        date.setDate(date.getDate() + 1);
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (date.getDay() !== 0 && date.getDay() !== 6) {
          daysAdded++;
        }
      }
      
      return date;
    };

    // Helper function to calculate calendar days deadline (including weekends)
    const calculateCalendarDaysDeadline = (startDate, calendarDays) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + calendarDays);
      return date;
    };

    // Deadline calculations
    const now = new Date();
    let urgentCount = 0;
    let nearDeadlineCount = 0;
    let overdueCount = 0;

    applications.forEach(app => {
      // Skip completed and rejected applications (rejected is terminal)
      if (app.status === 'rejected') return;
      if (isMultiCommunitySettlementCompleted(app)) {
        return;
      }
      if (isRegularApplicationCompleted(app)) {
        return;
      }

      // Calculate deadline based on package type
      // Rush: 5 business days, Standard: 15 calendar days (including weekends)
      const submittedDate = new Date(app.submitted_at || app.created_at);
      let deadline;
      if (app.package_type === 'rush') {
        deadline = calculateBusinessDaysDeadline(submittedDate, 5);
      } else {
        deadline = calculateCalendarDaysDeadline(submittedDate, 15);
      }

      const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

      // Overdue: at deadline (0 hours) or past deadline (negative hours)
      if (hoursUntilDeadline <= 0) {
        overdueCount++;
        urgentCount++;
      } 
      // Near deadline: within 2 days (48 hours) of due date
      else if (hoursUntilDeadline < 48) {
        nearDeadlineCount++;
        urgentCount++;
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

    // Store in cache with 1-minute TTL (shorter so urgent metric stays in sync with list)
    await setCache(cacheKey, summary, 60);

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
