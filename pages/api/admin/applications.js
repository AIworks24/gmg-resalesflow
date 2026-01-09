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
      search = '',
      dateStart = null,
      dateEnd = null,
      sortBy = 'created_at',  // Default sort field
      sortOrder = 'desc',      // Default sort direction
      bypassCache = false     // For real-time refreshes
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const shouldBypassCache = bypassCache === 'true' || bypassCache === true;

    // Generate dynamic cache key based on filters (including sort parameters and user ID to prevent collisions)
    const cacheKey = `admin:applications:${user.id}:${status}:${search}:${dateStart || 'null'}:${dateEnd || 'null'}:${sortBy}:${sortOrder}:${pageNum}:${limitNum}`;
    
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
    const allowedSortFields = ['created_at', 'property_address', 'status', 'submitter_name', 'application_type'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const isAscending = sortOrder === 'asc';

    // For computed statuses that can be calculated server-side, we need to fetch all applications first
    // Statuses that require workflow steps (ongoing, payment_confirmed, approved) are handled client-side
    const serverSideComputedStatuses = ['completed', 'pending', 'urgent'];
    const needsPostFiltering = serverSideComputedStatuses.includes(status);
    
    if (!needsPostFiltering) {
      // Apply pagination and sorting normally for standard statuses and client-side computed statuses
      const startIndex = (pageNum - 1) * limitNum;
      query = query
        .range(startIndex, startIndex + limitNum - 1)
        .order(validSortBy, { ascending: isAscending });
    } else {
      // For server-side computed statuses, fetch all (no pagination yet) but still apply sorting
      query = query.order(validSortBy, { ascending: isAscending });
    }

    // Execute query
    const { data: applications, error: queryError, count } = await query;

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

    // Apply custom status filters if needed (using same logic as dashboard)
    let filteredApplications = applications || [];
    let finalCount = count || 0;
    
    if (status === 'completed') {
      filteredApplications = filteredApplications.filter(app => {
        // For multi-community settlement applications, use special completion check
        if (isMultiCommunitySettlementCompleted(app)) {
          return true;
        }
        // For regular applications, use strict completion check (matches getWorkflowStep logic)
        return isRegularApplicationCompleted(app);
      });
    } else if (status === 'pending') {
      // Pending = all non-completed applications (same logic as dashboard: total - completed)
      filteredApplications = filteredApplications.filter(app => {
        // For multi-community settlement applications, use special completion check
        if (isMultiCommunitySettlementCompleted(app)) {
          return false; // Completed, so not pending
        }
        // For regular applications, use strict completion check
        return !isRegularApplicationCompleted(app);
      });
    } else if (status === 'urgent') {
      // Urgent = applications that are overdue or within 24 hours of deadline (same logic as dashboard)
      const now = new Date();
      filteredApplications = filteredApplications.filter(app => {
        // Skip completed applications (use strict completion check)
        if (isMultiCommunitySettlementCompleted(app)) {
          return false;
        }
        if (isRegularApplicationCompleted(app)) {
          return false;
        }

        // Calculate deadline (7 days from submission, same as dashboard)
        const submittedDate = new Date(app.created_at);
        const deadline = new Date(submittedDate);
        deadline.setDate(deadline.getDate() + 7);

        const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

        // Urgent if overdue or within 24 hours of deadline
        return hoursUntilDeadline < 24;
      });
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
