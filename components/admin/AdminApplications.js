import React, { useState, useEffect, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import useSWR from 'swr';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  Calendar,
  Building,
  User,
  Filter,
  Search,
  RefreshCw,
  Edit,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Upload,
  Trash2,
  Paperclip,
  Mail,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { mapFormDataToPDFFields } from '../../lib/pdfService';
import AdminPropertyInspectionForm from './AdminPropertyInspectionForm';
import AdminResaleCertificateForm from './AdminResaleCertificateForm';
import AdminSettlementForm from './AdminSettlementForm';
import AdminLayout from './AdminLayout';

const AdminApplications = ({ userRole }) => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Get parameters from URL query (for dashboard navigation)
  const urlStatus = router.query.status || 'all';
  const sortBy = router.query.sortBy || 'created_at';
  const sortOrder = router.query.sortOrder || 'desc';

  // Initialize state from URL params
  const [selectedStatus, setSelectedStatus] = useState(urlStatus);
  const [selectedApplicationType, setSelectedApplicationType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingPDFForProperty, setGeneratingPDFForProperty] = useState(null); // Track which property is generating PDF
  const [sendingEmailForProperty, setSendingEmailForProperty] = useState(null); // Track which property is sending email
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [temporaryAttachments, setTemporaryAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [propertyFiles, setPropertyFiles] = useState([]);
  const [loadingPropertyFiles, setLoadingPropertyFiles] = useState(false);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'success' });
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [staffMembers, setStaffMembers] = useState([]);
  const [assigningApplication, setAssigningApplication] = useState(null);
  const [showInspectionFormModal, setShowInspectionFormModal] = useState(false);
  const [showResaleFormModal, setShowResaleFormModal] = useState(false);
  const [showSettlementFormModal, setShowSettlementFormModal] = useState(false);
  const [selectedApplicationForSettlement, setSelectedApplicationForSettlement] = useState(null);
  const [showPropertyFilesModal, setShowPropertyFilesModal] = useState(false);
  const [selectedFilesForUpload, setSelectedFilesForUpload] = useState([]);
  const [inspectionFormData, setInspectionFormData] = useState(null);
  const [resaleFormData, setResaleFormData] = useState(null);
  const [loadingFormData, setLoadingFormData] = useState(false);
  const [currentFormType, setCurrentFormType] = useState(null); // 'inspection' | 'resale'
  const [currentFormId, setCurrentFormId] = useState(null);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [loadingFormKey, setLoadingFormKey] = useState(null); // scope loading to a specific button
  const [propertyGroups, setPropertyGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sendingGroupEmail, setSendingGroupEmail] = useState(null);
  const [regeneratingGroupDocs, setRegeneratingGroupDocs] = useState(null);

  // Sync selectedStatus with URL query parameter when it changes (for dashboard navigation)
  useEffect(() => {
    const statusFromUrl = router.query.status || 'all';
    if (statusFromUrl !== selectedStatus) {
      setSelectedStatus(statusFromUrl);
    }
  }, [router.query.status, router.isReady]);

  // SWR fetcher function
  const fetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const error = new Error('Failed to fetch applications');
      error.info = await res.json();
      error.status = res.status;
      throw error;
    }
    return res.json();
  };

  // Build dynamic API URL with sort parameters
  const apiUrl = `/api/admin/applications?sortBy=${sortBy}&sortOrder=${sortOrder}`;

  // Fetch applications using SWR (will auto-refresh when URL changes)
  const { data: swrData, error: swrError, isLoading, mutate } = useSWR(
    apiUrl,
    fetcher,
    {
      refreshInterval: 0, // Disable auto-refresh (manual refresh only)
      revalidateOnFocus: false,
      dedupingInterval: 5000, // Prevent duplicate requests within 5 seconds
    }
  );

  // Snackbar helper function
  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: '', type: 'success' });
    }, 4000); // Hide after 4 seconds
  };

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


  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateFilter) {
      case 'today':
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'week':
        const weekStart = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
        const weekEnd = new Date(weekStart.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);
        return { start: weekStart, end: weekEnd };
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start: monthStart, end: monthEnd };
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          return {
            start: new Date(customDateRange.startDate),
            end: new Date(customDateRange.endDate + 'T23:59:59.999Z')
          };
        }
        return null;
      default:
        return null;
    }
  };

  const isApplicationUrgent = (application) => {
    // Skip completed applications
    if (application.notifications?.some(n => n.notification_type === 'application_approved')) {
      return false;
    }

    // Skip applications that haven't been submitted
    if (!application.submitted_at) {
      return false;
    }

    // Calculate deadline based on package type using business days
    const submittedDate = new Date(application.submitted_at);
    const businessDays = application.package_type === 'rush' ? 5 : 15; // Use max for standard (10-15 days)
    const deadline = calculateBusinessDaysDeadline(submittedDate, businessDays);

    const now = new Date();
    const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

    // Urgent if overdue or within 48 hours of deadline
    return hoursUntilDeadline < 48;
  };

  // Get current user email for assignment filter
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    // Handle URL query parameters on component mount
    const { query } = router;
    if (query.status) {
      setSelectedStatus(query.status);
    }
    if (query.date) {
      setDateFilter(query.date);
    }

    // Get current user email
    const getCurrentUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email);
      }
    };
    getCurrentUserEmail();

    // Load staff members for assignment dropdown
    const loadStaffMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('email, first_name, last_name, role')
          .in('role', ['admin', 'staff'])
          .eq('active', true)
          .order('first_name');

        if (error) throw error;
        setStaffMembers(data || []);
      } catch (error) {
        console.error('Failed to load staff members:', error);
      }
    };
    loadStaffMembers();
  }, [router.query]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, customDateRange, assignedToMe, selectedStatus, selectedApplicationType, searchTerm]);


  // Load property files when attachment modal opens
  useEffect(() => {
    if (showAttachmentModal && selectedApplication?.hoa_property_id) {
      loadPropertyFiles(selectedApplication.hoa_property_id);
    } else if (showAttachmentModal && !selectedApplication?.hoa_property_id) {
      setLoadingPropertyFiles(false);
      setPropertyFiles([]);
    }
  }, [showAttachmentModal, selectedApplication?.hoa_property_id]);

  // Load property groups when application is selected
  useEffect(() => {
    if (selectedApplication?.id) {
      // Use property groups from API response if available (faster, no extra query)
      if (selectedApplication.application_property_groups) {
        // Sort property groups to ensure primary is always first
        const sortedGroups = selectedApplication.application_property_groups.sort((a, b) => {
          // Primary property always comes first
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          // If both are primary or both are secondary, sort by name
          return (a.property_name || '').localeCompare(b.property_name || '');
        });
        setPropertyGroups(sortedGroups);
        setLoadingGroups(false);
      } else {
        // Fallback to separate query if not in API response
        loadPropertyGroups(selectedApplication.id);
      }
    } else {
      setPropertyGroups([]);
    }
  }, [selectedApplication?.id, selectedApplication?.application_property_groups]);

  // Auto-create property groups for multi-community applications
  useEffect(() => {
    // Quick check: if data is already in API response, use it immediately (no delay)
    if (selectedApplication?.hoa_properties?.is_multi_community && 
        selectedApplication?.id && 
        selectedApplication.application_property_groups && 
        selectedApplication.application_property_groups.length > 0 &&
        propertyGroups.length === 0) {
      setPropertyGroups(selectedApplication.application_property_groups);
      return;
    }
    
    const checkAndCreateGroups = async () => {
      // Only run if we have a multi-community application and no groups loaded yet
      if (selectedApplication?.hoa_properties?.is_multi_community && 
          selectedApplication?.id && 
          !loadingGroups && 
          propertyGroups.length === 0) {
        
        // Check if groups are already in the API response (preferred)
        if (selectedApplication.application_property_groups && 
            selectedApplication.application_property_groups.length > 0) {
          setPropertyGroups(selectedApplication.application_property_groups);
          return;
        }
        
        try {
          // Fallback: try to load existing groups via direct query
          const { data: existingGroups, error } = await supabase
            .from('application_property_groups')
            .select('*')
            .eq('application_id', selectedApplication.id);

          if (error) {
            console.error('Error checking existing groups:', error);
            return;
          }

          if (existingGroups && existingGroups.length > 0) {
            // Groups already exist, just load them
            setPropertyGroups(existingGroups);
          } else {
            // No groups exist, create them
            const response = await fetch('/api/admin/create-property-groups', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ applicationId: selectedApplication.id })
            });
            
            if (response.ok) {
              // Reload the groups
              loadPropertyGroups(selectedApplication.id);
            } else {
              const error = await response.json();
              console.error('Failed to create property groups:', error);
            }
          }
        } catch (error) {
          console.error('Error in checkAndCreateGroups:', error);
        }
      }
    };

    // Run the check after a short delay to ensure the component is fully loaded
    // Only use timeout if we need to query/create (not when data is already in API response)
    const timeoutId = setTimeout(checkAndCreateGroups, 500);
    
    return () => clearTimeout(timeoutId);
  }, [
    selectedApplication?.hoa_properties?.is_multi_community, 
    selectedApplication?.id, 
    selectedApplication?.application_property_groups,  // Added to detect API data arrival
    loadingGroups, 
    propertyGroups.length
  ]);

  // Client-side filtering and pagination using useMemo
  const { applications, totalCount } = useMemo(() => {
    // API response structure: { data: [...], count: X, page: Y, limit: Z }
    if (!swrData?.data) {
      return { applications: [], totalCount: 0 };
    }

    let filtered = [...swrData.data];

    // Apply role-based filtering (backup to server-side filtering)
    if (userRole === 'accounting') {
      // Accounting users can only see settlement applications
      filtered = filtered.filter(app => 
        app.submitter_type === 'settlement' || 
        app.application_type?.startsWith('settlement')
      );
    }
    // Admin and staff users can see all applications (no additional filtering)

    // Apply date filter
    const dateRange = getDateRange();
    if (dateRange) {
      filtered = filtered.filter(app => {
        const createdAt = new Date(app.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
    }

    // Apply status filter
    if (selectedStatus !== 'all' && selectedStatus !== 'urgent') {
      if (selectedStatus === 'ongoing') {
        filtered = filtered.filter(app =>
          ['under_review', 'compliance_pending', 'compliance_completed', 'documents_generated', 'awaiting_property_owner_response'].includes(app.status)
        );
      } else if (selectedStatus === 'pending') {
        // Pending = applications without approval notifications
        filtered = filtered.filter(app =>
          !app.notifications?.some(n => n.notification_type === 'application_approved')
        );
      } else if (selectedStatus === 'completed') {
        // Completed = applications with approval notifications
        filtered = filtered.filter(app =>
          app.notifications?.some(n => n.notification_type === 'application_approved')
        );
      } else {
        filtered = filtered.filter(app => app.status === selectedStatus);
      }
    } else if (selectedStatus === 'urgent') {
      filtered = filtered.filter(app => isApplicationUrgent(app));
    }

    // Apply application type filter
    if (selectedApplicationType !== 'all') {
      filtered = filtered.filter(app => app.application_type === selectedApplicationType);
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(app =>
        app.property_address?.toLowerCase().includes(searchLower) ||
        app.submitter_name?.toLowerCase().includes(searchLower) ||
        app.hoa_properties?.name?.toLowerCase().includes(searchLower)
      );
    }

    // Apply assigned to me filter
    if (assignedToMe && userEmail) {
      filtered = filtered.filter(app => app.assigned_to === userEmail);
    }

    const count = filtered.length;

    // Apply pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

    return { applications: paginated, totalCount: count };
  }, [swrData, dateFilter, customDateRange, selectedStatus, selectedApplicationType, searchTerm, assignedToMe, userEmail, currentPage, itemsPerPage, userRole]);


  const handleAssignApplication = async (applicationId, assignedTo) => {
    setAssigningApplication(applicationId);
    try {
      const response = await fetch('/api/assign-application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId, assignedTo }),
      });

      if (response.ok) {
        showSnackbar(assignedTo ? `Application assigned to ${assignedTo}` : 'Application unassigned', 'success');
        await mutate(); // Refresh the applications list
        
        // Update the selected application if it's open in the modal
        if (selectedApplication && selectedApplication.id === applicationId) {
          setSelectedApplication({
            ...selectedApplication,
            assigned_to: assignedTo
          });
        }
      } else {
        const error = await response.json();
        showSnackbar(error.error || 'Failed to assign application', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to assign application', 'error');
    } finally {
      setAssigningApplication(null);
    }
  };

  const handleCompleteTask = async (applicationId, taskName) => {
    try {
      const response = await fetch('/api/complete-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId, taskName }),
      });

      if (response.ok) {
        showSnackbar(`${taskName.replace('_', ' ')} task completed`, 'success');
        
        // Update the selected application if it's open in the modal
        try {
          await refreshSelectedApplication(applicationId);
        } catch (refreshError) {
          console.warn('Failed to refresh selected application after task completion:', refreshError);
        }
        
         // Refresh applications list immediately
         await mutate();
      } else {
        const error = await response.json();
        showSnackbar(error.error || 'Failed to complete task', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to complete task', 'error');
    }
  };

  const handleSaveComments = async (applicationId, comments) => {
    try {
      const response = await fetch('/api/save-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId, comments }),
      });

      if (response.ok) {
        showSnackbar('Comments saved successfully', 'success');
        
        // Update the selected application if it's open in the modal
        try {
          await refreshSelectedApplication(applicationId);
        } catch (refreshError) {
          console.warn('Failed to refresh selected application after saving comments:', refreshError);
        }
        
         // Refresh applications list immediately so dashboard reflects new state
         await mutate();
      } else {
        const error = await response.json();
        showSnackbar(error.error || 'Failed to save comments', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to save comments', 'error');
    }
  };


  const getWorkflowStep = (application) => {
    // Check if this is a settlement application
    const isSettlementApp = application.submitter_type === 'settlement' || 
                            application.application_type?.startsWith('settlement');

    if (isSettlementApp) {
      // Settlement workflow - 3 tasks (Form + PDF + Email)
      const settlementForm = application.property_owner_forms?.find(form => form.form_type === 'settlement_form');
      const settlementFormStatus = settlementForm?.status || 'not_started';
      const hasPDF = application.pdf_url;
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');

      if (settlementFormStatus === 'not_started' || settlementFormStatus === 'not_created') {
        return { step: 1, text: 'Form Required', color: 'bg-yellow-100 text-yellow-800' };
      }
      
      if (!hasPDF) {
        return { step: 2, text: 'Generate PDF', color: 'bg-orange-100 text-orange-800' };
      }
      
      if (!hasNotificationSent) {
        return { step: 3, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
      }
      
      return { step: 4, text: 'Completed', color: 'bg-green-100 text-green-800' };
    }

    // Check if this is a multi-community application
    const isMultiCommunity = application.hoa_properties?.is_multi_community && 
                            application.application_property_groups && 
                            application.application_property_groups.length > 1;

    if (isMultiCommunity) {
      return getMultiCommunityWorkflowStep(application);
    }

    // Standard single property workflow
    const inspectionForm = application.property_owner_forms?.find(form => form.form_type === 'inspection_form');
    const resaleForm = application.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
    const inspectionStatus = inspectionForm?.status || 'not_started';
    const resaleStatus = resaleForm?.status || 'not_started';
    const hasPDF = application.pdf_url;
    const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');

    if ((inspectionStatus === 'not_created' || inspectionStatus === 'not_started') && 
        (resaleStatus === 'not_created' || resaleStatus === 'not_started')) {
      return { step: 1, text: 'Forms Required', color: 'bg-yellow-100 text-yellow-800' };
    }
    
    if (inspectionStatus !== 'completed' || resaleStatus !== 'completed') {
      return { step: 2, text: 'Forms In Progress', color: 'bg-blue-100 text-blue-800' };
    }
    
    if (!hasPDF) {
      return { step: 3, text: 'Generate PDF', color: 'bg-orange-100 text-orange-800' };
    }
    
    if (!hasNotificationSent) {
      return { step: 4, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
    }
    
    return { step: 5, text: 'Completed', color: 'bg-green-100 text-green-800' };
  };

  const getMultiCommunityWorkflowStep = (application) => {
    const propertyGroups = application.application_property_groups || [];
    
    if (propertyGroups.length === 0) {
      return { step: 1, text: 'Forms Required', color: 'bg-yellow-100 text-yellow-800' };
    }

    // Track progress for each property group
    let totalProperties = propertyGroups.length;
    let completedProperties = 0;
    let formsInProgress = 0;
    let pdfsGenerated = 0;
    let emailsSent = 0;

    propertyGroups.forEach((group, index) => {
      const isPrimary = group.is_primary;
      
      // Check form completion based on property type
      let formsCompleted = false;
      if (isPrimary) {
        // Primary property needs both inspection and resale forms
        const inspectionForm = application.property_owner_forms?.find(form => form.form_type === 'inspection_form');
        const inspectionStatus = inspectionForm?.status || 'not_started';
        const resaleStatus = group.status === 'completed';
        formsCompleted = inspectionStatus === 'completed' && resaleStatus;
      } else {
        // Secondary properties only need resale form
        formsCompleted = group.status === 'completed';
      }

      if (formsCompleted) {
        // Check PDF generation
        if (group.pdf_status === 'completed' || group.pdf_url) {
          pdfsGenerated++;
          
          // Check email sending
          if (group.email_status === 'completed' || group.email_completed_at) {
            emailsSent++;
            completedProperties++;
          }
        }
      } else {
        // Check if forms are in progress
        const inspectionForm = application.property_owner_forms?.find(form => form.form_type === 'inspection_form');
        if (group.status === 'in_progress' || 
            (isPrimary && inspectionForm?.status === 'in_progress')) {
          formsInProgress++;
        }
      }
    });

    // Determine workflow step based on progress
    if (completedProperties === totalProperties) {
      return { step: 5, text: 'Completed', color: 'bg-green-100 text-green-800' };
    }
    
    if (emailsSent > 0 && emailsSent < totalProperties) {
      return { step: 4, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
    }
    
    if (pdfsGenerated > 0 && pdfsGenerated < totalProperties) {
      return { step: 3, text: 'Generate PDF', color: 'bg-orange-100 text-orange-800' };
    }
    
    if (formsInProgress > 0 || (formsInProgress === 0 && pdfsGenerated === 0)) {
      return { step: 2, text: 'Forms In Progress', color: 'bg-blue-100 text-blue-800' };
    }
    
    return { step: 1, text: 'Forms Required', color: 'bg-yellow-100 text-yellow-800' };
  };

  // Helper functions for modal
  const getTaskStatusIcon = (status, isGenerating = false) => {
    if (isGenerating) {
      return <RefreshCw className='w-5 h-5 text-blue-600 animate-spin' />;
    }
    
    switch (status) {
      case 'completed':
        return <CheckCircle className='w-5 h-5 text-green-600' />;
      case 'update_needed':
        return <AlertTriangle className='w-5 h-5 text-orange-600' />;
      case 'generating':
      case 'sending':
        return <RefreshCw className='w-5 h-5 text-blue-600 animate-spin' />;
      case 'in_progress':
        return <Edit className='w-5 h-5 text-blue-600' />;
      case 'not_started':
      default:
        return <Clock className='w-5 h-5 text-gray-400' />;
    }
  };

  const getTaskStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'update_needed':
        return 'Update Needed';
      case 'generating':
        return 'Generating...';
      case 'sending':
        return 'Sending...';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
      default:
        return 'Not Started';
    }
  };

  const getTaskStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'update_needed':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'generating':
      case 'sending':
      case 'in_progress':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'not_started':
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTaskStatuses = (application) => {
    const isSettlementApp = application.submitter_type === 'settlement' || 
                           application.application_type?.startsWith('settlement');
    
    if (isSettlementApp) {
      // Settlement application
      const settlementForm = application.property_owner_forms?.find(form => form.form_type === 'settlement_form');
      
      // Check settlement form status - use settlement_form_completed_at if available, otherwise check form status
      let settlementFormStatus = 'not_started';
      if (application.settlement_form_completed_at) {
        settlementFormStatus = 'completed';
      } else if (settlementForm?.status === 'completed') {
        settlementFormStatus = 'completed';
      } else if (settlementForm?.status === 'in_progress') {
        settlementFormStatus = 'in_progress';
      }
      
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = application.email_completed_at;

      // Derive PDF status from settlement PDF URL
      let pdfStatus = 'not_started';
      if (application.pdf_url && application.pdf_generated_at) {
        // Check if settlement form was updated after PDF generation
        const pdfGeneratedAt = new Date(application.pdf_generated_at || 0);
        
        // Only use settlement form's updated_at if it exists, don't compare with application.updated_at
        // because application.updated_at changes when we set pdf_generated_at
        if (settlementForm?.updated_at) {
          const formUpdatedAt = new Date(settlementForm.updated_at || 0);
          
          // If form was updated after PDF generation, mark as needing update
          if (formUpdatedAt > pdfGeneratedAt) {
            pdfStatus = 'update_needed';
          } else {
            pdfStatus = 'completed';
          }
        } else {
          // If no settlement form found, but PDF exists, it's completed
          pdfStatus = 'completed';
        }
      }

      return {
        settlement: settlementFormStatus,
        pdf: pdfStatus,
        email: (hasNotificationSent || hasEmailCompletedAt) ? 'completed' : 'not_started'
      };
    } else {
      // Standard application
      const inspectionForm = application.property_owner_forms?.find(form => form.form_type === 'inspection_form');
      const resaleForm = application.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
      const inspectionFormStatus = inspectionForm?.status || 'not_started';
      const resaleFormStatus = resaleForm?.status || 'not_started';
      
      // Derive PDF status from existing fields
      let pdfStatus = 'not_started';
      if (application.pdf_url && application.pdf_completed_at) {
        // Check if forms were updated after PDF generation
        const pdfGeneratedAt = new Date(application.pdf_generated_at || 0);
        const formsUpdatedAt = new Date(application.forms_updated_at || application.updated_at || 0);
        
        // If forms were updated after PDF generation, mark as needing update
        if (formsUpdatedAt > pdfGeneratedAt) {
          pdfStatus = 'update_needed';
        } else {
          pdfStatus = 'completed';
        }
      }
      
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = application.email_completed_at;

      return {
        inspection: inspectionFormStatus,
        resale: resaleFormStatus,
        pdf: pdfStatus,
        email: (hasNotificationSent || hasEmailCompletedAt) ? 'completed' : 'not_started'
      };
    }
  };

  const getFormButtonText = (status) => {
    switch (status) {
      case 'completed':
        return 'View';
      case 'in_progress':
        return 'Continue';
      case 'not_started':
      default:
        return 'Fill Form';
    }
  };

  const handleApplicationClick = async (application) => {
    try {
      setSelectedApplication(null); // Clear previous selection first
      setLoadingFormData(true);
      
      // Add a small delay to ensure state is cleared
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
          notifications(id, notification_type, status, sent_at),
          application_property_groups(
            id,
            property_name,
            property_location,
            is_primary,
            status,
            pdf_url,
            pdf_status,
            pdf_completed_at,
            email_status,
            email_completed_at,
            form_data
          )
        `)
        .eq('id', application.id)
        .single();

      if (appError) {
        console.error('❌ Error loading application:', appError);
        throw appError;
      }

      if (!appData) {
        console.error('❌ No application data found for ID:', application.id);
        throw new Error('Application not found');
      }

      // Process the data to match the expected format
      const inspectionForm = appData.property_owner_forms?.find(
        (f) => f.form_type === 'inspection_form'
      );
      const resaleCertificate = appData.property_owner_forms?.find(
        (f) => f.form_type === 'resale_certificate'
      );

      const processedApp = {
        ...appData,
        forms: {
          inspectionForm: inspectionForm || { status: 'not_created', id: null },
          resaleCertificate: resaleCertificate || { status: 'not_created', id: null },
        },
        notifications: appData.notifications || [],
        application_property_groups: appData.application_property_groups || []
      };

      setSelectedApplication(processedApp);
      
    } catch (error) {
      console.error('❌ Failed to load application:', error);
      showSnackbar('Failed to load application details: ' + error.message, 'error');
      setSelectedApplication(null);
    } finally {
      setLoadingFormData(false);
    }
  };

  const handleCompleteForm = async (applicationId, formType, group) => {
    setLoadingFormData(true);
    setLoadingFormKey(`${formType}:${group?.id || 'app'}`);
    setCurrentFormType(formType);
    setCurrentGroupId(group?.id || null);
    
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoadingFormData(false);
      setLoadingFormKey(null);
      showSnackbar('Form loading timed out. Please try again.', 'error');
    }, 10000); // 10 second timeout
    
    try {
      const newFormId = await loadFormData(applicationId, formType, group);
      if (newFormId) setCurrentFormId(newFormId);
      
      if (formType === 'inspection') {
        setShowInspectionFormModal(true);
      } else if (formType === 'resale') {
        setShowResaleFormModal(true);
      } else if (formType === 'settlement') {
        // Open settlement form modal
        setShowSettlementFormModal(true);
        setSelectedApplicationForSettlement(selectedApplication);
      }
    } catch (error) {
      console.error(`Failed to load form data for ${formType} form:`, error);
      showSnackbar('Failed to load form data: ' + error.message, 'error');
    } finally {
      clearTimeout(timeoutId);
      setLoadingFormData(false);
      setLoadingFormKey(null);
    }
  };

  const loadFormData = async (applicationId, formType, group) => {
    try {
      // Load application data with HOA properties
      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name, is_multi_community)
        `)
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      // If a property group is provided, override HOA context for the form UI
      const effectiveHoaName = group?.hoa_properties?.name || group?.property_name || appData.hoa_properties?.name;
      const effectiveHoaId = group?.property_id || appData.hoa_property_id;

      // Get or create the form
      let { data: formData, error: formError } = await supabase
        .from('property_owner_forms')
        .select('id, form_data, response_data, status')
        .eq('application_id', applicationId)
        .eq('form_type', formType === 'inspection' ? 'inspection_form' : 'resale_certificate')
        .single();

      // If no form exists, create it
      if (formError && formError.code === 'PGRST116') {
        const { data: newForm, error: createError } = await supabase
          .from('property_owner_forms')
          .insert([{
            application_id: applicationId,
            form_type: formType === 'inspection' ? 'inspection_form' : 'resale_certificate',
            status: 'not_started',
            access_token: crypto.randomUUID(),
            recipient_email: appData.hoa_properties?.property_owner_email || appData.submitter_email || 'admin@gmgva.com',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

         if (createError) throw createError;
         formData = newForm;
      } else if (formError) {
        throw formError;
      }

      // Load template data for resale certificate forms
      let templateData = null;
      if (formType === 'resale' && effectiveHoaId) {
        const { data: template } = await supabase
          .from('hoa_property_resale_templates')
          .select('template_data')
          .eq('hoa_property_id', effectiveHoaId)
          .single();
        
        templateData = template?.template_data || null;
      }

      // Combine the data
      const combinedData = {
        ...appData,
        // override HOA/name context for UI when working within a property group
        hoa_property_id: effectiveHoaId || appData.hoa_property_id,
        hoa_properties: {
          ...(appData.hoa_properties || {}),
          name: effectiveHoaName
        },
        property_owner_forms: [formData],
        resale_template: templateData
      };

      if (formType === 'inspection') {
        setInspectionFormData(combinedData);
      } else {
        setResaleFormData(combinedData);
      }

      return formData?.id || null;
    } catch (error) {
      console.error('Error loading form data:', error);
      throw error;
    }
  };

  const refreshSelectedApplication = async (applicationId) => {
    if (selectedApplication && selectedApplication.id === applicationId) {
      // Refetch the specific application with updated data
      const { data: updatedApp, error: queryError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
          notifications(id, notification_type, status, sent_at),
          application_property_groups(id, property_id, property_name, property_location, is_primary, status,
            hoa_properties(id, name, location)
          )
        `)
        .eq('id', applicationId)
        .maybeSingle();
      
      if (queryError) {
        console.error('Error refreshing application:', queryError);
        throw queryError;
      }
      
      if (updatedApp) {
        // Process the data to match the format
        const inspectionForm = updatedApp.property_owner_forms?.find(
          (f) => f.form_type === 'inspection_form'
        );
        const resaleCertificate = updatedApp.property_owner_forms?.find(
          (f) => f.form_type === 'resale_certificate'
        );
        
        const processedApp = {
          ...updatedApp,
          forms: {
            inspectionForm: inspectionForm || { status: 'not_created', id: null },
            resaleCertificate: resaleCertificate || { status: 'not_created', id: null },
          },
          notifications: updatedApp.notifications || [],
          application_property_groups: updatedApp.application_property_groups || []
        };
        
        setSelectedApplication(processedApp);
        // Keep property groups rendered after refresh
        if (processedApp.application_property_groups && processedApp.application_property_groups.length > 0) {
          setPropertyGroups(processedApp.application_property_groups);
        }
      }
    }
  };

  const handleFormComplete = async () => {
    // Only refresh the selected application if open (not all applications)
    if (selectedApplication) {
      try {
        await refreshSelectedApplication(selectedApplication.id);
      } catch (refreshError) {
        console.warn('Failed to refresh selected application after form completion:', refreshError);
      }
    }
    
    setShowInspectionFormModal(false);
    setShowResaleFormModal(false);
    setInspectionFormData(null);
    setResaleFormData(null);
    
    // Auto-mark the corresponding task complete when a form is submitted
    try {
      if (selectedApplication && currentFormType) {
        if (currentFormType === 'inspection') {
          // Application-level inspection completion (primary only)
          await fetch('/api/complete-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: selectedApplication.id, taskName: 'inspection_form' })
          });
          // Ensure the inspection form record shows completed in UI immediately
          if (currentFormId) {
            await supabase
              .from('property_owner_forms')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', currentFormId);
          }
          // Optimistic UI update so the task flips instantly
          setSelectedApplication((prev) => prev ? {
            ...prev,
            inspection_form_completed_at: new Date().toISOString(),
            forms: {
              ...prev.forms,
              inspectionForm: {
                ...(prev.forms?.inspectionForm || {}),
                status: 'completed'
              }
            }
          } : prev);
          try {
            await refreshSelectedApplication(selectedApplication.id);
          } catch (refreshError) {
            console.warn('Failed to refresh selected application after inspection form completion:', refreshError);
          }
        } else if (currentFormType === 'resale') {
          // Per-property: mark the specific group's status as completed
          if (currentGroupId) {
            await supabase
              .from('application_property_groups')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .eq('id', currentGroupId);
            await loadPropertyGroups(selectedApplication.id);
          } else {
            // Single-property application: mark the application-level resale task as complete
            await fetch('/api/complete-task', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ applicationId: selectedApplication.id, taskName: 'resale_certificate' })
            });
            try {
            await refreshSelectedApplication(selectedApplication.id);
          } catch (refreshError) {
            console.warn('Failed to refresh selected application after inspection form completion:', refreshError);
          }
          }
          // Optionally also set application-level when primary completes via UI button
        }
      }
    } catch (e) {
      console.error('Auto-complete task failed:', e);
    } finally {
      setCurrentFormType(null);
      setCurrentGroupId(null);
      setCurrentFormId(null);
    }
    
         // Refresh applications list immediately
         await mutate();
  };

  const handleGeneratePDF = async (formData, applicationId) => {
    const startTime = Date.now();
    console.log('🚀 Starting PDF generation for application:', applicationId);
    setGeneratingPDF(true);
    
    let pdfGeneratedSuccessfully = false;
    let pdfUrl = null;
    
    try {
      const response = await fetch('/api/regenerate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          applicationId,
        }),
      });
      
      const result = await response.json();
      console.log('📄 PDF API response:', result);
      
      if (!result.success) throw new Error(result.error || 'Failed to generate PDF');
      
      // Mark PDF as generated successfully
      pdfGeneratedSuccessfully = true;
      pdfUrl = result.pdfUrl;
      console.log('✅ PDF generated successfully!');
      
    } catch (error) {
      console.error('❌ Failed to generate PDF:', error);
      showSnackbar('Failed to generate PDF. Please try again.', 'error');
    }
    
    // Always clear the generating state first, regardless of what happened
    console.log('🔄 Clearing generatingPDF state');
    setGeneratingPDF(false);
    
    // If PDF was generated successfully, do the post-processing
    if (pdfGeneratedSuccessfully && pdfUrl) {
      try {
        // PRIMARY: Immediately update the selected application's PDF status
        // This ensures the UI updates instantly and consistently
        if (selectedApplication && selectedApplication.id === applicationId) {
          console.log('🔄 Immediately updating selected application PDF status');
          setSelectedApplication(prev => ({
            ...prev,
            pdf_url: pdfUrl,
            pdf_completed_at: new Date().toISOString(),
            pdf_generated_at: new Date().toISOString()
          }));
        }
        
        // SECONDARY: Try to refresh from database (optional, runs in background)
        try {
          await refreshSelectedApplication(applicationId);
          console.log('✅ Successfully refreshed selected application from database');
        } catch (refreshError) {
          console.warn('Database refresh failed, but UI was already updated:', refreshError);
        }
        
        // Refresh applications list immediately (with error handling)
        try {
          await mutate();
        } catch (mutateError) {
          console.warn('Failed to refresh applications list:', mutateError);
          // Don't throw - PDF was generated successfully
        }
        
        console.log('✅ Showing success message');
        showSnackbar('PDF generated successfully!', 'success');
        
      } catch (postProcessingError) {
        console.warn('Post-processing failed, but PDF was generated successfully:', postProcessingError);
        showSnackbar('PDF generated successfully!', 'success');
      }
    }
  };

  const handleGenerateSettlementPDF = async (applicationId) => {
    try {
      setGeneratingPDF(true);

      // Get settlement form data
      const settlementForm = selectedApplication.property_owner_forms?.find(
        form => form.form_type === 'settlement_form'
      );

      if (!settlementForm) {
        showSnackbar('Settlement form not found', 'error');
        return;
      }

      // Call the settlement PDF generation API
      const response = await fetch('/api/generate-settlement-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          formData: settlementForm.form_data || settlementForm.response_data,
        }),
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to generate PDF');
      
      // Refresh applications list
      await mutate();
      
      // Update the selected application if it's open in the modal
      if (selectedApplication && selectedApplication.id === applicationId) {
        const updatedApp = await refreshSelectedApplication(applicationId);
        if (updatedApp) {
          setSelectedApplication(updatedApp);
        }
      }
      
      showSnackbar('PDF generated successfully!', 'success');
    } catch (error) {
      console.error('Failed to generate settlement PDF:', error);
      showSnackbar('Failed to generate PDF. Please try again.', 'error');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleSendApprovalEmail = async (applicationId) => {
    console.log('🚀 Starting email send for application:', applicationId);
    setSendingEmail(true);
    
    let emailSentSuccessfully = false;
    
    try {
      // Include temporary attachments in the email request
      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          applicationId
        }),
      });

      const data = await response.json();
      console.log('📧 Email API response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send approval email');
      }

      // Mark email as sent successfully
      emailSentSuccessfully = true;
      console.log('✅ Email sent successfully!');
      
    } catch (error) {
      console.error('❌ Failed to send approval email:', error);
      
      // Handle specific PDF validation errors with helpful messages
      if (error.message.includes('PDF has not been generated')) {
        showSnackbar('PDF has not been generated yet. Please generate the PDF first.', 'error');
      } else {
        showSnackbar('Failed to send email. Please try again.', 'error');
      }
    }
    
    // Always clear the sending state first, regardless of what happened
    console.log('🔄 Clearing sendingEmail state');
    setSendingEmail(false);
    
    // If email was sent successfully, do the post-processing
    if (emailSentSuccessfully) {
      try {
        // Clear temporary attachments after successful send
        setTemporaryAttachments([]);
        
        // PRIMARY: Immediately update the selected application's email status
        // This ensures the UI updates instantly and consistently
        if (selectedApplication && selectedApplication.id === applicationId) {
          console.log('🔄 Immediately updating selected application email status');
          setSelectedApplication(prev => ({
            ...prev,
            // Update email completion fields
            email_completed_at: new Date().toISOString(),
            status: 'approved',
            updated_at: new Date().toISOString(),
            // Add notification record to indicate email was sent
            notifications: [
              ...(prev.notifications || []),
              {
                id: Date.now(), // Temporary ID
                application_id: applicationId,
                notification_type: 'application_approved',
                status: 'sent',
                sent_at: new Date().toISOString(),
                subject: `Resale Certificate Ready - ${prev.property_address}`,
                message: `Your Resale Certificate for ${prev.property_address} is now ready.`
              }
            ]
          }));
        }
        
        // SECONDARY: Try to refresh from database (optional, runs in background)
        try {
          await refreshSelectedApplication(applicationId);
          console.log('✅ Successfully refreshed selected application from database after email send');
        } catch (refreshError) {
          console.warn('Database refresh failed after email send, but UI was already updated:', refreshError);
        }
        
        // Refresh applications list immediately (with error handling)
        try {
          await mutate();
        } catch (mutateError) {
          console.warn('Failed to refresh applications list:', mutateError);
          // Don't throw - email was sent successfully
        }
        
        console.log('✅ Showing success message');
        showSnackbar('Email sent successfully!', 'success');
        
      } catch (postProcessingError) {
        console.warn('Post-processing failed, but email was sent successfully:', postProcessingError);
        showSnackbar('Email sent successfully!', 'success');
      }
    }
  };

  // Helper functions for attachment management
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setUploading(true);
    
    // Convert files to temporary attachment objects
    const newAttachments = files.map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
      isTemporary: true
    }));
    
    setTemporaryAttachments(prev => [...prev, ...newAttachments]);
    setUploading(false);
    
    // Clear the input
    event.target.value = '';
  };

  const removeTemporaryAttachment = (attachmentId) => {
    setTemporaryAttachments(prev => prev.filter(att => att.id !== attachmentId));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Property files loading function
  const loadPropertyFiles = async (propertyId) => {
    if (!propertyId) {
      console.log('No propertyId provided to loadPropertyFiles');
      setPropertyFiles([]);
      return;
    }
    
    console.log('Loading property files for propertyId:', propertyId);
    setLoadingPropertyFiles(true);
    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .list(`property_files/${propertyId}`, {
          limit: 100,
          offset: 0
        });

      if (error) {
        console.error('Storage list error:', error);
        throw error;
      }
      
      console.log('Found files:', data?.length || 0);
      
      // Convert to format with URLs
      const filesWithUrls = await Promise.all((data || []).map(async (file) => {
        const { data: urlData, error: urlError } = await supabase.storage
          .from('bucket0')
          .createSignedUrl(`property_files/${propertyId}/${file.name}`, 3600); // 1 hour expiry
        
        if (urlError) {
          console.error('Error creating signed URL for file:', file.name, urlError);
        }
        
        return {
          id: `property-${file.name}`,
          name: file.name.split('_').slice(1).join('_'), // Remove timestamp prefix
          originalName: file.name,
          size: file.metadata?.size || 0,
          type: file.metadata?.mimetype || 'application/octet-stream',
          url: urlData?.signedUrl,
          isProperty: true
        };
      }));
      
      console.log('Property files loaded successfully:', filesWithUrls.length);
      setPropertyFiles(filesWithUrls);
    } catch (error) {
      console.error('Error loading property files:', error);
      setPropertyFiles([]);
      showSnackbar('Failed to load property files: ' + error.message, 'error');
    } finally {
      setLoadingPropertyFiles(false);
    }
  };

  // Property files modal functions
  const openPropertyFilesModal = () => {
    setShowPropertyFilesModal(true);
    setSelectedFilesForUpload([]);
    // Load property files when modal opens
    if (selectedApplication?.hoa_property_id) {
      loadPropertyFiles(selectedApplication.hoa_property_id);
    }
  };

  const handlePropertyFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFilesForUpload(files);
  };

  const uploadPropertyFiles = async () => {
    if (!selectedApplication?.hoa_property_id || selectedFilesForUpload.length === 0) {
      console.log('❌ Upload cancelled - missing propertyId or files');
      return;
    }

    setUploading(true);
    try {
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('👤 Current user:', user);
      if (authError || !user) {
        throw new Error('User not authenticated');
      }

      const propertyId = selectedApplication.hoa_property_id;
      console.log('🚀 Starting upload for property:', propertyId);
      console.log('📁 Files to upload:', selectedFilesForUpload.length);
      
      const uploadPromises = selectedFilesForUpload.map(async (file, index) => {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `property_files/${propertyId}/${fileName}`;
        
        console.log(`📤 Uploading file ${index + 1}:`, {
          originalName: file.name,
          fileName,
          filePath,
          fileSize: file.size,
          fileType: file.type
        });

        const { data, error } = await supabase.storage
          .from('bucket0')
          .upload(filePath, file);

        if (error) {
          console.error(`❌ Upload failed for ${file.name}:`, error);
          throw error;
        }
        
        console.log(`✅ Upload successful for ${file.name}:`, data);
        return filePath;
      });

      await Promise.all(uploadPromises);
      console.log('🎉 All uploads completed successfully');

      // Reload property files to show new uploads
      await loadPropertyFiles(propertyId);
      
      setSelectedFilesForUpload([]);
      setSnackbar({ show: true, message: 'Files uploaded successfully!', type: 'success' });
    } catch (error) {
      console.error('💥 Upload error details:', {
        message: error.message,
        statusCode: error.statusCode,
        error: error.error,
        details: error.details,
        hint: error.hint,
        fullError: error
      });
      setSnackbar({ show: true, message: 'Error uploading files: ' + error.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const deletePropertyFile = async (fileName) => {
    if (!selectedApplication?.hoa_property_id) return;

    try {
      const propertyId = selectedApplication.hoa_property_id;
      const filePath = `property_files/${propertyId}/${fileName}`;

      const { error } = await supabase.storage
        .from('bucket0')
        .remove([filePath]);

      if (error) throw error;

      // Reload property files
      await loadPropertyFiles(propertyId);
      setSnackbar({ show: true, message: 'File deleted successfully!', type: 'success' });
    } catch (error) {
      console.error('Error deleting file:', error);
      setSnackbar({ show: true, message: 'Error deleting file: ' + error.message, type: 'error' });
    }
  };

  // Property Groups Functions
  const loadPropertyGroups = async (applicationId) => {
    if (!applicationId) return;
    
    setLoadingGroups(true);
    try {
      console.log(`🔄 Loading property groups for application ${applicationId}`);
      const { data, error } = await supabase
        .from('application_property_groups')
        .select('*')
        .eq('application_id', applicationId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      console.log(`📊 Property groups loaded:`, data?.map(g => ({
        id: g.id,
        name: g.property_name,
        email_status: g.email_status,
        email_completed_at: g.email_completed_at,
        pdf_status: g.pdf_status
      })));
      
      // Sort property groups to ensure primary is always first
      const sortedGroups = (data || []).sort((a, b) => {
        // Primary property always comes first
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        // If both are primary or both are secondary, sort by name
        return (a.property_name || '').localeCompare(b.property_name || '');
      });
      
      setPropertyGroups(sortedGroups);
      console.log(`✅ Property groups state updated`);
    } catch (error) {
      console.error('Error loading property groups:', error);
      setSnackbar({ show: true, message: 'Error loading property groups: ' + error.message, type: 'error' });
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSendGroupEmail = async (groupId) => {
    setSendingGroupEmail(groupId);
    try {
      const response = await fetch('/api/admin/send-group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, applicationId: selectedApplication.id })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send email');
      }

      setSnackbar({ show: true, message: 'Email sent successfully!', type: 'success' });
      await loadPropertyGroups(selectedApplication.id);
    } catch (error) {
      console.error('Error sending group email:', error);
      setSnackbar({ show: true, message: 'Error sending email: ' + error.message, type: 'error' });
    } finally {
      setSendingGroupEmail(null);
    }
  };

  const handleRegenerateGroupDocs = async (groupId) => {
    setRegeneratingGroupDocs(groupId);
    try {
      const response = await fetch('/api/admin/regenerate-group-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, applicationId: selectedApplication.id })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to regenerate documents');
      }

      setSnackbar({ show: true, message: 'Documents regenerated successfully!', type: 'success' });
      await loadPropertyGroups(selectedApplication.id);
    } catch (error) {
      console.error('Error regenerating group docs:', error);
      setSnackbar({ show: true, message: 'Error regenerating documents: ' + error.message, type: 'error' });
    } finally {
      setRegeneratingGroupDocs(null);
    }
  };

  const renderAttachmentModal = () => {
    if (!selectedApplication) return null;

    // Get current PDF file
    const pdfFile = selectedApplication.pdf_url ? {
      id: 'pdf-file',
      name: `${selectedApplication.submitter_name}_Resale_Certificate.pdf`,
      type: 'application/pdf',
      url: selectedApplication.pdf_url,
      isPDF: true
    } : null;

    const allAttachments = [
      ...(pdfFile ? [pdfFile] : []),
      ...propertyFiles,
      ...temporaryAttachments
    ];

    return (
      <div className='bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
        <div className='p-6 border-b border-gray-200'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <Paperclip className='w-6 h-6 text-blue-600' />
              <div>
                <h2 className='text-xl font-semibold text-gray-900'>Email Attachments</h2>
                <p className='text-sm text-gray-600'>Manage files that will be sent with the completion email</p>
              </div>
            </div>
            <button
              onClick={() => setShowAttachmentModal(false)}
              className='text-gray-400 hover:text-gray-600 p-1'
            >
              <X className='w-6 h-6' />
            </button>
          </div>
        </div>

        <div className='p-6 space-y-6'>
          {/* PDF Certificate */}
          {pdfFile && (
            <div>
              <h3 className='text-lg font-medium text-gray-900 mb-4'>PDF Certificate</h3>
              <div className='flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-blue-50'>
                <div className='flex items-center gap-3'>
                  <FileText className='w-5 h-5 text-blue-600' />
                  <div>
                    <p className='font-medium text-gray-900'>{pdfFile.name}</p>
                    <span className='px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs'>PDF Certificate</span>
                  </div>
                </div>
                <button
                  onClick={() => window.open(pdfFile.url, '_blank')}
                  className='p-2 text-gray-400 hover:text-blue-600'
                  title="View PDF"
                >
                  <Eye className='w-4 h-4' />
                </button>
              </div>
            </div>
          )}

          {/* Property Files */}
          <div>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-medium text-gray-900'>Property Files</h3>
              <button
                onClick={() => loadPropertyFiles(selectedApplication.hoa_property_id)}
                disabled={loadingPropertyFiles}
                className='inline-flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50'
                title="Refresh property files"
              >
                <RefreshCw className={`w-4 h-4 ${loadingPropertyFiles ? 'animate-spin' : ''}`} />
                {loadingPropertyFiles ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {loadingPropertyFiles ? (
              <div className='text-center py-6 text-gray-500 border border-gray-200 rounded-lg bg-gray-50'>
                <RefreshCw className='w-10 h-10 mx-auto mb-3 text-gray-300 animate-spin' />
                <p className='font-medium'>Loading property files...</p>
              </div>
            ) : propertyFiles.length === 0 ? (
              <div className='text-center py-6 text-gray-500 border border-gray-200 rounded-lg bg-gray-50'>
                <Building className='w-10 h-10 mx-auto mb-3 text-gray-300' />
                <p className='font-medium'>No property files found</p>
                <p className='text-sm mb-4'>Upload HOA bylaws, CC&Rs, and other property documents</p>
                <button
                  onClick={openPropertyFilesModal}
                  className='inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm'
                >
                  <Upload className='w-4 h-4' />
                  Upload Property Files
                </button>
              </div>
            ) : (
              <div className='space-y-3'>
                {propertyFiles.map((file, index) => (
                  <div
                    key={index}
                    className='flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50'
                  >
                    <div className='flex items-center gap-3'>
                      <FileText className='w-5 h-5 text-green-500' />
                      <div>
                        <p className='font-medium text-gray-900'>{file.name}</p>
                        <div className='flex items-center gap-2 text-sm text-gray-500'>
                          {file.size && <span>{formatFileSize(file.size)}</span>}
                          <span className='px-2 py-1 bg-green-100 text-green-700 rounded text-xs'>Property File</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(file.url, '_blank')}
                      className='p-2 text-gray-400 hover:text-blue-600'
                      title="View file"
                    >
                      <Eye className='w-4 h-4' />
                    </button>
                  </div>
                ))}
                <div className='pt-2'>
                  <button
                    onClick={openPropertyFilesModal}
                    className='inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 text-sm'
                  >
                    <Edit className='w-4 h-4' />
                    Manage Property Files
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Temporary Attachments */}
          {temporaryAttachments.length > 0 && (
            <div>
              <h3 className='text-lg font-medium text-gray-900 mb-4'>Additional Files ({temporaryAttachments.length})</h3>
              <div className='space-y-3'>
                {temporaryAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className='flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50'
                  >
                    <div className='flex items-center gap-3'>
                      <FileText className='w-5 h-5 text-blue-500' />
                      <div>
                        <p className='font-medium text-gray-900'>{attachment.name}</p>
                        <div className='flex items-center gap-2 text-sm text-gray-500'>
                          {attachment.size && <span>{formatFileSize(attachment.size)}</span>}
                          <span className='px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs'>New Upload</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeTemporaryAttachment(attachment.id)}
                      className='p-2 text-gray-400 hover:text-red-600'
                      title="Remove file"
                    >
                      <Trash2 className='w-4 h-4' />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload New Files */}
          <div>
            <h3 className='text-lg font-medium text-gray-900 mb-4'>Add Additional Files</h3>
            <div className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors'>
              <Upload className='w-8 h-8 text-gray-400 mx-auto mb-3' />
              <p className='text-gray-600 mb-2'>Upload additional documents</p>
              <p className='text-sm text-gray-500 mb-4'>These files will be attached to the completion email</p>
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className='hidden'
                id='attachment-upload'
                accept='.pdf,.doc,.docx,.jpg,.jpeg,.png,.txt'
              />
              <label
                htmlFor='attachment-upload'
                className='inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer disabled:opacity-50'
              >
                <Upload className='w-4 h-4' />
                {uploading ? 'Uploading...' : 'Choose Files'}
              </label>
              <p className='text-xs text-gray-500 mt-2'>Supports: PDF, DOC, DOCX, JPG, PNG, TXT</p>
            </div>
          </div>
        </div>

        <div className='p-6 border-t border-gray-200 flex justify-between'>
          <button
            onClick={() => setShowAttachmentModal(false)}
            className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
          >
            Close
          </button>
          <div className='text-sm text-gray-600'>
            {allAttachments.length} file(s) ready to send
          </div>
        </div>
      </div>
    );
  };

  // Helper functions for multi-community property tasks
  const canGeneratePDFForProperty = (group) => {
    // Check if both forms are completed for this property
    const isPrimary = !!group.is_primary;
    const taskStatuses = getTaskStatuses(selectedApplication);
    
    // For primary property: both inspection and resale must be completed
    if (isPrimary) {
      return taskStatuses.inspection === 'completed' && group.status === 'completed';
    }
    
    // For secondary properties: only resale form needs to be completed
    return group.status === 'completed';
  };

  const canSendEmailForProperty = (group) => {
    // Email can be sent if PDF is generated for this property
    return group.pdf_status === 'completed' || group.pdf_url;
  };

  const handleGeneratePDFForProperty = async (applicationId, group) => {
    setGeneratingPDFForProperty(group.id); // Set specific property as generating
    
    try {
      // Get the form data for this specific property
      // First try to get property-specific form data, then fall back to application-level
      let formData = group.form_data;
      
      if (!formData) {
        // If no property-specific form data, get the application-level resale certificate form data
        const resaleForm = selectedApplication.property_owner_forms?.find(f => f.form_type === 'resale_certificate');
        formData = resaleForm?.form_data || resaleForm?.response_data;
      }
      
      if (!formData) {
        throw new Error('No form data available for this property');
      }

      console.log(`🚀 Generating PDF for property: ${group.property_name} (ID: ${group.id})`);
      console.log(`📋 Using form data:`, formData ? 'Found' : 'Not found');

      const response = await fetch('/api/regenerate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          applicationId,
          propertyGroupId: group.id, // Pass the property group ID
          propertyName: group.property_name
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate PDF');
      }
      
      console.log(`✅ PDF generated successfully for property: ${group.property_name}`);
      
      // Update the property group with PDF information
      await supabase
        .from('application_property_groups')
        .update({
          pdf_url: result.pdfUrl,
          pdf_status: 'completed',
          pdf_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', group.id);
      
      // Refresh the property groups with timeout protection
      const loadGroupsWithTimeout = () => Promise.race([
        loadPropertyGroups(applicationId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading property groups')), 10000))
      ]);
      
      try {
        await loadGroupsWithTimeout();
      } catch (loadError) {
        console.error('Error or timeout loading property groups:', loadError);
        // Force loading state to false
        setLoadingGroups(false);
        // Manually update the specific group's PDF status
        setPropertyGroups(prev => prev.map(g => 
          g.id === group.id 
            ? { ...g, pdf_url: result.pdfUrl, pdf_status: 'completed', pdf_completed_at: new Date().toISOString() }
            : g
        ));
      }
      
      showSnackbar(`PDF generated successfully for ${group.property_name}!`, 'success');
      
    } catch (error) {
      console.error(`❌ Failed to generate PDF for property ${group.property_name}:`, error);
      showSnackbar(`Failed to generate PDF for ${group.property_name}. Please try again.`, 'error');
    } finally {
      setGeneratingPDFForProperty(null); // Clear the generating state for this property
    }
  };

  const handleSendEmailForProperty = async (applicationId, group) => {
    setSendingEmailForProperty(group.id); // Set specific property as sending email
    
    try {
      if (!group.pdf_url) {
        throw new Error('PDF must be generated first');
      }

      console.log(`📧 Sending email for property: ${group.property_name} (ID: ${group.id})`);

      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          propertyGroupId: group.id,
          propertyName: group.property_name,
          pdfUrl: group.pdf_url
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }
      
      console.log(`✅ Email sent successfully for property: ${group.property_name}`);
      console.log(`📧 API Response:`, result);

      // Refresh the property groups to get updated status
      console.log(`🔄 Refreshing property groups after email send...`);
      
      // Add timeout protection
      const loadGroupsWithTimeout = () => Promise.race([
        loadPropertyGroups(applicationId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading property groups')), 10000))
      ]);
      
      try {
        await loadGroupsWithTimeout();
      } catch (loadError) {
        console.error('Error or timeout loading property groups:', loadError);
        // Force loading state to false
        setLoadingGroups(false);
        // Manually update the specific group's status
        setPropertyGroups(prev => prev.map(g => 
          g.id === group.id 
            ? { ...g, email_status: 'completed', email_completed_at: new Date().toISOString() }
            : g
        ));
      }

      showSnackbar(`Email sent successfully for ${group.property_name}!`, 'success');
      
    } catch (error) {
      console.error(`❌ Failed to send email for property ${group.property_name}:`, error);
      showSnackbar(`Failed to send email for ${group.property_name}. Please try again.`, 'error');
    } finally {
      setSendingEmailForProperty(null); // Clear the sending state for this property
    }
  };

  // Show error state if SWR encountered an error
  if (swrError) {
    return (
      <AdminLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <AlertTriangle className='w-12 h-12 text-red-500 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>Failed to load applications</h3>
            <p className='text-gray-600 mb-4'>Please try refreshing the page</p>
            <button
              onClick={() => mutate()}
              className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700'
            >
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Show initial loading state
  if (isLoading) {
    return (
      <AdminLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='flex items-center gap-3 text-gray-600'>
            <RefreshCw className='w-5 h-5 animate-spin' />
            <span>Loading applications...</span>
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
                Applications Management
              </h1>
              <p className='text-gray-600'>
                Monitor and manage all resale certificate applications
              </p>
            </div>
            <button
              onClick={() => mutate()}
              disabled={isLoading}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className='bg-white p-6 rounded-lg shadow-md border mb-8 filters-section'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            {/* Date Filter */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Date Range
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Time</option>
                <option value='today'>Today</option>
                <option value='week'>This Week</option>
                <option value='month'>This Month</option>
                <option value='custom'>Custom Range</option>
              </select>
            </div>

            {/* Custom Date Range */}
            {dateFilter === 'custom' && (
              <>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Start Date
                  </label>
                  <input
                    type='date'
                    value={customDateRange.startDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    End Date
                  </label>
                  <input
                    type='date'
                    value={customDateRange.endDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  />
                </div>
              </>
            )}

            {/* Workflow Step Filter */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Workflow Step
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Steps</option>
                <option value='urgent'>Urgent Applications</option>
                <option value='payment_confirmed'>Not Started</option>
                <option value='ongoing'>Ongoing</option>
                <option value='approved'>Completed</option>
              </select>
            </div>

            {/* Application Type Filter */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Application Type
              </label>
              <select
                value={selectedApplicationType}
                onChange={(e) => setSelectedApplicationType(e.target.value)}
                className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Types</option>
                <option value='standard'>Standard</option>
                <option value='settlement_agent_va'>Settlement - Virginia</option>
                <option value='settlement_agent_nc'>Settlement - North Carolina</option>
              </select>
            </div>

            {/* Assigned to Me Filter */}
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Assignment Filter
              </label>
              <label className='flex items-center'>
                <input
                  type='checkbox'
                  checked={assignedToMe}
                  onChange={(e) => setAssignedToMe(e.target.checked)}
                  className='rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                />
                <span className='ml-2 text-sm text-gray-700'>Assigned to me only</span>
              </label>
            </div>
          </div>

          {/* Search */}
          <div className='mt-4'>
            <div className='relative'>
              <Search className='w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
              <input
                type='text'
                placeholder='Search by property address, submitter name, or HOA...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
              />
            </div>
          </div>
        </div>

        {/* Applications Table */}
        <div className='bg-white rounded-lg shadow-md border overflow-hidden applications-table'>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50 border-b'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Property Details
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Application Type
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider workflow-column'>
                    Workflow Step
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Submitted
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Assigned
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {applications.map((app) => {
                  const workflowStep = getWorkflowStep(app);
                  return (
                    <tr key={app.id} className='hover:bg-gray-50'>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='flex items-center gap-3'>
                          <Building className='w-5 h-5 text-gray-400' />
                          <div>
                            <div className='text-sm font-medium text-gray-900'>
                              {app.property_address}
                            </div>
                            <div className='text-sm text-gray-500'>
                              {app.submitter_name} • {app.hoa_properties?.name || 'Unknown HOA'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='text-sm text-gray-900'>
                          {(() => {
                            const appType = app.application_type || 'single_property';
                            if (appType === 'settlement_va') {
                              return (
                                <div className='flex items-center gap-2'>
                                  <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800'>
                                    Settlement - VA
                                  </span>
                                  <span className='text-xs text-gray-500'>FREE</span>
                                </div>
                              );
                            } else if (appType === 'settlement_nc') {
                              return (
                                <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800'>
                                  Settlement - NC
                                </span>
                              );
                            } else if (appType === 'public_offering') {
                              return (
                                <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800'>
                                  Public Offering
                                </span>
                              );
                            } else if (appType === 'multi_community') {
                              return (
                                <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800'>
                                  Multi-Community
                                </span>
                              );
                            } else {
                              return (
                                <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800'>
                                  Single Property
                                </span>
                              );
                            }
                          })()}
                        </div>
                      </td>

                      <td className='px-6 py-4 whitespace-nowrap'>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${workflowStep.color}`}>
                          Step {workflowStep.step}: {workflowStep.text}
                        </span>
                      </td>

                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                        {app.submitted_at ? (
                          <div className='space-y-1'>
                            <div className='flex items-center gap-1'>
                              <Calendar className='w-3 h-3 text-gray-400' />
                              <span>
                                {new Date(app.submitted_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className='flex items-center gap-1 text-xs'>
                              <Clock className='w-3 h-3 text-gray-400' />
                              <span className='text-gray-600'>
                                Deadline: {(() => {
                                  const submittedDate = new Date(app.submitted_at);
                                  const businessDays = app.package_type === 'rush' ? 5 : 15; // Use max for standard (10-15 days)
                                  const deadline = calculateBusinessDaysDeadline(submittedDate, businessDays);
                                  return deadline.toLocaleDateString();
                                })()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className='text-gray-400'>Not submitted</span>
                        )}
                      </td>

                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                        {app.assigned_to ? (
                          <div className='flex items-center gap-1'>
                            <User className='w-3 h-3 text-gray-400' />
                            <span>
                              {(() => {
                                const staff = staffMembers.find(s => s.email === app.assigned_to);
                                return staff 
                                  ? `${staff.first_name} ${staff.last_name}` 
                                  : app.assigned_to;
                              })()}
                            </span>
                          </div>
                        ) : (
                          <span className='text-gray-400'>Unassigned</span>
                        )}
                      </td>

                      <td className='px-6 py-4 whitespace-nowrap text-sm font-medium action-buttons'>
                        <button
                          onClick={() => handleApplicationClick(app)}
                          className='px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center space-x-1'
                        >
                          <Eye className='w-4 h-4' />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {applications.length === 0 && (
            <div className='text-center py-12'>
              <FileText className='w-12 h-12 text-gray-400 mx-auto mb-4' />
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                {searchTerm || dateFilter !== 'all' || assignedToMe ? 'No applications found' : 'No applications yet'}
              </h3>
              <p className='text-gray-500'>
                {searchTerm || dateFilter !== 'all' || assignedToMe
                  ? 'Try adjusting your search criteria or filters'
                  : 'Applications will appear here once submitted'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className='bg-white rounded-lg shadow-md border p-4 mt-6'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <span className='text-sm text-gray-700'>
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} applications
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className='px-3 py-1 border border-gray-300 rounded-md text-sm'
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
              
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className='p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  title="First page"
                >
                  <ChevronsLeft className='w-4 h-4' />
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className='p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  title="Previous page"
                >
                  <ChevronLeft className='w-4 h-4' />
                </button>

                <div className='flex items-center gap-1'>
                  {(() => {
                    const totalPages = Math.ceil(totalCount / itemsPerPage);
                    const pages = [];
                    const maxVisiblePages = 5;
                    
                    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                    
                    if (endPage - startPage + 1 < maxVisiblePages) {
                      startPage = Math.max(1, endPage - maxVisiblePages + 1);
                    }

                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i)}
                          className={`px-3 py-2 text-sm rounded-md ${
                            i === currentPage
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }
                    return pages;
                  })()}
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                  className='p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  title="Next page"
                >
                  <ChevronRight className='w-4 h-4' />
                </button>
                <button
                  onClick={() => setCurrentPage(Math.ceil(totalCount / itemsPerPage))}
                  disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                  className='p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  title="Last page"
                >
                  <ChevronsRight className='w-4 h-4' />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Application Detail Modal */}
        {selectedApplication && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
            <div className='bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6'>
              {/* Loading overlay for modal content */}
              {loadingFormData && (
                <div className='absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg'>
                  <div className='flex items-center space-x-2'>
                    <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600'></div>
                    <span className='text-sm text-gray-600'>Loading application details...</span>
                  </div>
                </div>
              )}
              <div className='p-6 border-b'>
                <div className='flex justify-between items-center'>
                  <h2 className='text-xl font-bold text-gray-900'>
                    Application #{selectedApplication.id} Details
                  </h2>
                  <div className='flex items-center space-x-2'>
                    <button
                      onClick={() => handleApplicationClick(selectedApplication)}
                      className='text-blue-400 hover:text-blue-600'
                      title='Refresh application data'
                    >
                      <RefreshCw className='w-5 h-5' />
                    </button>
                    <button
                      onClick={() => setSelectedApplication(null)}
                      className='text-gray-400 hover:text-gray-600'
                    >
                      <X className='w-6 h-6' />
                    </button>
                  </div>
                </div>
              </div>

              <div className='p-6 space-y-6'>
                {/* Error boundary for modal content */}
                {!selectedApplication.id && (
                  <div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-6'>
                    <div className='flex items-center'>
                      <div className='text-red-600 mr-2'>⚠️</div>
                      <div>
                        <h3 className='text-sm font-semibold text-red-800'>
                          Application Data Error
                        </h3>
                        <p className='text-sm text-red-600 mt-1'>
                          Unable to load application details. Please try refreshing the page.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Multi-Community Indicator */}
                {selectedApplication.hoa_properties?.is_multi_community && (
                  <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6'>
                    <div className='flex items-center'>
                      <Building className='w-5 h-5 text-blue-600 mr-2' />
                      <div>
                        <h3 className='text-sm font-semibold text-blue-800'>
                          Multi-Community Application
                        </h3>
                        <p className='text-sm text-blue-600 mt-1'>
                          This application includes multiple community associations. Each property will be processed separately.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Application Overview */}
                <div className='grid md:grid-cols-2 gap-6'>
                  <div>
                    <h3 className='text-lg font-semibold text-gray-800 mb-3'>
                      Property Information
                    </h3>
                    <div className='space-y-2 text-sm'>
                      <div>
                        <strong>Address:</strong>{' '}
                        {selectedApplication.property_address}
                      </div>
                      <div>
                        <strong>Unit:</strong>{' '}
                        {selectedApplication.unit_number || 'N/A'}
                      </div>
                      <div>
                        <strong>HOA:</strong>{' '}
                        {selectedApplication.hoa_properties?.name || 'N/A'}
                      </div>
                      <div>
                        <strong>Buyer:</strong> {selectedApplication.buyer_name || 'N/A'}
                      </div>
                      <div>
                        <strong>Seller:</strong> {selectedApplication.seller_name || 'N/A'}
                      </div>
                      <div>
                        <strong>Sale Price:</strong> $
                        {selectedApplication.sale_price?.toLocaleString() || 'N/A'}
                      </div>
                      <div>
                        <strong>Closing Date:</strong>{' '}
                        {selectedApplication.closing_date
                          ? new Date(
                              selectedApplication.closing_date
                            ).toLocaleDateString()
                          : 'TBD'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className='text-lg font-semibold text-gray-800 mb-3'>
                      Submission Details
                    </h3>
                    <div className='space-y-2 text-sm'>
                      <div>
                        <strong>Submitted by:</strong>{' '}
                        {selectedApplication.submitter_name || 'N/A'}
                      </div>
                      <div>
                        <strong>Email:</strong>{' '}
                        {selectedApplication.submitter_email || 'N/A'}
                      </div>
                      <div>
                        <strong>Phone:</strong>{' '}
                        {selectedApplication.submitter_phone || 'N/A'}
                      </div>
                      <div>
                        <strong>Type:</strong> {selectedApplication.submitter_type || 'N/A'}
                      </div>
                      <div>
                        <strong>License:</strong>{' '}
                        {selectedApplication.realtor_license || 'N/A'}
                      </div>
                      <div>
                        <strong>Package:</strong> {selectedApplication.package_type || 'N/A'}
                      </div>
                      <div>
                        <strong>Total Amount:</strong> $
                        {selectedApplication.total_amount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Assignment Section */}
                <div>
                  <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                    Assignment
                  </h3>
                  <div className='bg-gray-50 rounded-lg p-4'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <User className='w-5 h-5 text-gray-400' />
                        <div>
                          <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Assigned to:
                          </label>
                          <select
                            value={selectedApplication.assigned_to || ''}
                            onChange={(e) => handleAssignApplication(selectedApplication.id, e.target.value || null)}
                            disabled={assigningApplication === selectedApplication.id}
                            className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]'
                          >
                            <option value="">Unassigned</option>
                            {staffMembers.map((staff) => (
                              <option key={staff.email} value={staff.email}>
                                {staff.first_name} {staff.last_name} ({staff.role})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {assigningApplication === selectedApplication.id && (
                        <div className='flex items-center gap-2 text-blue-600'>
                          <RefreshCw className='w-4 h-4 animate-spin' />
                          <span className='text-sm'>Updating...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Multi-Community Properties Section */}
                {(() => {
                  const isMultiCommunity = selectedApplication.hoa_properties?.is_multi_community && propertyGroups.length > 1;
                  
                  if (isMultiCommunity) {
                    return (
                      <div>
                        <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                          Multi-Community Properties
                        </h3>
                        <div className='space-y-4'>
                          {loadingGroups ? (
                            <div className='flex items-center justify-center py-8'>
                              <RefreshCw className='w-6 h-6 animate-spin text-blue-600' />
                              <span className='ml-2 text-gray-600'>Loading property groups...</span>
                            </div>
                          ) : (
                            propertyGroups
                              .sort((a, b) => {
                                // Primary property always comes first
                                if (a.is_primary && !b.is_primary) return -1;
                                if (!a.is_primary && b.is_primary) return 1;
                                // If both are primary or both are secondary, sort by name
                                return (a.property_name || '').localeCompare(b.property_name || '');
                              })
                              .map((group) => (
                              <div key={group.id} className='bg-gray-50 rounded-lg p-4 border border-gray-200'>
                                <div className='flex items-center justify-between mb-3'>
                                  <div className='flex items-center gap-3'>
                                    <Building className='w-5 h-5 text-gray-600' />
                                    <div>
                                      <h4 className='font-medium text-gray-900'>
                                        {group.property_name}
                                        {group.is_primary && (
                                          <span className='ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full'>
                                            Primary
                                          </span>
                                        )}
                                      </h4>
                                      <p className='text-sm text-gray-600'>
                                        {group.property_location}
                                      </p>
                                      {group.property_owner_email && (
                                        <p className='text-sm text-gray-500'>
                                          Manager: {group.property_owner_email}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className='flex items-center gap-2'>
                                    {(() => {
                                      // Derive user-facing status for header badge
                                      const isPrimary = !!group.is_primary;
                                      const primaryCompleted = !!(selectedApplication.inspection_form_completed_at && selectedApplication.resale_certificate_completed_at);
                                      const derivedStatus = isPrimary
                                        ? (primaryCompleted ? 'completed' : 'pending')
                                        : (group.status === 'completed' ? 'completed' : (group.status === 'failed' ? 'failed' : (group.status === 'email_sent' ? 'email_sent' : 'pending')));

                                      const badgeClass = derivedStatus === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : derivedStatus === 'email_sent'
                                          ? 'bg-blue-100 text-blue-800'
                                          : derivedStatus === 'failed'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-yellow-100 text-yellow-800';

                                      const label = derivedStatus === 'completed'
                                        ? 'Completed'
                                        : derivedStatus === 'email_sent'
                                          ? 'Email Sent'
                                          : derivedStatus === 'failed'
                                            ? 'Failed'
                                            : 'Pending';

                                      return (
                                        <span className={`px-2 py-1 text-xs rounded-full ${badgeClass}`}>
                                          {label}
                                        </span>
                                      );
                                    })()}
                                  </div>
                              </div>

                              {/* Per-Property Tasks */}
                              <div className='mt-3 space-y-3'>
                                {(() => {
                                  const taskStatuses = getTaskStatuses(selectedApplication);
                                  const isPrimary = !!group.is_primary;
                                  const resaleStatusForGroup = group.status === 'completed' ? 'completed' : 'not_started';

                                  return (
                                    <>
                                      {/* Task A: Property Inspection Form (Primary only) */}
                                      <div className={`border rounded-lg p-3 ${getTaskStatusColor(isPrimary ? taskStatuses.inspection : 'not_started')}`}>
                                        <div className='flex items-center justify-between'>
                                          <div className='flex items-center gap-3'>
                                            <div className='flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current'>
                                              <span className='text-xs font-bold'>1</span>
                                            </div>
                                            {getTaskStatusIcon(isPrimary ? taskStatuses.inspection : 'not_started')}
                                            <div>
                                              <h5 className='font-medium text-sm'>Property Inspection Form</h5>
                                              {isPrimary ? (
                                                <p className='text-xs opacity-75'>{getTaskStatusText(taskStatuses.inspection)}</p>
                                              ) : (
                                                <div className='flex items-center gap-2'>
                                                  <span className='text-xs text-gray-500'>Not applicable for secondary properties</span>
                                                  <span className='px-2 py-0.5 text-[10px] rounded-full bg-gray-200 text-gray-700'>Not applicable</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          <div className='flex gap-2'>
                                            {isPrimary ? (
                                              <>
                                            <button
                                              onClick={() => handleCompleteForm(selectedApplication.id, 'inspection', group)}
                                                  disabled={loadingFormData}
                                                  className='px-3 py-1 text-xs bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                                >
                                              {loadingFormKey === `inspection:${group.id}` ? 'Loading...' : getFormButtonText(taskStatuses.inspection)}
                                                </button>
                                                {!selectedApplication.inspection_form_completed_at && (
                                                  <button
                                                    onClick={() => handleCompleteTask(selectedApplication.id, 'inspection_form')}
                                                    className='px-2 py-1 text-xs bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors font-medium'
                                                    title='Mark this task as completed'
                                                  >
                                                    Mark Complete
                                                  </button>
                                                )}
                                              </>
                                            ) : (
                                              <span className='text-xs text-gray-400'>Disabled</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Task B: Virginia Resale Certificate (All properties) */}
                                      <div className={`border rounded-lg p-3 ${getTaskStatusColor(resaleStatusForGroup)}`}>
                                        <div className='flex items-center justify-between'>
                                          <div className='flex items-center gap-3'>
                                            <div className='flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current'>
                                              <span className='text-xs font-bold'>2</span>
                                            </div>
                                            {getTaskStatusIcon(resaleStatusForGroup)}
                                            <div>
                                              <h5 className='font-medium text-sm'>Virginia Resale Certificate</h5>
                                              <p className='text-xs opacity-75'>{getTaskStatusText(resaleStatusForGroup)}</p>
                                            </div>
                                          </div>
                                          <div className='flex gap-2'>
                                            <button
                                              onClick={() => handleCompleteForm(selectedApplication.id, 'resale', group)}
                                              disabled={loadingFormData}
                                              className='px-3 py-1 text-xs bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                            >
                                              {loadingFormKey === `resale:${group.id}` ? 'Loading...' : getFormButtonText(group.status === 'completed' ? 'completed' : 'not_started')}
                                            </button>
                                            {isPrimary && !selectedApplication.resale_certificate_completed_at && (
                                              <button
                                                onClick={() => handleCompleteTask(selectedApplication.id, 'resale_certificate')}
                                                className='px-2 py-1 text-xs bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors font-medium'
                                                title='Mark this task as completed'
                                              >
                                                Mark Complete
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Task C: Generate PDF (All properties) */}
                                      <div className={`border rounded-lg p-3 ${getTaskStatusColor(group.pdf_status || 'not_started')}`}>
                                        <div className='flex items-center justify-between'>
                                          <div className='flex items-center gap-3'>
                                            <div className='flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current'>
                                              <span className='text-xs font-bold'>3</span>
                                            </div>
                                            {getTaskStatusIcon(group.pdf_status || 'not_started')}
                                            <div>
                                              <h5 className='font-medium text-sm'>Generate PDF</h5>
                                              <p className='text-xs opacity-75'>{getTaskStatusText(group.pdf_status || 'not_started')}</p>
                                            </div>
                                          </div>
                                          <div className='flex gap-2'>
                                            <button
                                              onClick={() => handleGeneratePDFForProperty(selectedApplication.id, group)}
                                              disabled={generatingPDFForProperty === group.id || !canGeneratePDFForProperty(group)}
                                              className='px-3 py-1 text-xs bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                              title={!canGeneratePDFForProperty(group) ? 'Both forms must be completed first' : 'Generate PDF for this property'}
                                            >
                                              {generatingPDFForProperty === group.id ? 'Generating...' : 'Generate PDF'}
                                            </button>
                                            {group.pdf_url && (
                                              <button
                                                onClick={() => window.open(group.pdf_url, '_blank')}
                                                className='px-2 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors font-medium'
                                                title='View PDF'
                                              >
                                                View
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Task D: Send Email (All properties) */}
                                      <div className={`border rounded-lg p-3 ${getTaskStatusColor(group.email_status || 'not_started')}`}>
                                        <div className='flex items-center justify-between'>
                                          <div className='flex items-center gap-3'>
                                            <div className='flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current'>
                                              <span className='text-xs font-bold'>4</span>
                                            </div>
                                            {getTaskStatusIcon(group.email_status || 'not_started')}
                                            <div>
                                              <h5 className='font-medium text-sm'>Send Email</h5>
                                              <p className='text-xs opacity-75'>{getTaskStatusText(group.email_status || 'not_started')}</p>
                                            </div>
                                          </div>
                                          <div className='flex gap-2'>
                                            <button
                                              onClick={() => handleSendEmailForProperty(selectedApplication.id, group)}
                                              disabled={sendingEmailForProperty === group.id || !canSendEmailForProperty(group)}
                                              className='px-3 py-1 text-xs bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                              title={!canSendEmailForProperty(group) ? 'PDF must be generated first' : 'Send email for this property'}
                                            >
                                              {sendingEmailForProperty === group.id ? 'Sending...' : 'Send Email'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>

                              {group.generated_docs && group.generated_docs.length > 0 && (
                                  <div className='mt-3 pt-3 border-t border-gray-200'>
                                    <p className='text-sm text-gray-600 mb-2'>Generated Documents:</p>
                                    <div className='flex flex-wrap gap-2'>
                                      {group.generated_docs.map((doc, index) => (
                                        <span key={index} className='px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded'>
                                          {doc.type || `Document ${index + 1}`}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Comments Section */}
                <div>
                  <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                    Comments & Notes
                  </h3>
                  <div className='bg-gray-50 rounded-lg p-4'>
                    <div className='space-y-3'>
                      <div>
                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                          Add a comment:
                        </label>
                        <textarea
                          value={selectedApplication.comments || ''}
                          onChange={(e) => setSelectedApplication({
                            ...selectedApplication,
                            comments: e.target.value
                          })}
                          className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'
                          rows='4'
                          placeholder='Add notes about this application, task progress, issues, or important information...'
                        />
                      </div>
                      <div className='flex justify-end'>
                        <button
                          onClick={() => handleSaveComments(selectedApplication.id, selectedApplication.comments)}
                          className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium'
                        >
                          Save Comments
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Task-Based Workflow (hidden for multi-community; use per-property tasks above) */}
                {!selectedApplication.hoa_properties?.is_multi_community && (
                  <div>
                    <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                      Tasks
                    </h3>
                    <div className='space-y-4'>
                    {(() => {
                      const taskStatuses = getTaskStatuses(selectedApplication);
                      const isSettlementApp = selectedApplication.submitter_type === 'settlement' || 
                                             selectedApplication.application_type?.startsWith('settlement');
                      
                      if (isSettlementApp) {
                        // Settlement application workflow - 3 tasks (Form + PDF + Email)
                        const settlementFormCompleted = taskStatuses.settlement === 'completed';
                        const pdfCanBeGenerated = settlementFormCompleted && (taskStatuses.pdf === 'not_started' || taskStatuses.pdf === 'update_needed');
                        const emailCanBeSent = taskStatuses.pdf === 'completed';

                        return (
                          <>
                            {/* Task 1: Settlement Form */}
                            <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.settlement)}`}>
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-3'>
                                  <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                    <span className='text-sm font-bold'>1</span>
                                  </div>
                                  {getTaskStatusIcon(taskStatuses.settlement)}
                                  <div>
                                    <h4 className='font-medium'>Settlement Form</h4>
                                    <p className='text-sm opacity-75'>{getTaskStatusText(taskStatuses.settlement)}</p>
                                    <p className='text-xs opacity-60 mt-1'>Complete the settlement form with assessment details and community manager information</p>
                                  </div>
                                </div>
                                <div className='flex gap-2'>
                                  <button
                                    onClick={() => handleCompleteForm(selectedApplication.id, 'settlement')}
                                    disabled={loadingFormData}
                                    className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                  >
                                    {loadingFormData ? 'Loading...' : getFormButtonText(taskStatuses.settlement)}
                                  </button>
                                  {!selectedApplication.settlement_form_completed_at && (
                                    <button
                                      onClick={() => handleCompleteTask(selectedApplication.id, 'settlement_form')}
                                      className='px-3 py-2 bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors text-sm font-medium'
                                      title='Mark this task as completed'
                                    >
                                      Mark Complete
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className='mt-2 space-y-1'>
                                {selectedApplication.settlement_form_completed_at && (
                                  <div className='text-sm opacity-75'>
                                    Task Completed: {new Date(selectedApplication.settlement_form_completed_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Task 2: Generate PDF */}
                            <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.pdf)}`}>
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-3'>
                                  <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                    <span className='text-sm font-bold'>2</span>
                                  </div>
                                  {getTaskStatusIcon(taskStatuses.pdf, generatingPDF)}
                                  <div>
                                    <h4 className='font-medium'>Generate PDF</h4>
                                    <p className='text-sm opacity-75'>
                                      {generatingPDF ? 'Generating...' : getTaskStatusText(taskStatuses.pdf)}
                                    </p>
                                    <p className='text-xs opacity-60 mt-1'>Generate the settlement form as a PDF document</p>
                                  </div>
                                </div>
                                <div className='flex gap-2'>
                                  <button
                                    onClick={() => handleGenerateSettlementPDF(selectedApplication.id)}
                                    disabled={!pdfCanBeGenerated || generatingPDF}
                                    className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                    title={!settlementFormCompleted ? 'Settlement form must be completed first' : ''}
                                  >
                                    {generatingPDF ? 'Generating...' : 
                                      (taskStatuses.pdf === 'completed' || taskStatuses.pdf === 'update_needed' ? 'Regenerate' : 'Generate PDF')
                                    }
                                  </button>
                                  {selectedApplication.pdf_url && (
                                    <button
                                      onClick={() => window.open(selectedApplication.pdf_url, '_blank')}
                                      className='px-3 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium flex items-center gap-1'
                                      title='View PDF'
                                    >
                                      <Eye className='w-4 h-4' />
                                      View
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className='mt-2 space-y-1'>
                                {selectedApplication.pdf_completed_at && (
                                  <div className='text-sm opacity-75'>
                                    Task Completed: {new Date(selectedApplication.pdf_completed_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Task 3: Send Settlement Email */}
                            <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.email)}`}>
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-3'>
                                  <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                    <span className='text-sm font-bold'>3</span>
                                  </div>
                                  {getTaskStatusIcon(taskStatuses.email, sendingEmail)}
                                  <div>
                                    <h4 className='font-medium'>Send Settlement Email</h4>
                                    <p className='text-sm opacity-75'>
                                      {sendingEmail ? 'Sending...' : getTaskStatusText(taskStatuses.email)}
                                    </p>
                                    <p className='text-xs opacity-60 mt-1'>Send the completed settlement form details to the settlement agent</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleSendApprovalEmail(selectedApplication.id)}
                                  disabled={!emailCanBeSent || sendingEmail}
                                  className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                  title={!settlementFormCompleted ? 'Settlement form must be completed first' : ''}
                                >
                                  {sendingEmail ? 'Sending...' : 'Send Email'}
                                </button>
                              </div>
                              <div className='mt-2 space-y-1'>
                                {selectedApplication.notifications?.find(n => n.notification_type === 'application_approved')?.sent_at && (
                                  <div className='text-sm opacity-75'>
                                    Task Completed: {new Date(selectedApplication.notifications.find(n => n.notification_type === 'application_approved').sent_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        );
                      } else {
                        // Standard application workflow - 4 tasks
                        const bothFormsCompleted = taskStatuses.inspection === 'completed' && taskStatuses.resale === 'completed';
                        const pdfCanBeGenerated = bothFormsCompleted && (taskStatuses.pdf === 'not_started' || taskStatuses.pdf === 'update_needed');
                        const emailCanBeSent = bothFormsCompleted && taskStatuses.pdf === 'completed';

                      return (
                        <>
                                {/* Task 1: Property Inspection Form */}
                                <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.inspection)}`}>
                                  <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                      <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                        <span className='text-sm font-bold'>1</span>
                                      </div>
                                      {getTaskStatusIcon(taskStatuses.inspection)}
                                      <div>
                                        <h4 className='font-medium'>Property Inspection Form</h4>
                                        <p className='text-sm opacity-75'>{getTaskStatusText(taskStatuses.inspection)}</p>
                                        <p className='text-xs opacity-60 mt-1'>Complete the property inspection checklist and verify compliance requirements</p>
                                      </div>
                                    </div>
                                    <div className='flex gap-2'>
                                      <button
                                        onClick={() => handleCompleteForm(selectedApplication.id, 'inspection')}
                                        disabled={loadingFormData}
                                        className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                      >
                                        {loadingFormData ? 'Loading...' : getFormButtonText(taskStatuses.inspection)}
                                      </button>
                                      {!selectedApplication.inspection_form_completed_at && (
                                        <button
                                          onClick={() => handleCompleteTask(selectedApplication.id, 'inspection_form')}
                                          className='px-3 py-2 bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors text-sm font-medium'
                                          title='Mark this task as completed'
                                        >
                                          Mark Complete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className='mt-2 space-y-1'>
                                    {selectedApplication.inspection_form_completed_at && (
                                      <div className='text-sm opacity-75'>
                                        Task Completed: {new Date(selectedApplication.inspection_form_completed_at).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Task 2: Virginia Resale Certificate */}
                                <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.resale)}`}>
                                  <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                      <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                        <span className='text-sm font-bold'>2</span>
                                      </div>
                                      {getTaskStatusIcon(taskStatuses.resale)}
                                      <div>
                                        <h4 className='font-medium'>Virginia Resale Certificate</h4>
                                        <p className='text-sm opacity-75'>{getTaskStatusText(taskStatuses.resale)}</p>
                                        <p className='text-xs opacity-60 mt-1'>Fill out the official Virginia resale disclosure form with property and HOA information</p>
                                      </div>
                                    </div>
                                    <div className='flex gap-2'>
                                      <button
                                        onClick={() => handleCompleteForm(selectedApplication.id, 'resale')}
                                        disabled={loadingFormData}
                                        className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                      >
                                        {loadingFormData ? 'Loading...' : getFormButtonText(taskStatuses.resale)}
                                      </button>
                                      {!selectedApplication.resale_certificate_completed_at && (
                                        <button
                                          onClick={() => handleCompleteTask(selectedApplication.id, 'resale_certificate')}
                                          className='px-3 py-2 bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors text-sm font-medium'
                                          title='Mark this task as completed'
                                        >
                                          Mark Complete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className='mt-2 space-y-1'>
                                    {selectedApplication.resale_certificate_completed_at && (
                                      <div className='text-sm opacity-75'>
                                        Task Completed: {new Date(selectedApplication.resale_certificate_completed_at).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Task 3: Generate PDF */}
                                <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.pdf)}`}>
                                  <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                      <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                        <span className='text-sm font-bold'>3</span>
                                      </div>
                                      {getTaskStatusIcon(taskStatuses.pdf, generatingPDF)}
                                      <div>
                                        <h4 className='font-medium'>Generate PDF</h4>
                                        <p className='text-sm opacity-75'>
                                          {generatingPDF ? 'Generating...' : getTaskStatusText(taskStatuses.pdf)}
                                        </p>
                                        <p className='text-xs opacity-60 mt-1'>Create the final PDF document combining both completed forms for delivery</p>
                                      </div>
                                    </div>
                                    <div className='flex gap-2'>
                                      <button
                                        onClick={() => {
                                          const inspectionForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'inspection_form');
                                          const resaleForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
                                          const formsData = {
                                            inspectionForm: inspectionForm?.form_data,
                                            resaleCertificate: resaleForm?.form_data
                                          };
                                          handleGeneratePDF(formsData, selectedApplication.id);
                                        }}
                                        disabled={generatingPDF}
                                        className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                        title="Generate or regenerate PDF."
                                      >
                                        {generatingPDF ? 'Generating...' : 
                                          (taskStatuses.pdf === 'completed' || taskStatuses.pdf === 'update_needed' ? 'Regenerate' : 'Generate')
                                        }
                                      </button>
                                      {selectedApplication.pdf_url && (
                                        <button
                                          onClick={() => window.open(selectedApplication.pdf_url, '_blank')}
                                          className='px-3 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium flex items-center gap-1'
                                          title='View PDF'
                                        >
                                          <Eye className='w-4 h-4' />
                                          View
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className='mt-2 space-y-1'>
                                    {selectedApplication.pdf_completed_at && (
                                      <div className='text-sm opacity-75'>
                                        Task Completed: {new Date(selectedApplication.pdf_completed_at).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Task 4: Send Completion Email */}
                                <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.email)}`}>
                                  <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-3'>
                                      <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                        <span className='text-sm font-bold'>4</span>
                                      </div>
                                      {getTaskStatusIcon(taskStatuses.email, sendingEmail)}
                                      <div>
                                        <h4 className='font-medium'>Send Completion Email</h4>
                                        <p className='text-sm opacity-75'>
                                          {sendingEmail ? 'Sending...' : getTaskStatusText(taskStatuses.email)}
                                        </p>
                                        <p className='text-xs opacity-60 mt-1'>Send the completed resale certificate PDF and property files to the applicant</p>
                                      </div>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                      <button
                                        onClick={() => setShowAttachmentModal(true)}
                                        className='px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:opacity-80 transition-opacity text-xs font-medium'
                                        title="Manage email attachments"
                                      >
                                        Update Attachment
                                      </button>
                                      <button
                                        onClick={() => handleSendApprovalEmail(selectedApplication.id)}
                                        disabled={!emailCanBeSent || sendingEmail || taskStatuses.pdf === 'update_needed'}
                                        className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                        title={
                                          !bothFormsCompleted 
                                            ? 'Both forms must be completed first' 
                                            : taskStatuses.pdf !== 'completed' 
                                              ? 'PDF must be generated first' 
                                              : taskStatuses.pdf === 'update_needed'
                                                ? 'PDF needs to be regenerated after form updates'
                                                : ''
                                        }
                                      >
                                        {sendingEmail ? 'Sending...' : 'Send Email'}
                                      </button>
                                      {!selectedApplication.email_completed_at && (
                                        <button
                                          onClick={() => handleCompleteTask(selectedApplication.id, 'email')}
                                          className='px-3 py-2 bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors text-sm font-medium'
                                          title='Mark this task as completed'
                                        >
                                          Mark Complete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className='mt-2 space-y-1'>
                                    {selectedApplication.email_completed_at && (
                                      <div className='text-sm opacity-75'>
                                        Task Completed: {new Date(selectedApplication.email_completed_at).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>
                        </>
                      );
                      }
                    })()}
                  </div>
                </div>

                )}


                {/* Close Button */}
                <div className='flex justify-center pt-6 border-t'>
                  <button
                    onClick={() => setSelectedApplication(null)}
                    className='px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium'
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attachment Management Modal */}
        {showAttachmentModal && (
          <div className='fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-[70]'>
            {renderAttachmentModal()}
          </div>
        )}

        {/* Snackbar Notification */}
        {snackbar.show && (
          <div className='fixed bottom-4 right-4 z-[90]'>
            <div className={`
              px-6 py-4 rounded-lg shadow-lg border flex items-center gap-3 max-w-md
              ${snackbar.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
              }
            `}>
              <span className='text-sm font-medium'>{snackbar.message}</span>
              <button
                onClick={() => setSnackbar({ show: false, message: '', type: 'success' })}
                className='text-current opacity-70 hover:opacity-100'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>
        )}

        {/* Inspection Form Modal */}
        {showInspectionFormModal && inspectionFormData && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]'>
            <div className='bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col'>
              <div className='p-4 border-b flex justify-between items-center'>
                <h2 className='text-xl font-bold text-gray-900'>
                  Property Inspection Form
                </h2>
                <button
                  onClick={() => {
                    setShowInspectionFormModal(false);
                    setInspectionFormData(null);
                  }}
                  className='text-gray-400 hover:text-gray-600'
                >
                  <X className='w-6 h-6' />
                </button>
              </div>
              <div className='flex-1 overflow-auto'>
                <AdminPropertyInspectionForm
                  applicationData={inspectionFormData}
                  formId={inspectionFormData.property_owner_forms[0]?.id}
                  onComplete={handleFormComplete}
                  isModal={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Settlement Form Modal */}
        {showSettlementFormModal && selectedApplicationForSettlement && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]'>
            <div className='bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col'>
              <div className='p-4 border-b flex justify-between items-center'>
                <h2 className='text-xl font-bold text-gray-900'>
                  Settlement Form - Application #{selectedApplicationForSettlement.id}
                </h2>
                <button
                  onClick={() => {
                    setShowSettlementFormModal(false);
                    setSelectedApplicationForSettlement(null);
                  }}
                  className='text-gray-400 hover:text-gray-600'
                >
                  <X className='w-6 h-6' />
                </button>
              </div>
              <div className='flex-1 overflow-auto max-h-[calc(95vh-80px)]'>
                <AdminSettlementForm
                  applicationId={selectedApplicationForSettlement.id}
                  applicationData={{
                    id: selectedApplicationForSettlement.id,
                    ...selectedApplicationForSettlement,
                    hoa_properties: selectedApplicationForSettlement.hoa_properties || { name: selectedApplicationForSettlement.hoa_property || 'N/A' },
                    property_owner_forms: []
                  }}
                  onClose={() => {
                    setShowSettlementFormModal(false);
                    setSelectedApplicationForSettlement(null);
                  }}
                  isModal={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Resale Certificate Form Modal */}
        {showResaleFormModal && resaleFormData && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]'>
            <div className='bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col'>
              <div className='p-4 border-b flex justify-between items-center'>
                <h2 className='text-xl font-bold text-gray-900'>
                  Virginia Resale Certificate Form
                </h2>
                <button
                  onClick={() => {
                    setShowResaleFormModal(false);
                    setResaleFormData(null);
                  }}
                  className='text-gray-400 hover:text-gray-600'
                >
                  <X className='w-6 h-6' />
                </button>
              </div>
              <div className='flex-1 overflow-auto'>
                <AdminResaleCertificateForm
                  applicationData={resaleFormData}
                  formId={resaleFormData.property_owner_forms[0]?.id}
                  onComplete={handleFormComplete}
                  isModal={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Property Files Management Modal */}
        {showPropertyFilesModal && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]'>
            <div className='bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col'>
              <div className='p-4 border-b flex justify-between items-center'>
                <h2 className='text-xl font-bold text-gray-900'>
                  Property Files - {selectedApplication?.hoa_properties?.name || 'Property'}
                </h2>
                <button
                  onClick={() => setShowPropertyFilesModal(false)}
                  className='text-gray-400 hover:text-gray-600'
                >
                  <X className='w-6 h-6' />
                </button>
              </div>

              <div className='flex-1 overflow-y-auto p-4'>
                {/* Upload Section */}
                <div className='mb-6'>
                  <h3 className='text-lg font-medium text-gray-900 mb-3'>Upload New Files</h3>
                  <div className='space-y-3'>
                    <input
                      type='file'
                      multiple
                      onChange={handlePropertyFileSelect}
                      className='block w-full text-sm text-gray-500 
                               file:mr-4 file:py-2 file:px-4 
                               file:rounded-md file:border-0 
                               file:text-sm file:font-medium 
                               file:bg-blue-50 file:text-blue-700 
                               hover:file:bg-blue-100'
                    />
                    
                    {selectedFilesForUpload.length > 0 && (
                      <div>
                        <p className='text-sm font-medium text-gray-700 mb-2'>
                          Selected Files ({selectedFilesForUpload.length}):
                        </p>
                        <div className='space-y-1 max-h-32 overflow-y-auto'>
                          {selectedFilesForUpload.map((file, index) => (
                            <div key={index} className='text-sm text-gray-600 bg-gray-50 p-2 rounded'>
                              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                          ))}
                        </div>
                        
                        <button
                          onClick={uploadPropertyFiles}
                          disabled={uploading}
                          className='mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2'
                        >
                          {uploading ? (
                            <>
                              <div className='animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent'></div>
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className='w-4 h-4' />
                              Upload Files
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Existing Files Section */}
                <div>
                  <h3 className='text-lg font-medium text-gray-900 mb-3'>Existing Files</h3>
                  {loadingPropertyFiles ? (
                    <div className='text-center py-4'>
                      <div className='animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mx-auto mb-2'></div>
                      <p className='text-sm text-gray-600'>Loading files...</p>
                    </div>
                  ) : propertyFiles.length === 0 ? (
                    <div className='text-center py-6 text-gray-500 border border-gray-200 rounded-lg bg-gray-50'>
                      <FileText className='w-8 h-8 mx-auto mb-2 text-gray-300' />
                      <p className='font-medium'>No files uploaded</p>
                      <p className='text-sm'>Upload HOA bylaws, CC&Rs, and other property documents above</p>
                    </div>
                  ) : (
                    <div className='space-y-2'>
                      {propertyFiles.map((file, index) => (
                        <div key={index} className='flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50'>
                          <div className='flex items-center gap-3'>
                            <FileText className='w-5 h-5 text-blue-600' />
                            <div>
                              <p className='text-sm font-medium text-gray-900'>
                                {file.name.split('_').slice(1).join('_')}
                              </p>
                              <p className='text-xs text-gray-500'>
                                Uploaded {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Recently'}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            {file.url && (
                              <button
                                onClick={() => window.open(file.url, '_blank')}
                                className='p-1 text-blue-600 hover:text-blue-800'
                                title='View file'
                              >
                                <Eye className='w-4 h-4' />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this file?')) {
                                  deletePropertyFile(file.name);
                                }
                              }}
                              className='p-1 text-red-600 hover:text-red-800'
                              title='Delete file'
                            >
                              <Trash2 className='w-4 h-4' />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className='p-4 border-t flex justify-end'>
                <button
                  onClick={() => setShowPropertyFilesModal(false)}
                  className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminApplications;