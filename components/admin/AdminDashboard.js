import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Joyride, { STATUS } from 'react-joyride';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  Mail,
  Calendar,
  DollarSign,
  Building,
  User,
  Filter,
  Search,
  Download,
  RefreshCw,
  MessageSquare,
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
} from 'lucide-react';
import { useRouter } from 'next/router';
import { mapFormDataToPDFFields } from '../../lib/pdfFieldMapper';
import { parseEmails, formatEmailsForStorage, validateEmails } from '../../lib/emailUtils';
import MultiEmailInput from '../common/MultiEmailInput';
import AdminLayout from './AdminLayout';

// Helper function to normalize location value for dropdown
const normalizeLocation = (location) => {
  if (!location) return '';
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) {
    return 'Virginia';
  }
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) {
    return 'North Carolina';
  }
  // If it's already one of our valid values, return it
  if (location === 'Virginia' || location === 'North Carolina') {
    return location;
  }
  return '';
};

const AdminDashboard = ({ userRole }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [temporaryAttachments, setTemporaryAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showPropertyEditModal, setShowPropertyEditModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertyFormData, setPropertyFormData] = useState({
    name: '',
    location: '',
    property_owner_name: '',
    property_owner_email: [], // Changed to array for multiple emails
    property_owner_phone: '',
    management_contact: '',
    phone: '',
    email: '',
    special_requirements: ''
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingProperty, setUploadingProperty] = useState(false);
  const [propertyFiles, setPropertyFiles] = useState([]);
  const [loadingPropertyFiles, setLoadingPropertyFiles] = useState(false);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'success' });

  const supabase = createClientComponentClient();
  const router = useRouter();

  // Snackbar helper function
  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: '', type: 'success' });
    }, 4000); // Hide after 4 seconds
  };

  const steps = [
    {
      target: '.dashboard-header',
      content:
        'Welcome to the GMG ResaleFlow Admin Dashboard! This tour will show you how to manage resale certificates and property inspections.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '.stats-cards',
      content:
        'These cards show you a quick overview of all applications, including those needing attention and completed ones.',
      placement: 'bottom',
    },
    {
      target: '.filters-section',
      content:
        'Use these filters to find specific applications. You can filter by status or search by property address, submitter name, or HOA.',
      placement: 'top',
    },
    {
      target: '.applications-table',
      content:
        'This table shows all applications. Each row represents a resale certificate application.',
      placement: 'top',
    },
    {
      target: '.status-column',
      content:
        'The status column shows where each application is in the process. Watch for "Needs Attention" indicators.',
      placement: 'left',
    },
    {
      target: '.forms-column',
      content:
        'Here you can see the status of both required forms: Property Inspection and Resale Certificate.',
      placement: 'left',
    },
    {
      target: '.action-buttons',
      content:
        'Use these buttons to view application details, generate PDFs, and send emails to applicants.',
      placement: 'left',
    },
    {
      target: '.view-modal',
      content:
        'The details modal shows all information about an application and lets you complete both required forms.',
      placement: 'center',
    },
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRunTour(false);
    }
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

  useEffect(() => {
    loadApplications();
  }, []);

  // Reload applications when date filter changes (reset to page 1)
  useEffect(() => {
    setCurrentPage(1);
    loadApplications();
  }, [dateFilter, customDateRange]);

  // Reload applications when page or items per page changes
  useEffect(() => {
    loadApplications();
  }, [currentPage, itemsPerPage]);

  // Reload applications when status filter or search term changes (reset to page 1)
  useEffect(() => {
    setCurrentPage(1);
    loadApplications();
  }, [selectedStatus, searchTerm]);

  const loadApplications = async (silent = false) => {
    // Only show refreshing state if not a silent update (real-time updates are silent)
    if (!silent) {
      setRefreshing(true);
    }
    try {
      // First, get the total count for pagination (exclude soft-deleted)
      let countQuery = supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null); // Only count non-deleted applications

      // All admin, staff, and accounting users can see all applications
      // (No role-based filtering - accounting users now have full visibility)

      // Apply filters to count query
      const dateRange = getDateRange();
      if (dateRange) {
        countQuery = countQuery
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());
      }
      
      if (selectedStatus !== 'all') {
        countQuery = countQuery.eq('status', selectedStatus);
      }

      if (searchTerm) {
        countQuery = countQuery.or(`property_address.ilike.%${searchTerm}%,submitter_name.ilike.%${searchTerm}%,hoa_properties.name.ilike.%${searchTerm}%`);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      
      setTotalCount(count || 0);

      // Then get the paginated data (exclude soft-deleted)
      let query = supabase
        .from('applications')
        .select(
          `
          *,
          hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
          notifications(id, notification_type, status, sent_at)
        `
        )
        .is('deleted_at', null); // Only get non-deleted applications

      // All admin, staff, and accounting users can see all applications
      // (No role-based filtering - accounting users now have full visibility)

      // Apply all filters to data query
      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());
      }

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      if (searchTerm) {
        query = query.or(`property_address.ilike.%${searchTerm}%,submitter_name.ilike.%${searchTerm}%,hoa_properties.name.ilike.%${searchTerm}%`);
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage;
      query = query
        .range(startIndex, startIndex + itemsPerPage - 1)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('❌ Applications query error:', error);
        throw error;
      }

      // Process the data to group forms by application
      const processedData = data.map((app) => {
        // Find the inspection form and resale certificate form for this application
        const inspectionForm = app.property_owner_forms?.find(
          (f) => f.form_type === 'inspection_form'
        );
        const resaleCertificate = app.property_owner_forms?.find(
          (f) => f.form_type === 'resale_certificate'
        );

        const processedApp = {
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

        return processedApp;
      });

      setApplications(processedData);
    } catch (err) {
      console.error('❌ Failed to load applications:', err);
      setApplications([]); // Set empty array on error to prevent crashes
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Set up real-time subscription for applications table
  useEffect(() => {
    if (!supabase) {
      console.warn('Supabase client not available for real-time subscription');
      return;
    }


    // Debounce function to batch rapid updates (silent background refresh)
    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Silent refresh - no loading indicator
        loadApplications(true).catch(err => console.warn('Failed to refresh applications list:', err));
      }, 150); // Small debounce for batching
    };

    // Create a channel for real-time updates
    const channel = supabase
      .channel('applications-changes-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
          console.log('Real-time application change detected in dashboard:', payload.eventType, payload.new?.id || payload.old?.id);
          
          // For INSERT events, refresh immediately (new application) - no debounce for instant updates
          if (payload.eventType === 'INSERT') {
            const newApp = payload.new;
            // Skip if it's a draft (we filter those out)
            if (newApp.status === 'draft') {
              return;
            }
            
            console.log('New application inserted, updating silently...');
            // Optimistically add to list for instant UI update
            setApplications((currentApps) => {
              // Check if already exists (prevent duplicates)
              if (currentApps.some(app => app.id === newApp.id)) {
                return currentApps;
              }
              // Add to beginning of list
              return [newApp, ...currentApps];
            });
            // Update count optimistically
            setTotalCount((currentCount) => currentCount + 1);
            // Refresh full data silently in background (no loading indicator)
            loadApplications(true).catch(err => console.warn('Failed to refresh applications list:', err));
          }
          // For UPDATE events, refresh if status is not draft
          else if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new?.status;
            const oldStatus = payload.old?.status;
            const updatedApp = payload.new;
            
            // Skip draft-only updates
            if (newStatus === 'draft' && oldStatus === 'draft') {
              return;
            }
            
            // If status changed from draft to submitted, refresh silently
            if (oldStatus === 'draft' && newStatus !== 'draft') {
              console.log('Application submitted, updating silently...');
              // Optimistically add if not in list, or update if exists
              setApplications((currentApps) => {
                const exists = currentApps.some(app => app.id === updatedApp.id);
                if (exists) {
                  return currentApps.map(app => 
                    app.id === updatedApp.id ? { ...app, ...updatedApp } : app
                  );
                } else {
                  return [updatedApp, ...currentApps];
                }
              });
              setTotalCount((currentCount) => currentCount + 1);
              // Refresh silently in background
              loadApplications(true).catch(err => console.warn('Failed to refresh applications list:', err));
            } 
            // For other updates, optimistically update then refresh silently
            else if (newStatus !== 'draft') {
              console.log('Application updated, updating silently...');
              // Optimistically update in state
              setApplications((currentApps) =>
                currentApps.map(app => 
                  app.id === updatedApp.id ? { ...app, ...updatedApp } : app
                )
              );
              // Refresh silently in background
              debouncedRefresh();
            }
          }
          // For DELETE events, remove immediately (silent)
          else if (payload.eventType === 'DELETE') {
            const deletedApp = payload.old;
            console.log('Application deleted, updating silently...');
            // Optimistically remove from list
            setApplications((currentApps) =>
              currentApps.filter(app => app.id !== deletedApp.id)
            );
            // Update count
            setTotalCount((currentCount) => Math.max(0, currentCount - 1));
            // Refresh silently in background to verify
            loadApplications(true).catch(err => console.warn('Failed to refresh applications list:', err));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error in dashboard');
        }
      });

    // Cleanup subscription on unmount
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]); // loadApplications is intentionally not in deps to avoid recreating subscription on every render

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      awaiting_property_owner_response: 'bg-yellow-100 text-yellow-800',
      under_review: 'bg-purple-100 text-purple-800',
      compliance_completed: 'bg-green-100 text-green-800',
      approved: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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

  const getFormStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className='w-4 h-4 text-green-600' />;
      case 'opened':
        return <Edit className='w-4 h-4 text-blue-600' />;
      case 'sent':
        return <Mail className='w-4 h-4 text-yellow-600' />;
      case 'not_created':
        return <Clock className='w-4 h-4 text-gray-400' />;
      default:
        return <Clock className='w-4 h-4 text-gray-400' />;
    }
  };

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
      // Settlement application - only settlement form
      // Find settlement form from property_owner_forms array
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
      
      // Derive PDF status from settlement PDF URL
      let pdfStatus = 'not_started';
      if (application.settlement_pdf_url && application.pdf_generated_at) {
        // Check if settlement form was updated after PDF generation
        const pdfGeneratedAt = new Date(application.pdf_generated_at || 0);
        const formUpdatedAt = new Date(settlementForm?.updated_at || application.updated_at || 0);
        
        // If form was updated after PDF generation, mark as needing update
        if (formUpdatedAt > pdfGeneratedAt) {
          pdfStatus = 'update_needed';
        } else {
          pdfStatus = 'completed';
        }
      }
      
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = !!application.email_completed_at;
      const hasEmailSent = hasNotificationSent || hasEmailCompletedAt;

      return {
        settlement: settlementFormStatus,
        pdf: pdfStatus,
        email: hasEmailSent ? 'completed' : 'not_started'
      };
    } else {
      // Standard application - inspection and resale forms
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
      const hasEmailCompletedAt = !!application.email_completed_at;
      const hasEmailSent = hasNotificationSent || hasEmailCompletedAt;

      return {
        inspection: inspectionFormStatus,
        resale: resaleFormStatus,
        pdf: pdfStatus,
        email: hasEmailSent ? 'completed' : 'not_started'
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

  const getFormStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
        return 'Not Started';
      case 'expired':
        return 'Expired';
      default:
        return status;
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  // Applications are now filtered on the server side via Supabase queries
  const filteredApplications = applications;

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  const handleCompleteForm = async (applicationId, formType) => {
    // Handle different form types
    let formTypeValue, status;
    
    if (formType === 'settlement') {
      formTypeValue = 'settlement_form';
      const settlementForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'settlement_form');
      status = settlementForm?.status || 'not_started';
    } else {
      const form = formType === 'inspection' ? 'inspectionForm' : 'resaleCertificate';
      formTypeValue = formType === 'inspection' ? 'inspection_form' : 'resale_certificate';
      status = selectedApplication.forms?.[form]?.status || 'not_started';
    }

    // If the form is not started, update its status to in_progress
    if (status === 'not_started') {
      try {
        await supabase
          .from('property_owner_forms')
          .update({
            status: 'in_progress',
            updated_at: new Date().toISOString(),
          })
          .eq('application_id', applicationId)
          .eq('form_type', formTypeValue);
      } catch (error) {
        console.error('Error updating form status:', error);
      }
    }

    // Update forms timestamp when editing completed forms (for PDF regeneration logic)
    const pdfUrl = selectedApplication.pdf_url || selectedApplication.settlement_pdf_url;
    if (status === 'completed' && pdfUrl) {
      try {
        const { error } = await supabase
          .from('applications')
          .update({
            forms_updated_at: new Date().toISOString(),
          })
          .eq('id', applicationId);
        
        if (error) {
          console.error('Error updating forms timestamp:', error);
        } else {
          console.log('Forms timestamp updated - PDF will show as needing regeneration');
        }
      } catch (error) {
        console.error('Error updating forms timestamp:', error);
      }
    }

    // Navigate to the form page
    console.log(`🚀 Navigating to /admin/${formType}/${applicationId}`);
    router.push(`/admin/${formType}/${applicationId}`);
  };


  const handleGeneratePDF = async (formData, applicationId) => {
    const startTime = Date.now();
    
    try {
      setGeneratingPDF(true);

      const response = await fetch('/api/regenerate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          applicationId,
        }),
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to generate PDF');
      
      // Refresh applications list to update UI
      await loadApplications();
      
      // Update the selected application if it's open in the modal
      if (selectedApplication && selectedApplication.id === applicationId) {
        try {
          // Refetch the specific application with updated data
          const { data: updatedApp } = await supabase
            .from('applications')
            .select(`
              *,
              hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
              property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
              notifications(id, notification_type, status, sent_at)
            `)
            .eq('id', applicationId)
            .single();
          
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
            };
            
            setSelectedApplication(processedApp);
            console.log('✅ Successfully refreshed selected application in dashboard');
          }
        } catch (refreshError) {
          console.warn('Failed to refresh selected application in dashboard:', refreshError);
        }
        
        // PRIMARY: Immediately update the selected application's PDF status
        // This ensures the UI updates instantly and consistently
        console.log('🔄 Immediately updating selected application PDF status in dashboard');
        setSelectedApplication(prev => ({
          ...prev,
          pdf_url: result.pdfUrl,
          pdf_completed_at: new Date().toISOString(),
          pdf_generated_at: new Date().toISOString()
        }));
      }
      
      // Show success message
      alert('PDF generated successfully!');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      // Ensure generating state is shown for at least 1 second for better UX
      const elapsedTime = Date.now() - startTime;
      const minDisplayTime = 1000; // 1 second
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
      
      setTimeout(() => {
        setGeneratingPDF(false);
      }, remainingTime);
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
        throw new Error('Settlement form not found');
      }

      // Get user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      
      // Call the settlement PDF generation API
      const response = await fetch('/api/generate-settlement-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          formData: settlementForm.form_data || settlementForm.response_data,
          timezone: userTimezone,
        }),
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to generate PDF');
      
      // Refresh applications list to update UI
      await loadApplications();
      
      // Update the selected application if it's open in the modal
      if (selectedApplication && selectedApplication.id === applicationId) {
        const { data: updatedApp } = await supabase
          .from('applications')
          .select(`
            *,
            hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
            property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
            notifications(id, notification_type, status, sent_at)
          `)
          .eq('id', applicationId)
          .single();
        
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
    setSendingEmail(true);
    try {
      // Check if this is a settlement application
      const isSettlementApp = selectedApplication?.application_type === 'settlement_agent_va' || 
                              selectedApplication?.application_type === 'settlement_agent_nc';
      
      // Use settlement email API for settlement applications
      const apiEndpoint = isSettlementApp ? '/api/send-settlement-approval-email' : '/api/send-approval-email';
      
      // Include temporary attachments in the email request
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          applicationId,
          temporaryAttachments: temporaryAttachments.map(att => ({
            name: att.name,
            size: att.size,
            type: att.type,
            file: att.file // This would need to be converted to base64 or handled differently for API
          }))
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send approval email');
      }

      // Clear temporary attachments after successful send
      setTemporaryAttachments([]);
      
      // Mark Task 2 (Email) as completed with timestamp
      try {
        await fetch('/api/complete-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            applicationId: applicationId,
            taskName: 'email'
          }),
        });
      } catch (taskError) {
        console.error('Failed to mark email task as completed:', taskError);
        // Don't throw - email was sent successfully
      }
      
      // Refresh applications list to update task status
      await loadApplications();
      
      // Update the selected application if it's open in the modal
      if (selectedApplication && selectedApplication.id === applicationId) {
        try {
          // Refetch the specific application with updated data
          const { data: updatedApp } = await supabase
            .from('applications')
            .select(`
              *,
              hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
              property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
              notifications(id, notification_type, status, sent_at)
            `)
            .eq('id', applicationId)
            .single();
          
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
            };
            
            setSelectedApplication(processedApp);
            console.log('✅ Successfully refreshed selected application after email send in dashboard');
          }
        } catch (refreshError) {
          console.warn('Failed to refresh selected application after email send in dashboard:', refreshError);
        }
        
        // PRIMARY: Immediately update the selected application's email status
        // This ensures the UI updates instantly and consistently
        console.log('🔄 Immediately updating selected application email status in dashboard');
        setSelectedApplication(prev => ({
          ...prev,
          email_completed_at: new Date().toISOString(),
          status: 'approved',
          updated_at: new Date().toISOString(),
          // Notification creation removed - no longer needed
          notifications: prev.notifications || []
        }));
      }
      
      showSnackbar('Email sent successfully!', 'success');
    } catch (error) {
      console.error('Failed to send approval email:', error);
      showSnackbar('Failed to send email. Please try again.', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const renderActionButtons = (application) => {

    return (
      <div className='flex space-x-2'>
        <button
          onClick={() => setSelectedApplication(application)}
          className='px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center space-x-1'
        >
          <Eye className='w-4 h-4' />
          <span>View</span>
        </button>

      </div>
    );
  };

  const renderApplicationModal = () => {
    if (!selectedApplication) return null;

    return (
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
        <div className='bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6'>
          <div className='p-6 border-b'>
            <div className='flex justify-between items-center'>
              <h2 className='text-xl font-bold text-gray-900'>
                Application #{selectedApplication.id} Details
              </h2>
              <button
                onClick={() => setSelectedApplication(null)}
                className='text-gray-400 hover:text-gray-600'
              >
                ✕
              </button>
            </div>
          </div>

          <div className='p-6 space-y-6'>
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
                    {selectedApplication.hoa_properties?.name}
                  </div>
                  <div>
                    <strong>Buyer:</strong> {selectedApplication.buyer_name}
                  </div>
                  <div>
                    <strong>Seller:</strong> {selectedApplication.seller_name}
                  </div>
                  <div>
                    <strong>Sale Price:</strong> $
                    {selectedApplication.sale_price?.toLocaleString()}
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
                    {selectedApplication.submitter_name}
                  </div>
                  <div>
                    <strong>Email:</strong>{' '}
                    {selectedApplication.submitter_email}
                  </div>
                  <div>
                    <strong>Phone:</strong>{' '}
                    {selectedApplication.submitter_phone}
                  </div>
                  <div>
                    <strong>Type:</strong> {selectedApplication.submitter_type}
                  </div>
                  <div>
                    <strong>License:</strong>{' '}
                    {selectedApplication.realtor_license || 'N/A'}
                  </div>
                  <div>
                    <strong>Package:</strong> {selectedApplication.package_type}
                  </div>
                  <div>
                    <strong>Total Amount:</strong> $
                    {selectedApplication.total_amount?.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Task-Based Workflow */}
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
                            <button
                              onClick={() => handleCompleteForm(selectedApplication.id, 'settlement')}
                              className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium'
                            >
                              {getFormButtonText(taskStatuses.settlement)}
                            </button>
                          </div>
                          {(() => {
                            const settlementForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'settlement_form');
                            return settlementForm?.completed_at && (
                              <div className='mt-2 text-sm opacity-75'>
                                Completed: {new Date(settlementForm.completed_at).toLocaleString()}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Task 2: Generate PDF */}
                        <div className={`border rounded-lg p-4 ${getTaskStatusColor(taskStatuses.pdf)}`}>
                          <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                              <div className='flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-current'>
                                <span className='text-sm font-bold'>2</span>
                              </div>
                              {getTaskStatusIcon(taskStatuses.pdf)}
                              <div>
                                <h4 className='font-medium'>Generate PDF</h4>
                                <p className='text-sm opacity-75'>{getTaskStatusText(taskStatuses.pdf)}</p>
                                <p className='text-xs opacity-60 mt-1'>Generate the settlement form as a PDF document</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleGenerateSettlementPDF(selectedApplication.id)}
                              disabled={!pdfCanBeGenerated || generatingPDF}
                              className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                              title={!settlementFormCompleted ? 'Settlement form must be completed first' : ''}
                            >
                              {generatingPDF ? 'Generating...' : 'Generate PDF'}
                            </button>
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
                          {selectedApplication.email_completed_at && (
                            <div className='mt-2 text-sm opacity-75'>
                              Sent: {new Date(selectedApplication.email_completed_at).toLocaleString()}
                            </div>
                          )}
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
                            <button
                              onClick={() => handleCompleteForm(selectedApplication.id, 'inspection')}
                              className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium'
                            >
                              {getFormButtonText(taskStatuses.inspection)}
                            </button>
                          </div>
                          {(() => {
                            const inspectionForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'inspection_form');
                            return inspectionForm?.completed_at && (
                              <div className='mt-2 text-sm opacity-75'>
                                Completed: {new Date(inspectionForm.completed_at).toLocaleString()}
                              </div>
                            );
                          })()}
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
                            <button
                              onClick={() => handleCompleteForm(selectedApplication.id, 'resale')}
                              className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium'
                            >
                              {getFormButtonText(taskStatuses.resale)}
                            </button>
                          </div>
                          {(() => {
                            const resaleForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
                            return resaleForm?.completed_at && (
                              <div className='mt-2 text-sm opacity-75'>
                                Completed: {new Date(resaleForm.completed_at).toLocaleString()}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Task 3: Generate PDF (Standard) */}
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
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const inspectionForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'inspection_form');
                                  const resaleForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
                                  const formsData = {
                                    inspectionForm: inspectionForm?.form_data,
                                    resaleCertificate: resaleForm?.form_data
                                  };
                                  handleGeneratePDF(formsData, selectedApplication.id);
                                }}
                                disabled={!pdfCanBeGenerated || generatingPDF}
                                className='px-4 py-2 bg-white text-current border border-current rounded-md hover:opacity-80 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
                                title={!bothFormsCompleted ? 'Both forms must be completed first' : ''}
                              >
                                {generatingPDF ? 'Generating...' : (taskStatuses.pdf === 'completed' || taskStatuses.pdf === 'update_needed' ? 'Regenerate' : 'Generate')}
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
                          {selectedApplication.pdf_generated_at && (
                            <div className='mt-2 text-sm opacity-75'>
                              Generated: {new Date(selectedApplication.pdf_generated_at).toLocaleString()}
                            </div>
                          )}
                        </div>

                        {/* Task 4: Send Completion Email (Standard) */}
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
                            </div>
                          </div>
                          {selectedApplication.email_completed_at && (
                            <div className='mt-2 text-sm opacity-75'>
                              Sent: {new Date(selectedApplication.email_completed_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  }
                })()}
              </div>
            </div>

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
    );
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
    if (!propertyId) return;
    
    setLoadingPropertyFiles(true);
    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .list(`property_files/${propertyId}`, {
          limit: 100,
          offset: 0
        });

      if (error) throw error;
      
      // Convert to format with URLs
      const filesWithUrls = await Promise.all((data || []).map(async (file) => {
        const { data: urlData } = await supabase.storage
          .from('bucket0')
          .createSignedUrl(`property_files/${propertyId}/${file.name}`, 3600); // 1 hour expiry
        
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
      
      setPropertyFiles(filesWithUrls);
    } catch (error) {
      console.error('Error loading property files:', error);
      setPropertyFiles([]);
    } finally {
      setLoadingPropertyFiles(false);
    }
  };

  // Property editing functions
  const loadPropertyForEdit = async (propertyId, openModal = true) => {
    try {
      console.log('🔄 Loading property data for ID:', propertyId);
      
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (error) throw error;

      console.log('📄 Fresh property data from database:', data);
      console.log('📧 Management email from DB:', data.email);

      setSelectedProperty(data);
      const formData = {
        name: data.name || '',
        location: normalizeLocation(data.location),
        property_owner_name: data.property_owner_name || '',
        property_owner_email: parseEmails(data.property_owner_email), // Parse emails into array
        property_owner_phone: data.property_owner_phone || '',
        management_contact: data.management_contact || '',
        phone: data.phone || '',
        email: data.email || '',
        special_requirements: data.special_requirements || ''
      };
      
      console.log('📝 Setting form data:', formData);
      console.log('📧 Management email in form:', formData.email);
      
      setPropertyFormData(formData);
      setSelectedFiles([]);
      
      // Load property files for this property
      await loadPropertyFiles(propertyId);
      
      if (openModal) {
        setShowPropertyEditModal(true);
      }
    } catch (error) {
      console.error('Error loading property:', error);
      alert('Failed to load property details');
    }
  };

  const handlePropertyFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  };

  const deletePropertyFile = async (propertyId, fileName, fileId) => {
    try {
      console.log('🗑️ Deleting file:', fileName, 'from property:', propertyId);
      
      // Delete from Supabase storage
      const { error } = await supabase.storage
        .from('bucket0')
        .remove([`property_files/${propertyId}/${fileName}`]);

      if (error) throw error;

      console.log('✅ File deleted successfully');
      
      // Remove from local state immediately for UI feedback
      setPropertyFiles(prev => prev.filter(file => file.id !== fileId));
      
      // Reload property files to ensure consistency
      await loadPropertyFiles(propertyId);
      
      showSnackbar('File deleted successfully', 'success');
    } catch (error) {
      console.error('❌ Error deleting file:', error);
      showSnackbar('Error deleting file: ' + error.message, 'error');
    }
  };

  const uploadPropertyFiles = async (propertyId) => {
    if (selectedFiles.length === 0) return;

    setUploadingProperty(true);
    try {
      const uploadPromises = selectedFiles.map(async (file) => {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `property_files/${propertyId}/${fileName}`;

        const { error } = await supabase.storage
          .from('bucket0')
          .upload(filePath, file);

        if (error) throw error;
        return filePath;
      });

      await Promise.all(uploadPromises);

      setSelectedFiles([]);
      // Refresh property files in attachment modal
      await loadPropertyFiles(propertyId);
      showSnackbar('Property files uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading files:', error);
      showSnackbar('Error uploading files: ' + error.message, 'error');
    } finally {
      setUploadingProperty(false);
    }
  };

  const handlePropertySave = async (e) => {
    e.preventDefault();
    
    try {
      // Validate emails before submission
      const emailValidation = validateEmails(propertyFormData.property_owner_email);
      if (!emailValidation.valid) {
        showSnackbar(`Email validation error: ${emailValidation.errors.join(', ')}`, 'error');
        return;
      }
      
      // Format emails for storage (comma-separated string)
      const emailsForStorage = formatEmailsForStorage(propertyFormData.property_owner_email);
      
      console.log('Saving property data:', propertyFormData);
      console.log('Property ID:', selectedProperty.id);
      
      // Update property data
      const { data, error } = await supabase
        .from('hoa_properties')
        .update({
          ...propertyFormData,
          property_owner_email: emailsForStorage, // Use formatted emails
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedProperty.id)
        .select();

      if (error) {
        console.error('Database update error:', error);
        throw error;
      }

      console.log('Property updated successfully:', data);

      // Upload files if any are selected
      if (selectedFiles.length > 0) {
        console.log('Uploading files:', selectedFiles.length);
        await uploadPropertyFiles(selectedProperty.id);
      }

      // Refresh property files in attachment modal
      if (selectedApplication?.hoa_property_id) {
        await loadPropertyFiles(selectedApplication.hoa_property_id);
      }

      // Reload the property data to update the form (without reopening modal)
      await loadPropertyForEdit(selectedProperty.id, false);

      // Refresh applications list to show updated property data
      await loadApplications();

      setShowPropertyEditModal(false);
      showSnackbar('Property updated successfully!', 'success');
    } catch (error) {
      console.error('Error saving property:', error);
      showSnackbar('Error saving property: ' + error.message, 'error');
    }
  };

  // Load property files when attachment modal opens
  useEffect(() => {
    if (showAttachmentModal && selectedApplication?.hoa_property_id) {
      loadPropertyFiles(selectedApplication.hoa_property_id);
    }
  }, [showAttachmentModal, selectedApplication?.hoa_property_id]);

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
                  onClick={() => loadPropertyForEdit(selectedApplication.hoa_property_id)}
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
                    onClick={() => loadPropertyForEdit(selectedApplication.hoa_property_id)}
                    className='inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 text-sm'
                  >
                    <Edit className='w-4 h-4' />
                    Edit Property Files
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

  const renderPropertyEditModal = () => {
    if (!selectedProperty) return null;

    return (
      <div className='bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto'>
        <div className='p-6 border-b border-gray-200'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <Building className='w-6 h-6 text-blue-600' />
              <div>
                <h2 className='text-xl font-semibold text-gray-900'>Edit Property</h2>
                <p className='text-sm text-gray-600'>Update property information and upload files</p>
              </div>
            </div>
            <button
              onClick={() => setShowPropertyEditModal(false)}
              className='text-gray-400 hover:text-gray-600 p-1'
            >
              <X className='w-6 h-6' />
            </button>
          </div>
        </div>

        <form onSubmit={handlePropertySave} className='p-6 space-y-6'>
          {/* Property Information */}
          <div className='grid grid-cols-1 gap-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-1'>
                Property Name
              </label>
              <input
                type='text'
                required
                value={propertyFormData.name}
                onChange={(e) => setPropertyFormData({...propertyFormData, name: e.target.value})}
                className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              />
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-1'>
                Location
              </label>
              <select
                required
                value={propertyFormData.location}
                onChange={(e) => setPropertyFormData({...propertyFormData, location: e.target.value})}
                className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value="">Select a state</option>
                <option value="Virginia">Virginia</option>
                <option value="North Carolina">North Carolina</option>
              </select>
            </div>
          </div>

          {/* Property Owner Information */}
          <div className='border-t pt-4'>
            <h3 className='text-md font-medium text-gray-900 mb-3'>Property Owner Information</h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Owner Name
                </label>
                <input
                  type='text'
                  required
                  value={propertyFormData.property_owner_name}
                  onChange={(e) => setPropertyFormData({...propertyFormData, property_owner_name: e.target.value})}
                  className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Owner Email
                </label>
                <MultiEmailInput
                  value={propertyFormData.property_owner_email}
                  onChange={(emails) => setPropertyFormData({...propertyFormData, property_owner_email: emails})}
                  required
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Owner Phone
                </label>
                <input
                  type='tel'
                  value={propertyFormData.property_owner_phone}
                  onChange={(e) => setPropertyFormData({...propertyFormData, property_owner_phone: e.target.value})}
                  className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
              </div>
            </div>
          </div>

          {/* Management Information removed per request */}

          {/* Special Requirements */}
          <div className='border-t pt-4'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              Special Requirements
            </label>
            <textarea
              rows={3}
              value={propertyFormData.special_requirements}
              onChange={(e) => setPropertyFormData({...propertyFormData, special_requirements: e.target.value})}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              placeholder='Any special requirements or notes...'
            />
          </div>

          {/* File Upload */}
          <div className='border-t pt-4'>
            <h3 className='text-md font-medium text-gray-900 mb-3'>Property Files</h3>
            
            {/* Show existing files */}
            {propertyFiles.length > 0 && (
              <div className='mb-4'>
                <div className='flex items-center justify-between mb-2'>
                  <label className='block text-sm font-medium text-gray-700'>
                    Current Files ({propertyFiles.length})
                  </label>
                  <button
                    type='button'
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete ALL ${propertyFiles.length} property files? This action cannot be undone.`)) {
                        // Delete all files
                        propertyFiles.forEach(file => {
                          deletePropertyFile(selectedProperty.id, file.originalName, file.id);
                        });
                      }
                    }}
                    className='text-xs text-red-600 hover:text-red-800 flex items-center gap-1'
                    title="Delete all files"
                  >
                    <Trash2 className='w-3 h-3' />
                    Clear All
                  </button>
                </div>
                <div className='space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3'>
                  {propertyFiles.map((file) => (
                    <div
                      key={file.id}
                      className='flex items-center justify-between p-2 bg-gray-50 rounded-md'
                    >
                      <div className='flex items-center gap-2'>
                        <FileText className='w-4 h-4 text-green-500' />
                        <span className='text-sm text-gray-700'>{file.name}</span>
                        {file.size && (
                          <span className='text-xs text-gray-500'>({formatFileSize(file.size)})</span>
                        )}
                      </div>
                      <div className='flex items-center gap-1'>
                        {file.url && (
                          <button
                            type='button'
                            onClick={() => window.open(file.url, '_blank')}
                            className='p-1 text-gray-400 hover:text-blue-600'
                            title="View file"
                          >
                            <Eye className='w-4 h-4' />
                          </button>
                        )}
                        <button
                          type='button'
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
                              deletePropertyFile(selectedProperty.id, file.originalName, file.id);
                            }
                          }}
                          className='p-1 text-gray-400 hover:text-red-600'
                          title="Delete file"
                        >
                          <Trash2 className='w-4 h-4' />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className='mb-4'>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Upload {propertyFiles.length > 0 ? 'Additional' : 'New'} Files
              </label>
              <div className='flex items-center gap-4'>
                <input
                  type='file'
                  multiple
                  onChange={handlePropertyFileSelect}
                  className='block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100'
                />
                {selectedFiles.length > 0 && (
                  <span className='text-sm text-gray-600'>
                    {selectedFiles.length} file(s) selected
                  </span>
                )}
              </div>
              <p className='text-xs text-gray-500 mt-1'>
                Add HOA bylaws, CC&Rs, insurance documents, and other property files
              </p>
            </div>
          </div>

          <div className='flex justify-end gap-3 pt-4 border-t'>
            <button
              type='button'
              onClick={() => setShowPropertyEditModal(false)}
              className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={uploadingProperty}
              className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50'
            >
              {uploadingProperty ? (
                <>
                  <RefreshCw className='w-4 h-4 animate-spin' />
                  Saving...
                </>
              ) : (
                <>
                  <Building className='w-4 h-4' />
                  Save Property
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
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
    <AdminLayout onStartTour={() => setRunTour(true)}>
      <Joyride
        steps={steps}
        run={runTour}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#166534',
            zIndex: 1000,
          },
        }}
      />

      <div className='max-w-7xl mx-auto p-6'>

        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                Dashboard Overview
              </h1>
              <p className='text-gray-600'>
                Monitor application workflows and complete required forms
              </p>
            </div>
            <button
              onClick={loadApplications}
              disabled={refreshing}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 stats-cards'>
          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <div className='flex items-center gap-3'>
              <FileText className='w-8 h-8 text-blue-600' />
              <div>
                <p className='text-sm text-gray-600'>
                  Total Applications
                  {dateFilter !== 'all' && (
                    <span className='text-xs text-blue-600 ml-1'>
                      ({dateFilter === 'today' ? 'Today' : 
                        dateFilter === 'week' ? 'This Week' : 
                        dateFilter === 'month' ? 'This Month' : 'Custom Range'})
                    </span>
                  )}
                </p>
                <p className='text-2xl font-bold text-gray-900'>
                  {applications.length}
                </p>
              </div>
            </div>
          </div>

          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <div className='flex items-center gap-3'>
              <Clock className='w-8 h-8 text-yellow-600' />
              <div>
                <p className='text-sm text-gray-600'>Awaiting Action</p>
                <p className='text-2xl font-bold text-gray-900'>
                  {(statusCounts['submitted'] || 0) +
                    (statusCounts['awaiting_property_owner_response'] || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <div className='flex items-center gap-3'>
              <CheckCircle className='w-8 h-8 text-green-600' />
              <div>
                <p className='text-sm text-gray-600'>Completed</p>
                <p className='text-2xl font-bold text-gray-900'>
                  {(statusCounts['completed'] || 0) +
                    (statusCounts['approved'] || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <div className='flex items-center gap-3'>
              <AlertTriangle className='w-8 h-8 text-red-600' />
              <div>
                <p className='text-sm text-gray-600'>Needs Attention</p>
                <p className='text-2xl font-bold text-gray-900'>
                  {
                    applications.filter(
                      (app) =>
                        (app.property_owner_response_due &&
                          isOverdue(app.property_owner_response_due)) ||
                        app.status === 'under_review'
                    ).length
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className='bg-white p-6 rounded-lg shadow-md border mb-8 filters-section'>
          <div className='flex flex-col lg:flex-row gap-4'>
            <div className='flex items-center gap-2'>
              <Filter className='w-4 h-4 text-gray-500' />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Statuses</option>
                <option value='submitted'>New Submissions</option>
                <option value='awaiting_property_owner_response'>Under Review</option>
                <option value='under_review'>Under Review</option>
                <option value='compliance_completed'>
                  Compliance Completed
                </option>
                <option value='approved'>Approved</option>
                <option value='completed'>Completed</option>
              </select>
            </div>

            <div className='flex items-center gap-2'>
              <Calendar className='w-4 h-4 text-gray-500' />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Time</option>
                <option value='today'>Today</option>
                <option value='week'>This Week</option>
                <option value='month'>This Month</option>
                <option value='custom'>Custom Range</option>
              </select>
            </div>

            {dateFilter === 'custom' && (
              <div className='flex items-center gap-2'>
                <input
                  type='date'
                  value={customDateRange.startDate}
                  onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                  className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
                <span className='text-gray-500'>to</span>
                <input
                  type='date'
                  value={customDateRange.endDate}
                  onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                  className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
              </div>
            )}

            <div className='flex items-center gap-2 flex-1'>
              <Search className='w-4 h-4 text-gray-500' />
              <input
                type='text'
                placeholder='Search by property address, submitter, or HOA...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              />
            </div>

            <button className='flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700'>
              <Download className='w-4 h-4' />
              Export
            </button>
          </div>
        </div>

        {/* Applications Table */}
        <div className='bg-white rounded-lg shadow-md border overflow-hidden applications-table'>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50 border-b'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Application
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Property Details
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider status-column'>
                    Status
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider forms-column'>
                    Forms Status
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Submitted
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider action-buttons'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {filteredApplications.map((app) => (
                  <tr key={app.id} className='hover:bg-gray-50'>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='flex items-center'>
                        <div>
                          <div className='text-sm font-medium text-gray-900'>
                            #{app.id}
                          </div>
                          <div className='text-sm text-gray-500'>
                            <User className='w-3 h-3 inline mr-1' />
                            {app.submitter_name}
                          </div>
                          <div className='text-xs text-gray-400 capitalize'>
                            {app.submitter_type}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className='px-6 py-4'>
                      <div className='text-sm font-medium text-gray-900'>
                        {app.property_address}
                      </div>
                      <div className='text-sm text-gray-500'>
                        <Building className='w-3 h-3 inline mr-1' />
                        {app.hoa_properties?.name}
                      </div>
                      <div className='text-xs text-gray-400'>
                        {app.buyer_name} ← {app.seller_name}
                      </div>
                      <div className='text-xs text-gray-400'>
                        <DollarSign className='w-3 h-3 inline mr-1' />$
                        {app.total_amount?.toFixed(2)}
                      </div>
                    </td>

                    <td className='px-6 py-4 whitespace-nowrap'>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}
                      >
                        {getStatusLabel(app.status)}
                      </span>
                      {app.property_owner_response_due &&
                        isOverdue(app.property_owner_response_due) && (
                          <div className='flex items-center gap-1 mt-1 text-red-600'>
                            <AlertTriangle className='w-3 h-3' />
                            <span className='text-xs'>Overdue</span>
                          </div>
                        )}
                    </td>

                    <td className='px-6 py-4'>
                      <div className='space-y-2'>
                        {(() => {
                          const inspectionForm = app.property_owner_forms?.find(form => form.form_type === 'inspection_form');
                          const resaleForm = app.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
                          const settlementForm = app.property_owner_forms?.find(form => form.form_type === 'settlement_form');
                          
                          const isSettlementApp = app.submitter_type === 'settlement' || app.application_type?.startsWith('settlement');
                          
                          if (isSettlementApp) {
                            // Settlement application - only show settlement form
                            return (
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-2 text-sm'>
                                  {getFormStatusIcon(settlementForm?.status || 'not_started')}
                                  <span className='text-gray-700'>
                                    Settlement Form
                                  </span>
                                </div>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    settlementForm?.status === 'completed'
                                      ? 'bg-green-100 text-green-800'
                                      : settlementForm?.status === 'in_progress'
                                        ? 'bg-blue-100 text-blue-800'
                                        : settlementForm?.status === 'not_started'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {getFormStatusText(settlementForm?.status || 'not_started')}
                                </span>
                              </div>
                            );
                          } else {
                            // Standard application - show both forms
                            return (
                              <>
                                <div className='flex items-center justify-between'>
                                  <div className='flex items-center gap-2 text-sm'>
                                    {getFormStatusIcon(inspectionForm?.status || 'not_started')}
                                    <span className='text-gray-700'>
                                      Inspection Form
                                    </span>
                                  </div>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      inspectionForm?.status === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : inspectionForm?.status === 'in_progress'
                                          ? 'bg-blue-100 text-blue-800'
                                          : inspectionForm?.status === 'not_started'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {getFormStatusText(inspectionForm?.status || 'not_started')}
                                  </span>
                                </div>
                                <div className='flex items-center justify-between'>
                                  <div className='flex items-center gap-2 text-sm'>
                                    {getFormStatusIcon(resaleForm?.status || 'not_started')}
                                    <span className='text-gray-700'>
                                      Resale Certificate
                                    </span>
                                  </div>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      resaleForm?.status === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : resaleForm?.status === 'in_progress'
                                          ? 'bg-blue-100 text-blue-800'
                                          : resaleForm?.status === 'not_started'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {getFormStatusText(resaleForm?.status || 'not_started')}
                                  </span>
                                </div>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </td>

                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                      {app.submitted_at ? (
                        <div className='flex items-center gap-1'>
                          <Calendar className='w-3 h-3 text-gray-400' />
                          <span>
                            {new Date(app.submitted_at).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <span className='text-gray-400'>Draft</span>
                      )}
                    </td>

                    <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                      {renderActionButtons(app)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredApplications.length === 0 && (
            <div className='text-center py-12'>
              <FileText className='w-12 h-12 text-gray-400 mx-auto mb-4' />
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                No applications found
              </h3>
              <p className='text-gray-500'>
                Try adjusting your filters or search terms
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className='bg-white px-6 py-4 rounded-lg shadow-md border mt-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <div className='flex items-center gap-2'>
                  <span className='text-sm text-gray-700'>Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className='px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span className='text-sm text-gray-700'>per page</span>
                </div>
                <div className='text-sm text-gray-700'>
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} results
                </div>
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
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 view-modal'>
            {renderApplicationModal()}
          </div>
        )}

        {/* Attachment Management Modal */}
        {showAttachmentModal && (
          <div className='fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-[70]'>
            {renderAttachmentModal()}
          </div>
        )}

        {/* Property Edit Modal */}
        {showPropertyEditModal && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[80]'>
            {renderPropertyEditModal()}
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
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
