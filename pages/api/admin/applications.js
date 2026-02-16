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

    // Parse query parameters
    const { 
      page = 1, 
      limit = 1000,  // Default to high limit for backward compatibility
      status = 'all', 
      urgency = 'all',  // 'all' | 'overdue' | 'near_deadline' – when set, we fetch all and filter so list matches metric
      search = '',
      dateStart = null,
      dateEnd = null,
      sortBy = 'submitted_at',  // Default sort field (booked/received date)
      sortOrder = 'desc',      // Default sort direction
      bypassCache = false     // For real-time refreshes
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const shouldBypassCache = bypassCache === 'true' || bypassCache === true;

    // Generate dynamic cache key based on filters (including sort parameters and user ID to prevent collisions)
    const cacheKey = `admin:applications:${user.id}:${status}:${urgency}:${search}:${dateStart || 'null'}:${dateEnd || 'null'}:${sortBy}:${sortOrder}:${pageNum}:${limitNum}`;
    
    // Try to get from cache first (unless bypassed for real-time updates)
    if (!shouldBypassCache) {
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        console.log('✅ Applications cache HIT:', cacheKey);
        return res.status(200).json({ 
          ...cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`❌ Applications cache ${shouldBypassCache ? 'BYPASSED (real-time refresh)' : 'MISS'} - fetching from database:`, cacheKey);

    // Build query - exclude soft-deleted applications
    let query = supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
        notifications(id, notification_type, status, sent_at),
        application_property_groups(
          id,
          is_primary,
          property_name,
          property_location,
          property_owner_email,
          status,
          created_at,
          pdf_url,
          pdf_status,
          pdf_completed_at,
          email_status,
          email_completed_at,
          inspection_status,
          inspection_completed_at,
          form_data,
          hoa_properties(id, name, location, property_owner_email)
        )
      `, { count: 'exact' })
      .is('deleted_at', null) // Only get non-deleted applications
      .neq('status', 'draft')
      .neq('status', 'pending_payment');

    // All admin, staff, and accounting users can see all applications
    // (No role-based filtering - accounting users now have full visibility)

    // Apply status filter
    // Note: 'completed', 'pending', 'urgent', 'ongoing', 'payment_confirmed', and 'approved' 
    // are computed statuses that use custom logic, so we'll filter after fetching for those cases
    // 'urgent' = applications that are overdue (at/past deadline) or near deadline (within 48 hours)
    // Deadline is based on package type: Rush = 5 business days, Standard = 15 calendar days
    const computedStatuses = ['completed', 'pending', 'urgent', 'ongoing', 'payment_confirmed', 'approved'];
    if (status !== 'all' && !computedStatuses.includes(status)) {
      query = query.eq('status', status);
    }

    // Apply search filter
    if (search) {
      query = query.or(`property_address.ilike.%${search}%,submitter_name.ilike.%${search}%,hoa_properties.name.ilike.%${search}%,id::text.ilike.%${search}%`);
    }

    // Apply date range filter
    if (dateStart && dateEnd) {
      query = query
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);
    }

    // Apply sorting (validate sortBy to prevent SQL injection)
    const allowedSortFields = ['created_at', 'submitted_at', 'property_address', 'status', 'submitter_name', 'application_type'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'submitted_at';
    const isAscending = sortOrder === 'asc';

    // For computed statuses that can be calculated server-side, we need to fetch all applications first
    // Statuses that require workflow steps (ongoing, payment_confirmed, approved) are handled client-side
    // When urgency=overdue or urgency=near_deadline we must fetch all so the list matches the dashboard metric
    const serverSideComputedStatuses = ['completed', 'pending', 'urgent'];
    const urgencyRequiresFullFetch = urgency === 'overdue' || urgency === 'near_deadline';
    const needsPostFiltering = serverSideComputedStatuses.includes(status) || urgencyRequiresFullFetch;

    // For urgent: use 1000 so metric and list match (dashboard counts urgent from first 1000 only)
    // For completed/pending: use 10000 to ensure we get full counts
    const MAX_FOR_URGENT = 1000;
    const MAX_FOR_OTHER_COMPUTED = 10000;

    // Match dashboard: NULLS LAST so "first N" are true most recent (not old rows with null submitted_at)
    const orderOpts = { ascending: isAscending, nullsFirst: false };

    if (!needsPostFiltering) {
      // Apply pagination and sorting normally for standard statuses and client-side computed statuses
      const startIndex = (pageNum - 1) * limitNum;
      query = query
        .range(startIndex, startIndex + limitNum - 1)
        .order(validSortBy, orderOpts);
    } else {
      const maxFetch = status === 'urgent' ? MAX_FOR_URGENT : MAX_FOR_OTHER_COMPUTED;
      query = query
        .order(validSortBy, orderOpts)
        .range(0, maxFetch - 1);
    }

    // Execute query
    const { data: applications, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Helper: check if multi-community application is fully completed (matches getMultiCommunityWorkflowStep)
    const isMultiCommunityCompleted = (app) => {
      const propertyGroups = app.application_property_groups || [];
      if (propertyGroups.length === 0) return false;

      const isSettlementApp = app.submitter_type === 'settlement' || app.application_type?.startsWith('settlement');
      let completedProperties = 0;

      for (const group of propertyGroups) {
        let formsCompleted = false;
        if (isSettlementApp) {
          const settlementForm = app.property_owner_forms?.find(
            form => form.form_type === 'settlement_form' && form.property_group_id === group.id
          );
          formsCompleted = settlementForm?.status === 'completed';
        } else {
          const inspectionStatus = group.inspection_status ?? 'not_started';
          const resaleStatus = group.status === 'completed';
          formsCompleted = inspectionStatus === 'completed' && resaleStatus;
        }

        const pdfCompleted = group.pdf_status === 'completed' || !!group.pdf_url;
        const emailCompleted = group.email_status === 'completed' || !!group.email_completed_at;
        if (formsCompleted && pdfCompleted && emailCompleted) {
          completedProperties++;
        }
      }
      return completedProperties === propertyGroups.length;
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

    // Apply custom status filters if needed (using same logic as dashboard)
    let filteredApplications = applications || [];
    let finalCount = count || 0;
    
    if (status === 'completed') {
      filteredApplications = filteredApplications.filter(app => {
        // Rejected applications count as completed (terminal state)
        if (app.status === 'rejected') return true;
        // For multi-community settlement applications, use special completion check
        if (isMultiCommunityCompleted(app)) {
          return true;
        }
        // For regular applications, use strict completion check (matches getWorkflowStep logic)
        return isRegularApplicationCompleted(app);
      });
    } else if (status === 'pending') {
      // Pending = all non-completed applications (exclude completed and rejected)
      filteredApplications = filteredApplications.filter(app => {
        if (app.status === 'rejected') return false;
        // For multi-community settlement applications, use special completion check
        if (isMultiCommunityCompleted(app)) {
          return false; // Completed, so not pending
        }
        // For regular applications, use strict completion check
        return !isRegularApplicationCompleted(app);
      });
    } else if (status === 'urgent') {
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

      // Urgent = applications that are overdue (at/past deadline) or near deadline (within 48 hours)
      const now = new Date();
      filteredApplications = filteredApplications.filter(app => {
        // Skip rejected (terminal state)
        if (app.status === 'rejected') return false;
        // Skip completed applications (use strict completion check)
        if (isMultiCommunityCompleted(app)) {
          return false;
        }
        if (isRegularApplicationCompleted(app)) {
          return false;
        }

        // Calculate deadline based on package type (same as dashboard)
        // Rush: 5 business days, Standard: 15 calendar days (including weekends)
        const submittedDate = new Date(app.submitted_at || app.created_at);
        let deadline;
        if (app.package_type === 'rush') {
          deadline = calculateBusinessDaysDeadline(submittedDate, 5);
        } else {
          deadline = calculateCalendarDaysDeadline(submittedDate, 15);
        }

        const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

        // Urgent if overdue (at/past deadline) or within 48 hours (2 days) of deadline
        return hoursUntilDeadline < 48;
      });
    }

    // Apply urgency filter (overdue / near_deadline) so list matches dashboard metric
    // When user selects "Overdue Only" or "Near Deadline Only", we already fetched all (urgencyRequiresFullFetch)
    if (urgency === 'overdue' || urgency === 'near_deadline') {
      const calculateBusinessDaysDeadline = (startDate, businessDays) => {
        const date = new Date(startDate);
        let daysAdded = 0;
        while (daysAdded < businessDays) {
          date.setDate(date.getDate() + 1);
          if (date.getDay() !== 0 && date.getDay() !== 6) daysAdded++;
        }
        return date;
      };
      const calculateCalendarDaysDeadline = (startDate, calendarDays) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + calendarDays);
        return date;
      };
      const now = new Date();
      filteredApplications = filteredApplications.filter(app => {
        if (app.status === 'rejected') return false;
        if (isMultiCommunityCompleted(app)) return false;
        if (isRegularApplicationCompleted(app)) return false;
        const submittedDate = new Date(app.submitted_at || app.created_at);
        const deadline = app.package_type === 'rush'
          ? calculateBusinessDaysDeadline(submittedDate, 5)
          : calculateCalendarDaysDeadline(submittedDate, 15);
        const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);
        if (urgency === 'overdue') return hoursUntilDeadline <= 0;
        if (urgency === 'near_deadline') return hoursUntilDeadline > 0 && hoursUntilDeadline < 48;
        return false;
      });
      finalCount = filteredApplications.length;
    }
    
    // Recalculate count and apply pagination for custom statuses
    if (needsPostFiltering) {
      finalCount = filteredApplications.length;
      
      // Apply pagination manually after filtering
      const startIndex = (pageNum - 1) * limitNum;
      filteredApplications = filteredApplications.slice(startIndex, startIndex + limitNum);
    }

    // Use filtered applications for processing
    const paginatedApplications = filteredApplications;

    // Process the data to group forms by application
    const processedApplications = paginatedApplications.map((app) => {
      const inspectionForm = app.property_owner_forms?.find(
        (f) => f.form_type === 'inspection_form'
      );
      const resaleCertificate = app.property_owner_forms?.find(
        (f) => f.form_type === 'resale_certificate'
      );

      return {
        ...app,
        forms: {
          inspectionForm: inspectionForm || {
            status: 'not_created',
            id: null,
          },
          resaleCertificate: resaleCertificate || {
            status: 'not_created',
            id: null,
          },
        },
        notifications: app.notifications || [],
      };
    });

    // Prepare response data
    const responseData = {
      data: processedApplications,
      count: finalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(finalCount / limitNum)
    };

    // Store in cache with short TTL (2 minutes) for real-time compatibility
    // Only cache if not bypassed (real-time refreshes shouldn't update cache)
    if (!shouldBypassCache) {
      await setCache(cacheKey, responseData, 120); // 2 minutes TTL
    }

    return res.status(200).json({ 
      ...responseData,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Applications API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch applications',
      message: error.message 
    });
  }
}
