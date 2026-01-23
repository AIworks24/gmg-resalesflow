import React, { useState, useEffect, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import useSWR from 'swr';

// Helper function to format property address with unit number
const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};
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
  FileCheck,
  Download,
  MessageSquare,
  CheckSquare,
  ChevronDown,
  Hash,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { mapFormDataToPDFFields } from '../../lib/pdfFieldMapper';
import { formatDate, formatDateTime, formatDateTimeFull } from '../../lib/timeUtils';
import { parseEmails } from '../../lib/emailUtils';
import AdminPropertyInspectionForm from './AdminPropertyInspectionForm';
import AdminResaleCertificateForm from './AdminResaleCertificateForm';
import AdminSettlementForm from './AdminSettlementForm';
import AdminLayout from './AdminLayout';
import useAdminAuthStore from '../../stores/adminAuthStore';

const AdminApplications = ({ userRole: userRoleProp }) => {
  // Get userRole from store if not provided as prop
  const { role: userRoleFromStore } = useAdminAuthStore();
  const userRole = userRoleProp || userRoleFromStore;
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Get parameters from URL query (for dashboard navigation)
  const urlStatus = router.query.status || 'all';
  const sortBy = router.query.sortBy || 'submitted_at';  // Default to submitted_at (booked/received date)
  const sortOrder = router.query.sortOrder || 'desc';

  // Initialize state from URL params
  const [selectedStatus, setSelectedStatus] = useState(urlStatus);
  const [selectedApplicationType, setSelectedApplicationType] = useState('all');
  const [selectedPackageType, setSelectedPackageType] = useState('all'); // 'all', 'standard', 'rush'
  const [urgencyFilter, setUrgencyFilter] = useState('all'); // 'all', 'overdue', 'near_deadline'
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
  const [simplePdfReady, setSimplePdfReady] = useState(false);
  const [editingPdf, setEditingPdf] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [processingReject, setProcessingReject] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedDetails, setEditedDetails] = useState({
    submitter_name: '',
    property_address: '',
    submitter_email: '',
    submitter_phone: '',
    buyer_name: '',
    buyer_email: [],
    seller_email: '',
    sale_price: '',
    closing_date: '',
  });
  const [savingDetails, setSavingDetails] = useState(false);

  // Sync selectedStatus with URL query parameter when it changes (for dashboard navigation)
  useEffect(() => {
    const statusFromUrl = router.query.status || 'all';
    if (statusFromUrl !== selectedStatus) {
      setSelectedStatus(statusFromUrl);
    }
  }, [router.query.status, router.isReady]);

  // Reset edit mode when selectedApplication changes
  useEffect(() => {
    if (selectedApplication) {
      setIsEditingDetails(false);
      setEditedDetails({
        submitter_name: '',
        property_address: '',
        submitter_email: '',
        buyer_name: '',
        buyer_email: [],
        seller_email: '',
        sale_price: '',
        closing_date: '',
      });
    }
  }, [selectedApplication?.id]);

  // Build dynamic API URL with sort and status parameters
  // Include status in API URL so server-side filtering happens
  const apiUrl = `/api/admin/applications?status=${selectedStatus}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

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

  // Fetch applications using SWR (will auto-refresh when URL or status changes)
  const { data: swrData, error: swrError, isLoading, mutate } = useSWR(
    apiUrl,
    fetcher,
    {
      refreshInterval: 0, // Disable auto-refresh (manual refresh only)
      revalidateOnFocus: false,
      dedupingInterval: 1000, // Reduced from 5s to 1s for faster real-time updates
    }
  );

  // Force refresh with cache bypass (for real-time updates)
  // This ensures workflow steps update correctly after task completion
  // Defined after mutate is available from useSWR
  const forceRefreshWithBypass = async () => {
    const bypassUrl = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}bypassCache=true`;
    try {
      const freshData = await fetcher(bypassUrl);
      mutate(freshData, { revalidate: false }); // Update cache with fresh data
    } catch (error) {
      console.warn('Failed to force refresh with bypass:', error);
    }
  };

  // Set up real-time subscription for applications table
  useEffect(() => {
    if (!supabase) {
      console.warn('Supabase client not available for real-time subscription');
      return;
    }

    console.log('🔄 Setting up real-time subscription for applications...');

    // Create a channel for real-time updates
    const channel = supabase
      .channel('applications-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
          console.log('📡 Real-time event received:', payload.eventType, payload.new?.id || payload.old?.id);
          
          // For INSERT events, refresh immediately to show new application
          if (payload.eventType === 'INSERT') {
            const newApp = payload.new;
            // Skip if it's a draft (we filter those out)
            if (newApp.status === 'draft' || newApp.status === 'pending_payment') {
              return;
            }
            
            // Immediately refresh with cache bypass to get complete application data
            forceRefreshWithBypass().catch(err => 
              console.warn('Failed to refresh applications list after realtime insert:', err)
            );
          }
          // For UPDATE events, refresh immediately with cache bypass
          else if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new?.status;
            const oldStatus = payload.old?.status;
            
            // Skip draft-only updates
            if (newStatus === 'draft' && oldStatus === 'draft') {
              return;
            }
            
            // For any meaningful update (not draft), immediately refresh with cache bypass
            // This ensures we get the complete data with all relations (forms, notifications, etc.)
            // which is necessary to correctly display workflow steps and statuses
            if (newStatus !== 'draft') {
              forceRefreshWithBypass().catch(err => 
                console.warn('Failed to refresh applications list after realtime update:', err)
              );
            }
          }
          // For DELETE events, refresh immediately
          else if (payload.eventType === 'DELETE') {
            // Immediately refresh to remove deleted application
            forceRefreshWithBypass().catch(err => 
              console.warn('Failed to refresh applications list after realtime delete:', err)
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for applications');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for applications');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Real-time subscription timed out for applications');
        } else if (status === 'CLOSED') {
          console.log('🔌 Real-time subscription closed for applications');
        } else {
          console.log('📊 Real-time subscription status:', status);
        }
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('🧹 Cleaning up real-time subscription for applications');
      supabase.removeChannel(channel);
    };
  }, [supabase, mutate]); // Removed swrData from dependencies to avoid recreating subscription

  // Snackbar helper function
  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: '', type: 'success' });
    }, 4000); // Hide after 4 seconds
  };

  // Handle reject application
  const handleReject = async () => {
    if (!selectedApplication) return;

    if (!rejectComments.trim()) {
      showSnackbar('Please provide a reason for rejection', 'error');
      return;
    }

    setProcessingReject(true);
    try {
      const response = await fetch('/api/admin/cancel-application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: selectedApplication.id,
          action: 'reject',
          comments: rejectComments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject application');
      }

      showSnackbar('Application rejected successfully. Email sent to requestor.', 'success');
      
      // Update selectedApplication state immediately
      const updatedNotes = (selectedApplication.notes || '') + `\n\n--- Rejected on ${new Date().toLocaleString()} ---\n${rejectComments}`;
      setSelectedApplication({
        ...selectedApplication,
        status: 'rejected',
        notes: updatedNotes,
        rejected_at: new Date().toISOString()
      });
      
      // Optimistically update the application in the list
      mutate(
        (currentData) => {
          if (!currentData?.data) return currentData;
          return {
            ...currentData,
            data: currentData.data.map(app => 
              app.id === selectedApplication.id 
                ? { ...app, status: 'rejected', notes: updatedNotes, rejected_at: new Date().toISOString() }
                : app
            ),
          };
        },
        { revalidate: false }
      );
      
      // Close reject modal and reset state
      setShowRejectModal(false);
      setRejectComments('');
      
      // Force refresh with cache bypass to get fresh data from database
      await forceRefreshWithBypass();
      
      // Refresh the selected application to ensure we have the latest data
      if (selectedApplication.id) {
        try {
          await refreshSelectedApplication(selectedApplication.id);
        } catch (refreshError) {
          console.warn('Failed to refresh selected application after rejection:', refreshError);
        }
      }
      
    } catch (error) {
      console.error('Error rejecting application:', error);
      showSnackbar(error.message || 'Failed to process request. Please try again.', 'error');
    } finally {
      setProcessingReject(false);
    }
  };

  // Handle starting edit mode for application details
  const handleStartEditDetails = () => {
    if (!selectedApplication) return;
    
    const buyerEmails = parseEmails(selectedApplication.buyer_email || '');
    
    // Format closing_date from date string to YYYY-MM-DD format for input
    let closingDateFormatted = '';
    if (selectedApplication.closing_date) {
      const date = new Date(selectedApplication.closing_date);
      if (!isNaN(date.getTime())) {
        closingDateFormatted = date.toISOString().split('T')[0];
      }
    }
    
    setEditedDetails({
      submitter_name: selectedApplication.submitter_name || '',
      property_address: selectedApplication.property_address || '',
      submitter_email: selectedApplication.submitter_email || '',
      submitter_phone: selectedApplication.submitter_phone || '',
      buyer_name: selectedApplication.buyer_name || '',
      buyer_email: buyerEmails.length > 0 ? buyerEmails : [''],
      seller_email: selectedApplication.seller_email || '',
      sale_price: selectedApplication.sale_price ? selectedApplication.sale_price.toString() : '',
      closing_date: closingDateFormatted,
    });
    setIsEditingDetails(true);
  };

  // Handle canceling edit mode
  const handleCancelEditDetails = () => {
    setIsEditingDetails(false);
    setEditedDetails({
      submitter_name: '',
      property_address: '',
      submitter_email: '',
      submitter_phone: '',
      buyer_name: '',
      buyer_email: [],
      seller_email: '',
      sale_price: '',
      closing_date: '',
    });
  };

  // Handle saving application details
  const handleSaveDetails = async () => {
    if (!selectedApplication) return;

    setSavingDetails(true);
    try {
      const response = await fetch('/api/admin/update-application-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: selectedApplication.id,
          submitter_name: editedDetails.submitter_name,
          property_address: editedDetails.property_address,
          submitter_email: editedDetails.submitter_email,
          submitter_phone: editedDetails.submitter_phone,
          buyer_name: editedDetails.buyer_name,
          buyer_email: editedDetails.buyer_email.filter(e => e.trim()),
          seller_email: editedDetails.seller_email,
          sale_price: editedDetails.sale_price || null,
          closing_date: editedDetails.closing_date || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update application details');
      }

      showSnackbar('Application details updated successfully', 'success');
      
      // Update selectedApplication state immediately
      const buyerEmailStr = editedDetails.buyer_email.filter(e => e.trim()).join(',');
      const salePriceNum = editedDetails.sale_price ? parseFloat(editedDetails.sale_price) : null;
      setSelectedApplication({
        ...selectedApplication,
        submitter_name: editedDetails.submitter_name,
        property_address: editedDetails.property_address,
        submitter_email: editedDetails.submitter_email,
        submitter_phone: editedDetails.submitter_phone,
        buyer_name: editedDetails.buyer_name,
        buyer_email: buyerEmailStr,
        seller_email: editedDetails.seller_email,
        sale_price: salePriceNum,
        closing_date: editedDetails.closing_date || null,
      });
      
      // Optimistically update the application in the list
      mutate(
        (currentData) => {
          if (!currentData?.data) return currentData;
          return {
            ...currentData,
            data: currentData.data.map(app => 
              app.id === selectedApplication.id 
                ? { 
                    ...app, 
                    submitter_name: editedDetails.submitter_name,
                    property_address: editedDetails.property_address,
                    submitter_email: editedDetails.submitter_email,
                    submitter_phone: editedDetails.submitter_phone,
                    buyer_name: editedDetails.buyer_name,
                    buyer_email: buyerEmailStr,
                    seller_email: editedDetails.seller_email,
                    sale_price: salePriceNum,
                    closing_date: editedDetails.closing_date || null,
                  }
                : app
            ),
          };
        },
        { revalidate: false }
      );
      
      setIsEditingDetails(false);
      
      // Force refresh with cache bypass to get fresh data from database
      await forceRefreshWithBypass();
      
      // Refresh the selected application to ensure we have the latest data
      if (selectedApplication.id) {
        try {
          await refreshSelectedApplication(selectedApplication.id);
        } catch (refreshError) {
          console.warn('Failed to refresh selected application after update:', refreshError);
        }
      }
      
    } catch (error) {
      console.error('Error updating application details:', error);
      showSnackbar(error.message || 'Failed to update application details', 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  // Handle adding a new email to buyer_email array
  const handleAddBuyerEmail = () => {
    setEditedDetails({
      ...editedDetails,
      buyer_email: [...editedDetails.buyer_email, ''],
    });
  };

  // Handle removing an email from buyer_email array
  const handleRemoveBuyerEmail = (index) => {
    if (editedDetails.buyer_email.length <= 1) {
      // Keep at least one empty field
      setEditedDetails({
        ...editedDetails,
        buyer_email: [''],
      });
    } else {
      setEditedDetails({
        ...editedDetails,
        buyer_email: editedDetails.buyer_email.filter((_, i) => i !== index),
      });
    }
  };

  // Handle updating buyer email at specific index
  const handleUpdateBuyerEmail = (index, value) => {
    const newBuyerEmails = [...editedDetails.buyer_email];
    newBuyerEmails[index] = value;
    setEditedDetails({
      ...editedDetails,
      buyer_email: newBuyerEmails,
    });
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

  // Helper function to calculate calendar days deadline (including weekends)
  const calculateCalendarDaysDeadline = (startDate, calendarDays) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + calendarDays);
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
    const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
    const hasEmailCompletedAt = !!application.email_completed_at;
    if (hasNotificationSent || hasEmailCompletedAt) {
      return false;
    }

    // Skip applications that haven't been submitted
    if (!application.submitted_at) {
      return false;
    }

    // Calculate deadline based on package type
    // Rush: 5 business days, Standard: 15 calendar days (including weekends)
    const submittedDate = new Date(application.submitted_at);
    let deadline;
    if (application.package_type === 'rush') {
      deadline = calculateBusinessDaysDeadline(submittedDate, 5);
    } else {
      deadline = calculateCalendarDaysDeadline(submittedDate, 15);
    }

    const now = new Date();
    const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

    // Urgent if overdue (at/past deadline) or within 48 hours (2 days) of deadline
    return hoursUntilDeadline < 48;
  };

  const getMultiCommunityWorkflowStep = (application) => {
    const propertyGroups = application.application_property_groups || [];
    
    if (propertyGroups.length === 0) {
      return { step: 1, text: 'Forms Required', color: 'bg-yellow-100 text-yellow-800' };
    }

    // Check if this is a settlement application
    const isSettlementApp = application.submitter_type === 'settlement' || 
                            application.application_type?.startsWith('settlement');

    // Track progress for each property group
    let totalProperties = propertyGroups.length;
    let completedProperties = 0;
    let formsInProgress = 0;
    let pdfsGenerated = 0;
    let emailsSent = 0;

    propertyGroups.forEach((group, index) => {
      let formsCompleted = false;
      
      if (isSettlementApp) {
        // Settlement application: only needs settlement form
        const settlementForm = application.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && form.property_group_id === group.id
        );
        const settlementFormStatus = settlementForm?.status || 'not_started';
        formsCompleted = settlementFormStatus === 'completed';
        
        // Check if form is in progress
        if (settlementFormStatus === 'in_progress') {
          formsInProgress++;
        }
      } else {
        // Standard application: needs both inspection and resale forms
        // Use property-group-specific inspection status only (no fallback to application-level)
        const inspectionStatus = group.inspection_status ?? 'not_started';
        const resaleStatus = group.status === 'completed';
        formsCompleted = inspectionStatus === 'completed' && resaleStatus;
        
        // Check if forms are in progress
        if (group.status === 'in_progress' || inspectionStatus === 'in_progress') {
          formsInProgress++;
        }
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

  // Helper function to extract rejection reason from notes
  const getRejectionReason = (application) => {
    if (application.status !== 'rejected' || !application.notes) {
      return null;
    }
    
    // Look for rejection reason in notes
    // Format: "--- Rejected on {timestamp} ---\n{reason}"
    const notes = application.notes;
    const rejectedMatch = notes.match(/---\s*Rejected\s+on\s+[^-]+---\s*\n([\s\S]*?)(?=\n\n---|$)/i);
    if (rejectedMatch && rejectedMatch[1]) {
      return rejectedMatch[1].trim();
    }
    
    return null;
  };

  const getWorkflowStep = (application) => {
    // Check for rejected status first
    if (application.status === 'rejected') {
      return { 
        step: 0, 
        text: 'Rejected', 
        color: 'bg-red-50 text-red-700 border border-red-100 ring-1 ring-red-200/50',
        icon: <XCircle className="w-3 h-3" />
      };
    }
    
    // Check if this is a lender questionnaire application
    const isLenderQuestionnaire = application.application_type === 'lender_questionnaire';
    
    if (isLenderQuestionnaire) {
      // Lender questionnaire workflow - 3 steps (Download + Upload + Email)
      const hasOriginalFile = !!application.lender_questionnaire_file_path;
      const hasCompletedFile = !!application.lender_questionnaire_completed_file_path;
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = application.email_completed_at;
      
      if (!hasOriginalFile) {
        return { step: 1, text: 'Awaiting Upload', color: 'bg-yellow-100 text-yellow-800' };
      }
      
      if (!hasCompletedFile) {
        return { step: 2, text: 'Upload Completed Form', color: 'bg-orange-100 text-orange-800' };
      }
      
      if (!hasNotificationSent && !hasEmailCompletedAt) {
        return { step: 3, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
      }
      
      return { step: 4, text: 'Completed', color: 'bg-green-100 text-green-800' };
    }
    
    // Check if this is a multi-community application FIRST (before settlement check)
    // This ensures settlement multi-community apps use the multi-community workflow
    const isMultiCommunity = application.hoa_properties?.is_multi_community && 
                            application.application_property_groups && 
                            application.application_property_groups.length > 1;

    if (isMultiCommunity) {
      return getMultiCommunityWorkflowStep(application);
    }
    
    // Check if this is a settlement application (single property only at this point)
    const isSettlementApp = application.submitter_type === 'settlement' || 
                            application.application_type?.startsWith('settlement');

    if (isSettlementApp) {
      // Settlement workflow - 3 tasks (Form + PDF + Email)
      // Check both form status AND completion timestamps (tasks can be completed via /api/complete-task)
      const settlementForm = application.property_owner_forms?.find(form => form.form_type === 'settlement_form');
      const settlementFormStatus = settlementForm?.status || 'not_started';
      const settlementFormCompleted = !!application.settlement_form_completed_at || settlementFormStatus === 'completed';
      const hasPDF = !!application.pdf_url || !!application.pdf_completed_at;
      const hasEmailSent = application.notifications?.some(n => n.notification_type === 'application_approved') || !!application.email_completed_at;

      // Step 1: Form Required - if form not completed
      if (!settlementFormCompleted && (settlementFormStatus === 'not_started' || settlementFormStatus === 'not_created')) {
        return { step: 1, text: 'Form Required', color: 'bg-yellow-100 text-yellow-800' };
      }
      
      // Step 2: Generate PDF - if form completed but no PDF
      if (settlementFormCompleted && !hasPDF) {
        return { step: 2, text: 'Generate PDF', color: 'bg-orange-100 text-orange-800' };
      }
      
      // Step 3: Send Email - if PDF generated but email not sent
      if (hasPDF && !hasEmailSent) {
        return { step: 3, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
      }
      
      // Step 4: Completed - all tasks done
      if (settlementFormCompleted && hasPDF && hasEmailSent) {
        return { step: 4, text: 'Completed', color: 'bg-green-100 text-green-800' };
      }
      
      // Fallback: if form is in progress but not completed
      if (settlementFormStatus === 'in_progress') {
        return { step: 1, text: 'Form In Progress', color: 'bg-blue-100 text-blue-800' };
      }
      
      // Default fallback
      return { step: 1, text: 'Form Required', color: 'bg-yellow-100 text-yellow-800' };
    }

    // Standard single property workflow
    const inspectionForm = application.property_owner_forms?.find(form => form.form_type === 'inspection_form');
    const resaleForm = application.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
    const inspectionStatus = inspectionForm?.status || 'not_started';
    const resaleStatus = resaleForm?.status || 'not_started';
    const hasPDF = application.pdf_url;
    const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
    const hasEmailCompletedAt = !!application.email_completed_at;
    const hasEmailSent = hasNotificationSent || hasEmailCompletedAt;

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
    
    if (!hasEmailSent) {
      return { step: 4, text: 'Send Email', color: 'bg-purple-100 text-purple-800' };
    }
    
    return { step: 5, text: 'Completed', color: 'bg-green-100 text-green-800' };
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

    // Load staff members for assignment dropdown (includes admin, staff, and accounting)
    const loadStaffMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('email, first_name, last_name, role')
          .in('role', ['admin', 'staff', 'accounting'])
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

  // Handle applicationId query parameter to open modal
  useEffect(() => {
    const applicationId = router.query.applicationId;
    
    // Only proceed if we have an applicationId and router is ready
    if (!router.isReady || !applicationId) return;
    
    // Don't open if modal is already open for this application
    if (selectedApplication && selectedApplication.id === parseInt(applicationId)) {
      return;
    }
    
    // Wait for applications data to load
    if (!swrData?.data) return;
    
    // Find the application in the list
    const application = swrData.data.find(app => app.id === parseInt(applicationId));
    
    if (application) {
      handleApplicationClick(application);
    } else {
      console.warn('Application not found in list:', applicationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.applicationId, router.isReady, swrData?.data]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, customDateRange, assignedToMe, selectedStatus, selectedApplicationType, selectedPackageType, urgencyFilter, searchTerm]);

  // Load SimplePDF script
  useEffect(() => {
    // Check if SimplePDF is already loaded
    if (window.simplePDF) {
      setSimplePdfReady(true);
      return;
    }

    // Load SimplePDF script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@simplepdf/web-embed-pdf';
    script.defer = true;
    script.onload = () => {
      // Wait for simplePDF to be available
      const checkSimplePDF = setInterval(() => {
        if (window.simplePDF) {
          setSimplePdfReady(true);
          clearInterval(checkSimplePDF);
        }
      }, 100);
      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkSimplePDF), 5000);
    };
    script.onerror = () => {
      console.error('Failed to load SimplePDF script');
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove script if component unmounts (optional)
      // Note: We don't remove it to keep it available for other components
    };
  }, []);


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

    // All admin, staff, and accounting users can see all applications
    // (No role-based filtering - accounting users now have full visibility)

    // Apply date filter
    const dateRange = getDateRange();
    if (dateRange) {
      filtered = filtered.filter(app => {
        const createdAt = new Date(app.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
    }

    // Apply status filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'payment_confirmed') {
        // Not Started = step 1
        filtered = filtered.filter(app => {
          const workflowStep = getWorkflowStep(app);
          return workflowStep.step === 1;
        });
      } else if (selectedStatus === 'ongoing') {
        // Ongoing = in progress but not completed
        // Different application types have different step counts, so we check the text to exclude completed
        filtered = filtered.filter(app => {
          const workflowStep = getWorkflowStep(app);
          // Exclude completed applications by checking the text
          if (workflowStep.text === 'Completed') {
            return false;
          }
          // Include steps 2, 3, or 4 that are not completed
          return workflowStep.step === 2 || workflowStep.step === 3 || workflowStep.step === 4;
        });
      } else if (selectedStatus === 'approved') {
        // Completed = check by text since different app types have different step counts
        // Settlement apps: step 4 = Completed, Standard apps: step 5 = Completed, Lender: step 4 = Completed
        filtered = filtered.filter(app => {
          const workflowStep = getWorkflowStep(app);
          return workflowStep.text === 'Completed';
        });
      } else if (selectedStatus === 'pending') {
        // Pending = all non-completed applications (use workflow step to handle all app types correctly)
        filtered = filtered.filter(app => {
          const workflowStep = getWorkflowStep(app);
          return workflowStep.text !== 'Completed';
        });
      } else if (selectedStatus === 'urgent') {
        // Urgent = applications that are overdue (at/past deadline) or near deadline (within 48 hours)
        const now = new Date();
        filtered = filtered.filter(app => {
          // Skip completed applications (use workflow step to handle all app types correctly)
          const workflowStep = getWorkflowStep(app);
          if (workflowStep.text === 'Completed') {
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
      } else if (selectedStatus === 'completed') {
        // Completed = check by workflow step text to handle all app types correctly
        // This ensures multi-community settlement apps are only marked completed when ALL properties are done
        filtered = filtered.filter(app => {
          const workflowStep = getWorkflowStep(app);
          return workflowStep.text === 'Completed';
        });
      } else {
        filtered = filtered.filter(app => app.status === selectedStatus);
      }
    }

    // Apply application type filter (without package type)
    if (selectedApplicationType !== 'all') {
      filtered = filtered.filter(app => {
        const appType = app.application_type || 'single_property';
        const isMultiCommunity = app.hoa_properties?.is_multi_community;
        
        // Handle Builder/Developer filter (filter by submitter_type)
        if (selectedApplicationType === 'builder') {
          return app.submitter_type === 'builder';
        }
        
        // Handle MC Settlement filters
        if (selectedApplicationType === 'mc_settlement_va') {
          return appType === 'settlement_va' && isMultiCommunity;
        }
        if (selectedApplicationType === 'mc_settlement_nc') {
          return appType === 'settlement_nc' && isMultiCommunity;
        }
        
        // Handle regular application types
        if (appType === selectedApplicationType) {
          // If it's a settlement type on multi-community, skip it (handled by MC Settlement filters)
          if ((appType === 'settlement_va' || appType === 'settlement_nc') && isMultiCommunity) {
            return false;
          }
          return true;
        }
        
        return false;
      });
    }

    // Apply package type filter separately
    if (selectedPackageType !== 'all') {
      filtered = filtered.filter(app => {
        const isRush = app.package_type === 'rush';
        if (selectedPackageType === 'rush') {
          return isRush;
        } else if (selectedPackageType === 'standard') {
          return !isRush;
        }
        return true;
      });
    }

    // Apply urgency filter (overdue/near deadline)
    if (urgencyFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(app => {
        // Skip completed applications
        const workflowStep = getWorkflowStep(app);
        if (workflowStep.text === 'Completed') {
          return false;
        }

        // Calculate deadline based on package type
        const submittedDate = new Date(app.submitted_at || app.created_at);
        let deadline;
        if (app.package_type === 'rush') {
          deadline = calculateBusinessDaysDeadline(submittedDate, 5);
        } else {
          deadline = calculateCalendarDaysDeadline(submittedDate, 15);
        }

        const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

        if (urgencyFilter === 'overdue') {
          // Show only overdue applications (at or past deadline)
          return hoursUntilDeadline <= 0;
        } else if (urgencyFilter === 'near_deadline') {
          // Show only near deadline applications (within 48 hours but not overdue)
          return hoursUntilDeadline > 0 && hoursUntilDeadline < 48;
        }
        return false;
      });
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const searchNum = searchTerm.trim();
      filtered = filtered.filter(app =>
        app.property_address?.toLowerCase().includes(searchLower) ||
        app.submitter_name?.toLowerCase().includes(searchLower) ||
        app.hoa_properties?.name?.toLowerCase().includes(searchLower) ||
        app.id?.toString().includes(searchNum)
      );
    }

    // Apply assigned to me filter
    if (assignedToMe && userEmail) {
      filtered = filtered.filter(app => {
        // Normalize user email for comparison (remove "owner." prefix if present)
        const normalizedUserEmail = userEmail.replace(/^owner\./, '').toLowerCase();
        
        // 1. Check if directly assigned (case-insensitive)
        if (app.assigned_to && app.assigned_to.toLowerCase() === userEmail.toLowerCase()) {
          return true;
        }
        
        // 2. Check if user is a property owner of the primary property (for ALL properties)
          if (app.hoa_properties?.property_owner_email) {
            const primaryOwnerEmails = parseEmails(app.hoa_properties.property_owner_email)
              .map(e => e.replace(/^owner\./, '').toLowerCase());
            
            if (primaryOwnerEmails.includes(normalizedUserEmail)) {
              return true;
            }
          }
          
        // 3. For multi-community properties, also check property groups
        if (app.hoa_properties?.is_multi_community && app.application_property_groups) {
          // Check all property groups for owner email match
          const isOwnerInAnyGroup = app.application_property_groups.some(group => {
            // Check property_owner_email from the group
            if (group.property_owner_email) {
              const groupOwnerEmails = parseEmails(group.property_owner_email)
                .map(e => e.replace(/^owner\./, '').toLowerCase());
              
              if (groupOwnerEmails.includes(normalizedUserEmail)) {
                return true;
              }
            }
            
            // Also check nested hoa_properties if available
            if (group.hoa_properties?.property_owner_email) {
              const nestedOwnerEmails = parseEmails(group.hoa_properties.property_owner_email)
                .map(e => e.replace(/^owner\./, '').toLowerCase());
              
              if (nestedOwnerEmails.includes(normalizedUserEmail)) {
                return true;
              }
            }
            
            return false;
          });
          
          if (isOwnerInAnyGroup) {
            return true;
          }
        }
        
        return false;
      });
    }

    const count = filtered.length;

    // Apply pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

    return { applications: paginated, totalCount: count };
  }, [swrData, dateFilter, customDateRange, selectedStatus, selectedApplicationType, selectedPackageType, urgencyFilter, searchTerm, assignedToMe, userEmail, currentPage, itemsPerPage, userRole]);

  // Check if application was created before auto-assignment feature was implemented
  // Auto-assignment was implemented on 2025-01-15
  // Show button only for applications created before this feature
  const isLegacyApplication = (application) => {
    if (!application.created_at) return false;
    
    // Auto-assignment feature implementation date
    // Applications created before this date should show the manual button
    const autoAssignFeatureDate = new Date('2025-01-15T00:00:00Z');
    const appCreatedDate = new Date(application.created_at);
    
    return appCreatedDate < autoAssignFeatureDate;
  };

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
      console.error('Error assigning application:', error);
      showSnackbar('Failed to assign application', 'error');
    } finally {
      setAssigningApplication(null);
    }
  };

  const handleAutoAssignApplication = async (applicationId) => {
    setAssigningApplication(applicationId);
    try {
      const response = await fetch('/api/auto-assign-application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showSnackbar(`Application auto-assigned to property owner`, 'success');
        await mutate(); // Refresh the applications list
        
        // Refresh the selected application if it's open in the modal
        if (selectedApplication && selectedApplication.id === applicationId) {
          await refreshSelectedApplication(applicationId);
        }
      } else {
        const errorMsg = result.error || 'Failed to auto-assign application';
        showSnackbar(errorMsg, 'error');
        console.error('Auto-assignment error:', errorMsg);
      }
    } catch (error) {
      console.error('Error auto-assigning application:', error);
      showSnackbar('Failed to auto-assign application', 'error');
    } finally {
      setAssigningApplication(null);
    }
  };

  const handleCompleteTask = async (applicationId, taskName, group = null) => {
    try {
      const response = await fetch('/api/complete-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          applicationId, 
          taskName,
          propertyGroupId: group?.id || null // Include property_group_id for settlement forms
        }),
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

  const getTaskStatuses = (application, group = null) => {
    const isLenderQuestionnaire = application.application_type === 'lender_questionnaire';
    
    if (isLenderQuestionnaire) {
      // Lender questionnaire workflow - 3 steps (Download + Upload/Edit + Email)
      const hasOriginalFile = !!application.lender_questionnaire_file_path;
      const hasDownloaded = !!application.lender_questionnaire_downloaded_at;
      const hasCompletedFile = !!application.lender_questionnaire_completed_file_path;
      const hasEditedFile = !!application.lender_questionnaire_edited_file_path;
      const hasCompletedOrEdited = hasCompletedFile || hasEditedFile;
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = application.email_completed_at;
      
      return {
        download: hasDownloaded ? 'completed' : (hasOriginalFile ? 'not_started' : 'not_started'),
        upload: hasCompletedOrEdited ? 'completed' : (hasDownloaded ? 'not_started' : 'not_started'),
        email: (hasNotificationSent || hasEmailCompletedAt) ? 'completed' : (hasCompletedOrEdited ? 'not_started' : 'not_started')
      };
    }
    
    const isSettlementApp = application.submitter_type === 'settlement' || 
                           application.application_type?.startsWith('settlement');
    
    if (isSettlementApp) {
      // Settlement application - for multi-community, check forms per property group
      let settlementForm;
      if (group?.id) {
        // Multi-community: find settlement form for this specific property group
        settlementForm = application.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && form.property_group_id === group.id
        );
      } else {
        // Single property: find settlement form at application level
        settlementForm = application.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && !form.property_group_id
        );
      }
      
      // Check settlement form status - use settlement_form_completed_at if available, otherwise check form status
      let settlementFormStatus = 'not_started';
      if (settlementForm?.status === 'completed') {
        settlementFormStatus = 'completed';
      } else if (settlementForm?.status === 'in_progress') {
        settlementFormStatus = 'in_progress';
      } else if (!group?.id && application.settlement_form_completed_at) {
        // For single property, also check application-level completion
        settlementFormStatus = 'completed';
      }
      
      const hasNotificationSent = application.notifications?.some(n => n.notification_type === 'application_approved');
      const hasEmailCompletedAt = application.email_completed_at;

      // Derive PDF status - check property group first, then fallback to application level
      let pdfStatus = 'not_started';
      if (group?.pdf_url || group?.pdf_status === 'completed') {
        // Property group has its own PDF
        pdfStatus = group.pdf_status || 'completed';
        // Check if form was updated after PDF generation
        if (settlementForm?.updated_at && group.pdf_completed_at) {
          const pdfGeneratedAt = new Date(group.pdf_completed_at);
          const formUpdatedAt = new Date(settlementForm.updated_at);
          if (formUpdatedAt > pdfGeneratedAt) {
            pdfStatus = 'update_needed';
          }
        }
      } else if (application.pdf_url && application.pdf_generated_at && !group?.id) {
        // Single property: use application-level PDF
        const pdfGeneratedAt = new Date(application.pdf_generated_at || 0);
        if (settlementForm?.updated_at) {
          const formUpdatedAt = new Date(settlementForm.updated_at || 0);
          if (formUpdatedAt > pdfGeneratedAt) {
            pdfStatus = 'update_needed';
          } else {
            pdfStatus = 'completed';
          }
        } else {
          pdfStatus = 'completed';
        }
      }

      // Derive email status - check property group first, then fallback to application level
      let emailStatus = 'not_started';
      if (group?.email_status === 'completed' || group?.email_completed_at) {
        emailStatus = 'completed';
      } else if (!group?.id && (hasNotificationSent || hasEmailCompletedAt)) {
        // Single property: use application-level email status
        emailStatus = 'completed';
      }

      return {
        settlement: settlementFormStatus,
        pdf: pdfStatus,
        email: emailStatus
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

  const TaskCard = ({ step, icon, title, description, status, children, completedAt }) => (
    <div className={`border rounded-xl p-4 sm:p-5 bg-white shadow-sm transition-all ${getTaskStatusColor(status)}`}>
       <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
             <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 ${
               status === 'completed' ? 'bg-green-50 border-green-500 text-green-600' : 'bg-gray-50 border-gray-300 text-gray-500'
             }`}>
               <span className='text-sm font-bold'>{step}</span>
             </div>
             <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                   <h4 className='font-semibold text-gray-900 text-sm sm:text-base'>{title}</h4>
                   {icon}
                </div>
                {description && <p className='text-sm text-gray-500 mt-1'>{description}</p>}
                {completedAt && (
                   <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded inline-block">
                      Completed: {formatDateTimeFull(completedAt)}
                   </div>
                )}
             </div>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto lg:flex-shrink-0">
             {children}
          </div>
       </div>
    </div>
  );

  // Helper function to close modal and clean up URL
  const handleCloseModal = () => {
    setSelectedApplication(null);
    // Remove applicationId from URL query parameters
    const { applicationId, ...restQuery } = router.query;
    if (applicationId) {
      router.replace({
        pathname: router.pathname,
        query: restQuery,
      }, undefined, { shallow: true });
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
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
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
            form_data,
            property_id
          )
        `)
        .eq('id', application.id)
        .is('deleted_at', null) // Only get non-deleted applications
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

      if (appError) {
        console.error('❌ Error loading application:', appError);
        throw appError;
      }

      if (!appData) {
        console.error('❌ No application data found for ID:', application.id);
        throw new Error('Application not found or has been deleted');
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
        // Open settlement form modal with property group context
        setShowSettlementFormModal(true);
        setSelectedApplicationForSettlement({
          ...selectedApplication,
          propertyGroupId: group?.id || null
        });
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

  // Listen for application updates (e.g., settlement form completed) and refresh
  useEffect(() => {
    const handler = async (e) => {
      const updatedId = e.detail?.applicationId;
      try {
        // Force refresh with cache bypass to get immediate updates
        await forceRefreshWithBypass();
        
        // Also refresh the selected application if it's the one that was updated
        if (selectedApplication && selectedApplication.id === updatedId) {
          const { data: updatedApp } = await supabase
            .from('applications')
            .select(`
              *,
              hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
              property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
              notifications(id, notification_type, status, sent_at)
            `)
            .eq('id', updatedId)
            .is('deleted_at', null) // Only get non-deleted applications
            .maybeSingle();
          if (updatedApp) {
            setSelectedApplication(updatedApp);
          }
        }
      } catch (err) {
        console.error('Failed to refresh after application update:', err);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('application-updated', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('application-updated', handler);
      }
    };
  }, [selectedApplication, mutate, supabase, forceRefreshWithBypass]);

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
        .is('deleted_at', null) // Only get non-deleted applications
        .maybeSingle();

      if (appError) throw appError;
      
      if (!appData) {
        throw new Error('Application not found or has been deleted');
      }

      // If a property group is provided, override HOA context for the form UI
      const effectiveHoaName = group?.hoa_properties?.name || group?.property_name || appData.hoa_properties?.name;
      const effectiveHoaId = group?.property_id || appData.hoa_property_id;

      // Get or create the form
      // For inspection and settlement forms in multi-community apps, query by property_group_id if available
      let formTypeValue;
      if (formType === 'inspection') {
        formTypeValue = 'inspection_form';
      } else if (formType === 'resale') {
        formTypeValue = 'resale_certificate';
      } else if (formType === 'settlement') {
        formTypeValue = 'settlement_form';
      } else {
        throw new Error(`Unknown form type: ${formType}`);
      }
      
      let query = supabase
        .from('property_owner_forms')
        .select('id, form_data, response_data, status, property_group_id')
        .eq('application_id', applicationId)
        .eq('form_type', formTypeValue);
      
      // If this is an inspection, settlement, or resale form and we have a property group, filter by property_group_id
      // This ensures each property has its own form
      if ((formType === 'inspection' || formType === 'settlement' || formType === 'resale') && group?.id) {
        query = query.eq('property_group_id', group.id);
      }
      
      let { data: formData, error: formError } = await query.single();
      
      // Special handling: If we found a form without property_group_id in a multi-community context,
      // treat it as "not found" and create a new form for this property group
      if (formData && (formType === 'inspection' || formType === 'settlement' || formType === 'resale') && group?.id && !formData.property_group_id) {
        formError = { code: 'PGRST116' }; // Simulate "not found" to trigger form creation
        formData = null;
      }

      // If no form exists, create it
      if (formError && formError.code === 'PGRST116') {
        const formDataToInsert = {
          application_id: applicationId,
          form_type: formTypeValue,
          status: 'not_started',
          access_token: crypto.randomUUID(),
          recipient_email: appData.hoa_properties?.property_owner_email || appData.submitter_email || 'admin@gmgva.com',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString()
        };
        
        // For inspection, settlement, and resale forms in multi-community apps, associate with property group
        if ((formType === 'inspection' || formType === 'settlement' || formType === 'resale') && group?.id) {
          formDataToInsert.property_group_id = group.id;
        }
        
        const { data: newForm, error: createError } = await supabase
          .from('property_owner_forms')
          .insert([formDataToInsert])
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
      } else if (formType === 'resale') {
        setResaleFormData(combinedData);
      } else if (formType === 'settlement') {
        // For settlement forms, open the settlement form modal
        // Use the selectedApplication with the group context
        setShowSettlementFormModal(true);
        setSelectedApplicationForSettlement({
          ...combinedData,
          propertyGroupId: group?.id || null
        });
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
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
          notifications(id, notification_type, status, sent_at),
          application_property_groups(id, property_id, property_name, property_location, is_primary, status, inspection_status, inspection_completed_at,
            pdf_url, pdf_status, pdf_completed_at, email_status, email_completed_at,
            hoa_properties(id, name, location)
          )
        `)
        .eq('id', applicationId)
        .is('deleted_at', null) // Only get non-deleted applications
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
          // Per-property inspection completion - update the property group's inspection_status
          if (currentGroupId) {
            // Update the property group's inspection status
            const { error: groupUpdateError } = await supabase
              .from('application_property_groups')
              .update({
                inspection_status: 'completed',
                inspection_completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', currentGroupId);
            
            if (groupUpdateError) {
              console.error('Error updating property group inspection status:', groupUpdateError);
            } else {
            }
          }
          
          // Also update the form record
          if (currentFormId) {
            await supabase
              .from('property_owner_forms')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', currentFormId);
          }
          
          // For backwards compatibility, also update application-level if it's a single property app
          if (!currentGroupId) {
            await fetch('/api/complete-task', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ applicationId: selectedApplication.id, taskName: 'inspection_form' })
            });
          }
          
          try {
            // Refresh both the application and property groups to ensure UI updates
            await Promise.all([
              refreshSelectedApplication(selectedApplication.id),
              currentGroupId && loadPropertyGroups(selectedApplication.id)
            ]);
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
    setGeneratingPDF(true);
    
    let pdfGeneratedSuccessfully = false;
    let pdfUrl = null;
    let errorMessage = 'Failed to generate PDF. Please try again.';
    
    try {
      // Always fetch the latest form data from database to ensure we have the most recent saved data
      // This ensures that if the user clicked "Save Progress" before regenerating, we use that saved data
      console.log('[handleGeneratePDF] Fetching latest form data from database...');
      const { data: latestForms, error: formsError } = await supabase
        .from('property_owner_forms')
        .select('form_type, form_data, response_data')
        .eq('application_id', applicationId)
        .in('form_type', ['inspection_form', 'resale_certificate']);
      
      if (formsError) {
        console.warn('[handleGeneratePDF] Error fetching latest forms, using provided formData:', formsError);
      } else {
        // Use the latest data from database instead of potentially stale selectedApplication data
        const latestInspectionForm = latestForms?.find(f => f.form_type === 'inspection_form');
        const latestResaleForm = latestForms?.find(f => f.form_type === 'resale_certificate');
        
        if (latestInspectionForm || latestResaleForm) {
          formData = {
            inspectionForm: latestInspectionForm?.form_data || latestInspectionForm?.response_data || formData?.inspectionForm,
            resaleCertificate: latestResaleForm?.form_data || latestResaleForm?.response_data || formData?.resaleCertificate
          };
          console.log('[handleGeneratePDF] Using latest form data from database');
          console.log('[handleGeneratePDF] Resale certificate budgetAttached:', 
            formData.resaleCertificate?.disclosures?.operatingBudget?.budgetAttached);
        }
      }
      
      const response = await fetch('/api/regenerate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          applicationId,
        }),
      });
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Server error: ${response.status} ${response.statusText}` };
        }
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate PDF');
      }
      
      // Mark PDF as generated successfully
      pdfGeneratedSuccessfully = true;
      pdfUrl = result.pdfUrl;
      
    } catch (error) {
      console.error('❌ Failed to generate PDF:', error);
      errorMessage = error.message || 'Failed to generate PDF. Please try again.';
      showSnackbar(errorMessage, 'error');
      setGeneratingPDF(false);
      return; // Exit early on error
    }
    
    // Always clear the generating state first, regardless of what happened
    setGeneratingPDF(false);
    
    // If PDF was generated successfully, do the post-processing
    if (pdfGeneratedSuccessfully && pdfUrl) {
      try {
        // PRIMARY: Immediately update the selected application's PDF status
        // This ensures the UI updates instantly and consistently
        if (selectedApplication && selectedApplication.id === applicationId) {
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
        
        showSnackbar('PDF generated successfully!', 'success');
        
      } catch (postProcessingError) {
        console.warn('Post-processing failed, but PDF was generated successfully:', postProcessingError);
        showSnackbar('PDF generated successfully!', 'success');
      }
    } else {
      // This shouldn't happen, but just in case
      showSnackbar('PDF generation completed but URL is missing. Please try again.', 'error');
    }
  };

  const handleGenerateSettlementPDF = async (applicationId, group = null) => {
    try {
      setGeneratingPDF(true);

      // Get settlement form data - filter by property_group_id for multi-community
      let settlementForm;
      if (group?.id) {
        // Multi-community: find settlement form for this specific property group
        settlementForm = selectedApplication.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && form.property_group_id === group.id
        );
      } else {
        // Single property: find settlement form without property_group_id
        settlementForm = selectedApplication.property_owner_forms?.find(
          form => form.form_type === 'settlement_form' && !form.property_group_id
        );
      }

      if (!settlementForm) {
        showSnackbar('Settlement form not found', 'error');
        setGeneratingPDF(false);
        return;
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
          propertyGroupId: group?.id || null,
          timezone: userTimezone,
        }),
      });
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Server error: ${response.status} ${response.statusText}` };
        }
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate PDF');
      }
      
      // Clear loading state immediately after successful generation
      setGeneratingPDF(false);
      
      showSnackbar('PDF generated successfully!', 'success');
      
      // Refresh applications list and selected application in background (non-blocking)
      Promise.all([
        mutate().catch(err => console.warn('Failed to refresh applications list:', err)),
        selectedApplication && selectedApplication.id === applicationId
          ? refreshSelectedApplication(applicationId).catch(err => console.warn('Failed to refresh selected application:', err))
          : Promise.resolve()
      ]).then(() => {
        // Optionally dispatch event to trigger UI update
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('application-updated', { detail: { applicationId } }));
        }
      });
      
    } catch (error) {
      console.error('Failed to generate settlement PDF:', error);
      const errorMessage = error.message || 'Failed to generate PDF. Please try again.';
      showSnackbar(errorMessage, 'error');
      setGeneratingPDF(false);
    }
  };

  const handleSendApprovalEmail = async (applicationId, group = null) => {
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
          applicationId,
          propertyGroupId: group?.id || null // Pass property_group_id for multi-community
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send approval email');
      }

      // Mark email as sent successfully
      emailSentSuccessfully = true;
      
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
    setSendingEmail(false);
    
    // If email was sent successfully, do the post-processing
    if (emailSentSuccessfully) {
      try {
        // Clear temporary attachments after successful send
        setTemporaryAttachments([]);
        
        // PRIMARY: Immediately update the selected application's email status
        // This ensures the UI updates instantly and consistently
        if (selectedApplication && selectedApplication.id === applicationId) {
          setSelectedApplication(prev => ({
            ...prev,
            // Update email completion fields
            email_completed_at: new Date().toISOString(),
            status: 'approved',
            updated_at: new Date().toISOString(),
            // Notification creation removed - no longer needed
            notifications: prev.notifications || []
          }));
        }
        
        // SECONDARY: Try to refresh from database (optional, runs in background)
        try {
          await refreshSelectedApplication(applicationId);
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
      setPropertyFiles([]);
      return;
    }
    
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
      return;
    }

    setUploading(true);
    try {
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User not authenticated');
      }

      const propertyId = selectedApplication.hoa_property_id;
      
      const uploadPromises = selectedFilesForUpload.map(async (file, index) => {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `property_files/${propertyId}/${fileName}`;
        

        const { data, error } = await supabase.storage
          .from('bucket0')
          .upload(filePath, file);

        if (error) {
          console.error(`❌ Upload failed for ${file.name}:`, error);
          throw error;
        }
        
        return filePath;
      });

      await Promise.all(uploadPromises);

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
      const { data, error } = await supabase
        .from('application_property_groups')
        .select('id, property_id, property_name, property_location, is_primary, status, inspection_status, inspection_completed_at, pdf_status, pdf_url, email_status, form_data, hoa_properties(id, name, location)')
        .eq('application_id', applicationId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      
      // Sort property groups to ensure primary is always first
      const sortedGroups = (data || []).sort((a, b) => {
        // Primary property always comes first
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        // If both are primary or both are secondary, sort by name
        return (a.property_name || '').localeCompare(b.property_name || '');
      });
      
      setPropertyGroups(sortedGroups);
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
    // Allow PDF generation/regeneration at any time for flexibility
    // This allows admins to regenerate PDFs even after completion or after sending emails
    return true;
  };

  const canSendEmailForProperty = (group) => {
    // Email can be sent if PDF is generated for this property
    return group.pdf_status === 'completed' || group.pdf_url;
  };

  const handleGeneratePDFForProperty = async (applicationId, group) => {
    setGeneratingPDFForProperty(group.id); // Set specific property as generating
    
    try {
      // Always fetch the latest form data from database to ensure we have the most recent saved data
      // This ensures that if the user clicked "Save Progress" before regenerating, we use that saved data
      console.log('[handleGeneratePDFForProperty] Fetching latest form data from database...');
      
      // First try property-specific form data from group
      let formData = group.form_data;
      
      // If no property-specific form data, fetch the latest property-specific resale certificate form data from database
      if (!formData) {
        const { data: latestResaleForm, error: formError } = await supabase
          .from('property_owner_forms')
          .select('form_data, response_data')
          .eq('application_id', applicationId)
          .eq('form_type', 'resale_certificate')
          .eq('property_group_id', group.id)  // Filter by property group to get correct property's data
          .maybeSingle();
        
        if (!formError && latestResaleForm) {
          formData = latestResaleForm.form_data || latestResaleForm.response_data;
          console.log('[handleGeneratePDFForProperty] Using latest resale certificate form data from database');
          console.log('[handleGeneratePDFForProperty] BudgetAttached:', 
            formData?.disclosures?.operatingBudget?.budgetAttached);
        } else {
          // Fallback to selectedApplication data if database fetch fails
          const resaleForm = selectedApplication.property_owner_forms?.find(f => f.form_type === 'resale_certificate');
          formData = resaleForm?.form_data || resaleForm?.response_data;
          console.warn('[handleGeneratePDFForProperty] Using selectedApplication data (database fetch failed)');
        }
      } else {
        console.log('[handleGeneratePDFForProperty] Using property-specific form_data from group');
      }
      
      if (!formData) {
        throw new Error('No form data available for this property');
      }


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
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Server error: ${response.status} ${response.statusText}` };
        }
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate PDF');
      }
      
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
      const errorMessage = error.message || `Failed to generate PDF for ${group.property_name}. Please try again.`;
      showSnackbar(errorMessage, 'error');
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

      // Refresh the property groups to get updated status
      
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

  // Show initial loading state only on first load (not during real-time updates)
  // If we have data, don't show loading screen even if SWR is revalidating
  if (isLoading && !swrData) {
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
        <div className='mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              Applications
            </h1>
            <p className='text-sm text-gray-500 mt-1'>
              Monitor and manage all resale certificate applications
            </p>
          </div>
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className='inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm'
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Refreshing...' : 'Refresh List'}
          </button>
        </div>

        {/* Filters & Search Card */}
        <div className='bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden'>
          <div className='p-5 space-y-4'>
            {/* Search & Primary Filters */}
            <div className='flex flex-col lg:flex-row gap-4'>
              <div className='relative flex-1'>
                <Search className='w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
                <input
                  type='text'
                  placeholder='Search by property address, submitter name, HOA, or application number...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
                />
              </div>
              <div className='flex items-center gap-2'>
                <label className='flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors select-none'>
                  <input
                    type='checkbox'
                    checked={assignedToMe}
                    onChange={(e) => setAssignedToMe(e.target.checked)}
                    className='rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4'
                  />
                  <span className='text-sm font-medium text-gray-700'>Assigned to me</span>
                </label>
              </div>
            </div>

            {/* Secondary Filters Grid */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-100'>
            {/* Date Filter */}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                Time Period
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
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
                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Start Date
                  </label>
                  <input
                    type='date'
                    value={customDateRange.startDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                    className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  />
                </div>
                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    End Date
                  </label>
                  <input
                    type='date'
                    value={customDateRange.endDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                    className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  />
                </div>
              </>
            )}

            {/* Workflow Step Filter */}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
              >
                <option value='all'>All Steps</option>
                <option value='payment_confirmed'>Not Started</option>
                <option value='ongoing'>Ongoing</option>
                <option value='approved'>Completed</option>
              </select>
            </div>

            {/* Application Type Filter */}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                Type
              </label>
              <select
                value={selectedApplicationType}
                onChange={(e) => setSelectedApplicationType(e.target.value)}
                className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
              >
                <option value='all'>All Types</option>
                <optgroup label='Builder/Developer'>
                  <option value='builder'>Builder/Developer</option>
                </optgroup>
                <optgroup label='Single Property'>
                  <option value='single_property'>Single Property</option>
                </optgroup>
                <optgroup label='Settlement'>
                  <option value='settlement_va'>Settlement - VA</option>
                  <option value='settlement_nc'>Settlement - NC</option>
                </optgroup>
                <optgroup label='Lender Questionnaire'>
                  <option value='lender_questionnaire'>Lender Questionnaire</option>
                </optgroup>
                <optgroup label='Multi Community'>
                  <option value='multi_community'>Multi Community</option>
                </optgroup>
                <optgroup label='MC Settlement'>
                  <option value='mc_settlement_va'>MC Settlement - VA</option>
                  <option value='mc_settlement_nc'>MC Settlement - NC</option>
                </optgroup>
                <optgroup label='Public Offering'>
                  <option value='public_offering'>Public Offering</option>
                </optgroup>
              </select>
            </div>

            {/* Package Type Filter */}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                Package
              </label>
              <select
                value={selectedPackageType}
                onChange={(e) => setSelectedPackageType(e.target.value)}
                className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
              >
                <option value='all'>All Packages</option>
                <option value='standard'>Standard</option>
                <option value='rush'>Rush</option>
              </select>
            </div>

            {/* Urgency Filter */}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                Urgency
              </label>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className='w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
              >
                <option value='all'>All Applications</option>
                <option value='overdue'>Overdue Only</option>
                <option value='near_deadline'>Near Deadline Only</option>
              </select>
            </div>

          </div>

          </div>
        </div>

        {/* Applications Table (Desktop) */}
        <div className='hidden sm:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full table-fixed'>
              <thead className='bg-gray-50/80 border-b border-gray-100'>
                <tr>
                  <th className='w-[30%] px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Property / Applicant
                  </th>
                  <th className='w-[15%] px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Type
                  </th>
                  <th className='w-[15%] px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Status
                  </th>
                  <th className='w-[15%] px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Date Submitted
                  </th>
                  <th className='w-[15%] px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Assignee
                  </th>
                  <th className='w-[10%] px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-50'>
                {applications.map((app) => {
                  const workflowStep = getWorkflowStep(app);
                  return (
                    <tr key={app.id} className='hover:bg-blue-50/30 transition-colors'>
                      <td className='px-6 py-4'>
                        <div className='flex items-center gap-3'>
                          <Building className='w-5 h-5 text-gray-400' />
                          <div>
                            <div className='text-sm font-semibold text-gray-900 mb-0.5'>
                              {formatPropertyAddress(app.property_address, app.unit_number)}
                            </div>
                            <div className='text-xs text-gray-500 flex items-center gap-1.5'>
                              <span className='inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600'>
                                <Hash className='h-3 w-3 text-gray-400' />
                                App #{app.id}
                              </span>
                              <span className='text-gray-300'>•</span>
                              <span className='font-medium text-gray-700'>{app.submitter_name}</span>
                              <span className='text-gray-300'>•</span>
                              <span>{app.hoa_properties?.name || 'Unknown HOA'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className='px-6 py-4 text-center'>
                        <div className='flex justify-center'>
                          {(() => {
                            const appType = app.application_type || 'single_property';
                            const isRush = app.package_type === 'rush';
                            
                            let typeLabel = '';
                            let typeColor = '';
                            
                            if (appType === 'settlement_va') {
                              typeLabel = 'Settlement - VA';
                              typeColor = 'bg-green-100 text-green-800';
                            } else if (appType === 'settlement_nc') {
                              typeLabel = 'Settlement - NC';
                              typeColor = 'bg-blue-100 text-blue-800';
                            } else if (appType === 'public_offering') {
                              typeLabel = 'Public Offering';
                              typeColor = 'bg-purple-100 text-purple-800';
                            } else if (appType === 'multi_community') {
                              typeLabel = 'Multi-Community';
                              typeColor = 'bg-orange-100 text-orange-800';
                            } else if (appType === 'lender_questionnaire') {
                              typeLabel = 'Lender Questionnaire';
                              typeColor = 'bg-indigo-100 text-indigo-800';
                            } else {
                              typeLabel = 'Single Property';
                              typeColor = 'bg-gray-100 text-gray-800';
                            }
                            
                            return (
                              <div className='flex items-center gap-2'>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${typeColor}`}>
                                  {typeLabel}
                                </span>
                                {isRush && (
                                  <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800'>
                                    RUSH
                                  </span>
                                )}
                                {appType === 'settlement_va' && !isRush && (
                                  <span className='text-xs text-gray-500'>FREE</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>

                      <td className='px-6 py-4 text-center'>
                        {app.status === 'rejected' ? (
                          <div className='group relative inline-block'>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${workflowStep.color} cursor-help transition-all hover:scale-105`}>
                              {workflowStep.icon}
                              {workflowStep.text}
                            </span>
                            {getRejectionReason(app) && (
                              <div className='absolute left-1/2 transform -translate-x-1/2 bottom-full mb-3 hidden group-hover:block z-[100] transition-all animate-in fade-in slide-in-from-bottom-1'>
                                <div className='bg-gray-900/95 backdrop-blur-md text-white text-xs rounded-xl py-3 px-4 shadow-2xl border border-white/10 w-64'>
                                  <div className='text-red-400 mb-1 font-bold uppercase tracking-tight text-[10px]'>
                                    Rejection Reason:
                                  </div>
                                  <div className='text-gray-200 leading-relaxed font-medium'>{getRejectionReason(app)}</div>
                                  <div className='absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-900/95'></div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${workflowStep.color}`}>
                            Step {workflowStep.step}: {workflowStep.text}
                          </span>
                        )}
                      </td>

                      <td className='px-6 py-4 text-sm text-gray-900'>
                        {app.submitted_at ? (
                          <div className='space-y-1 text-center'>
                            <div className='flex items-center justify-center gap-1'>
                              <Calendar className='w-3 h-3 text-gray-400' />
                              <span>
                                {formatDate(app.submitted_at)}
                              </span>
                            </div>
                            <div className='flex items-center justify-center gap-1 text-xs'>
                              <Clock className='w-3 h-3 text-gray-400' />
                              <span className='text-gray-600'>
                                Deadline: {(() => {
                                  const submittedDate = new Date(app.submitted_at);
                                  let deadline;
                                  if (app.package_type === 'rush') {
                                    deadline = calculateBusinessDaysDeadline(submittedDate, 5);
                                  } else {
                                    deadline = calculateCalendarDaysDeadline(submittedDate, 15);
                                  }
                                  return formatDate(deadline.toISOString());
                                })()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className='text-gray-400 block text-center'>Not submitted</span>
                        )}
                      </td>

                      <td className='px-6 py-4 text-sm text-gray-900'>
                        {app.assigned_to ? (
                          <div className='flex items-center justify-center gap-1'>
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
                          <span className='text-gray-400 block text-center'>Unassigned</span>
                        )}
                      </td>

                      <td className='px-6 py-4 text-sm font-medium text-right'>
                        <button
                          onClick={() => handleApplicationClick(app)}
                          className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors'
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
                {searchTerm || dateFilter !== 'all' || urgencyFilter !== 'all' || assignedToMe ? 'No applications found' : 'No applications yet'}
              </h3>
              <p className='text-gray-500'>
                {searchTerm || dateFilter !== 'all' || urgencyFilter !== 'all' || assignedToMe
                  ? 'Try adjusting your search criteria or filters'
                  : 'Applications will appear here once submitted'}
              </p>
            </div>
          )}
        </div>

        {/* Applications List (Mobile) */}
        <div className='sm:hidden space-y-4'>
          {applications.length === 0 ? (
            <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center'>
              <FileText className='w-12 h-12 text-gray-400 mx-auto mb-4' />
              <h3 className='text-lg font-medium text-gray-900 mb-2'>
                {searchTerm || dateFilter !== 'all' || urgencyFilter !== 'all' || assignedToMe ? 'No applications found' : 'No applications yet'}
              </h3>
              <p className='text-gray-500'>
                {searchTerm || dateFilter !== 'all' || urgencyFilter !== 'all' || assignedToMe
                  ? 'Try adjusting your search criteria or filters'
                  : 'Applications will appear here once submitted'}
              </p>
            </div>
          ) : (
            applications.map((app) => {
              const workflowStep = getWorkflowStep(app);
              return (
                <div key={app.id} className='bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4'>
                  {/* Header: Address and Status */}
                  <div className='flex justify-between items-start'>
                    <div>
                      <h3 className='text-base font-semibold text-gray-900'>{formatPropertyAddress(app.property_address, app.unit_number)}</h3>
                      <div className='text-sm text-gray-500 mt-0.5 flex flex-col'>
                        <span className='font-medium'>{app.submitter_name}</span>
                        <span className='text-xs opacity-75'>{app.hoa_properties?.name || 'Unknown HOA'}</span>
                      </div>
                      <div className='mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600'>
                        <Hash className='h-3 w-3 text-gray-400' />
                        App #{app.id}
                      </div>
                    </div>
                    {app.status === 'rejected' ? (
                      <div className='group relative inline-block'>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${workflowStep.color} cursor-help`}>
                          {workflowStep.text}
                        </span>
                        {getRejectionReason(app) && (
                          <div className='absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50'>
                            <div className='bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg max-w-xs'>
                              <div className='font-semibold mb-1'>Rejection Reason:</div>
                              <div className='whitespace-normal'>{getRejectionReason(app)}</div>
                              <div className='absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900'></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${workflowStep.color}`}>
                        Step {workflowStep.step}
                      </span>
                    )}
                  </div>

                  {/* Type Badge */}
                  <div>
                    {(() => {
                      const appType = app.application_type || 'single_property';
                      const isRush = app.package_type === 'rush';
                      
                      let typeLabel = '';
                      let typeColor = '';
                      
                      if (appType === 'settlement_va') {
                        typeLabel = 'Settlement - VA';
                        typeColor = 'bg-green-100 text-green-800';
                      } else if (appType === 'settlement_nc') {
                        typeLabel = 'Settlement - NC';
                        typeColor = 'bg-blue-100 text-blue-800';
                      } else if (appType === 'public_offering') {
                        typeLabel = 'Public Offering';
                        typeColor = 'bg-purple-100 text-purple-800';
                      } else if (appType === 'multi_community') {
                        typeLabel = 'Multi-Community';
                        typeColor = 'bg-orange-100 text-orange-800';
                      } else if (appType === 'lender_questionnaire') {
                        typeLabel = 'Lender Questionnaire';
                        typeColor = 'bg-indigo-100 text-indigo-800';
                      } else {
                        typeLabel = 'Single Property';
                        typeColor = 'bg-gray-100 text-gray-800';
                      }
                      
                      return (
                        <div className='flex items-center gap-2'>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${typeColor}`}>
                            {typeLabel}
                          </span>
                          {isRush && (
                            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800'>
                              RUSH
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Details Grid */}
                  <div className='grid grid-cols-2 gap-4 border-t border-gray-100 pt-3'>
                    <div>
                      <div className='text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1'>Submitted</div>
                      {app.submitted_at ? (
                        <div className='space-y-0.5'>
                          <div className='text-sm font-medium text-gray-900'>{formatDate(app.submitted_at)}</div>
                          <div className='text-xs text-gray-500'>
                            Due: {(() => {
                              const submittedDate = new Date(app.submitted_at);
                              let deadline;
                              if (app.package_type === 'rush') {
                                deadline = calculateBusinessDaysDeadline(submittedDate, 5);
                              } else {
                                deadline = calculateCalendarDaysDeadline(submittedDate, 15);
                              }
                              return formatDate(deadline.toISOString());
                            })()}
                          </div>
                        </div>
                      ) : (
                        <span className='text-sm text-gray-400'>Not submitted</span>
                      )}
                    </div>
                    <div>
                      <div className='text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1'>Assignee</div>
                      <div className='text-sm font-medium text-gray-900'>
                        {app.assigned_to ? (() => {
                          const staff = staffMembers.find(s => s.email === app.assigned_to);
                          return staff ? `${staff.first_name} ${staff.last_name}` : app.assigned_to;
                        })() : <span className='text-gray-400'>Unassigned</span>}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleApplicationClick(app)}
                    className='w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm'
                  >
                    <Eye className='w-4 h-4' />
                    View Details
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-6'>
            <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
              <div className='flex items-center gap-4'>
                <span className='text-sm text-gray-500'>
                  Showing <span className='font-medium text-gray-900'>{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className='font-medium text-gray-900'>{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className='font-medium text-gray-900'>{totalCount}</span> applications
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className='px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer'
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
                  className='p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                  title="First page"
                >
                  <ChevronsLeft className='w-4 h-4' />
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className='p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
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
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            i === currentPage
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
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
                  className='p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                  title="Next page"
                >
                  <ChevronRight className='w-4 h-4' />
                </button>
                <button
                  onClick={() => setCurrentPage(Math.ceil(totalCount / itemsPerPage))}
                  disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                  className='p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
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
          <div 
            className='fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity'
            onClick={handleCloseModal}
          >
            <div 
              className='bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all'
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className='px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white z-10'>
                <div className='flex items-center gap-3'>
                  <div className='h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center'>
                    <FileText className='w-5 h-5 text-blue-600' />
                  </div>
                  <div>
                    <h2 className='text-lg font-bold text-gray-900'>
                      Application #{selectedApplication.id}
                    </h2>
                    <p className='text-xs text-gray-500'>
                      View and manage application details
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  {/* Edit Details Button - Only show if user is admin */}
                  {userRole === 'admin' && !isEditingDetails && (
                    <button
                      onClick={handleStartEditDetails}
                      className='px-4 py-2 bg-blue-50 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold transition-all flex items-center gap-2 text-sm'
                    >
                      <Edit className='w-4 h-4' />
                      Edit Details
                    </button>
                  )}
                  {/* Save/Cancel Buttons when editing */}
                  {userRole === 'admin' && isEditingDetails && (
                    <>
                      <button
                        onClick={handleSaveDetails}
                        disabled={savingDetails}
                        className='px-4 py-2 bg-green-50 border border-green-300 rounded-lg text-green-700 hover:bg-green-100 font-semibold transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        {savingDetails ? (
                          <>
                            <RefreshCw className='w-4 h-4 animate-spin' />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className='w-4 h-4' />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleCancelEditDetails}
                        disabled={savingDetails}
                        className='px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        <X className='w-4 h-4' />
                        Cancel
                      </button>
                    </>
                  )}
                  {/* Reject Button - Only show if user is admin and application is not already rejected */}
                  {userRole === 'admin' && selectedApplication && selectedApplication.status !== 'rejected' && !isEditingDetails && (
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className='px-4 py-2 bg-red-50 border border-red-300 rounded-lg text-red-700 hover:bg-red-100 font-semibold transition-all flex items-center gap-2 text-sm'
                    >
                      <XCircle className='w-4 h-4' />
                      Reject
                    </button>
                  )}
                  {/* Status Badge if rejected */}
                  {selectedApplication && selectedApplication.status === 'rejected' && (
                    <span className='px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700'>
                      Rejected
                    </span>
                  )}
                  {!isEditingDetails && (
                    <>
                      <button
                        onClick={() => handleApplicationClick(selectedApplication)}
                        className='p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors'
                        title='Refresh application data'
                      >
                        <RefreshCw className='w-5 h-5' />
                      </button>
                      <button
                        onClick={handleCloseModal}
                        className='p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                      >
                        <X className='w-5 h-5' />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Modal Content */}
              <div className='flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-gray-50/30'>
                {/* Rejected Status Banner */}
                {selectedApplication.status === 'rejected' && (
                  <div className='bg-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-200 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-red-700 animate-in fade-in zoom-in-95 duration-300'>
                    <div className='flex items-center gap-4'>
                      <div className='h-14 w-14 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30'>
                        <XCircle className='w-8 h-8 text-white' />
                      </div>
                      <div>
                        <h3 className='text-xl font-bold'>Application Rejected</h3>
                        <p className='text-red-50/90 text-sm font-medium'>
                          This request was officially declined on {formatDateTime(selectedApplication.rejected_at || selectedApplication.updated_at)}.
                        </p>
                      </div>
                    </div>
                    {getRejectionReason(selectedApplication) && (
                      <div className='bg-white/10 backdrop-blur-md rounded-xl p-4 md:max-w-md border border-white/10'>
                        <span className='block text-[10px] uppercase font-black tracking-widest text-red-100 mb-1 opacity-80'>Rejection Reason:</span>
                        <p className='text-sm italic font-medium leading-relaxed'>"{getRejectionReason(selectedApplication)}"</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Loading overlay */}
                {loadingFormData && (
                  <div className='absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl'>
                    <div className='flex flex-col items-center gap-3'>
                      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
                      <span className='text-sm font-medium text-gray-600'>Loading details...</span>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {!selectedApplication.id && (
                  <div className='bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3'>
                    <div className='text-red-600 mt-0.5'>⚠️</div>
                    <div>
                      <h3 className='text-sm font-semibold text-red-800'>Application Data Error</h3>
                      <p className='text-sm text-red-600 mt-0.5'>Unable to load application details. Please try refreshing the page.</p>
                    </div>
                  </div>
                )}

                {/* Multi-Community Banner */}
                {selectedApplication.hoa_properties?.is_multi_community && (
                  <div className='bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3'>
                    <Building className='w-5 h-5 text-blue-600 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-semibold text-blue-800'>Multi-Community Application</h3>
                      <p className='text-sm text-blue-600 mt-0.5'>
                        This application includes multiple community associations. Each property will be processed separately.
                      </p>
                    </div>
                  </div>
                )}

                {/* Info Grid */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  {/* Property Info Card */}
                  <div className='bg-white rounded-xl border border-gray-200 p-5 shadow-sm'>
                    <h3 className='text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wider'>
                      <Building className='w-4 h-4 text-gray-400' />
                      Property Information
                    </h3>
                    <div className='grid grid-cols-2 gap-y-4 gap-x-2'>
                      <div className='col-span-2'>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Address</label>
                        {isEditingDetails ? (
                          <input
                            type='text'
                            value={editedDetails.property_address}
                            onChange={(e) => setEditedDetails({ ...editedDetails, property_address: e.target.value })}
                            className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                            placeholder='Enter property address'
                          />
                        ) : (
                          <div className='text-sm font-medium text-gray-900 break-words'>{selectedApplication.property_address}</div>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Unit</label>
                        <div className='text-sm text-gray-900'>{selectedApplication.unit_number || 'N/A'}</div>
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>HOA</label>
                        <div className='text-sm text-gray-900 font-medium'>{selectedApplication.hoa_properties?.name || 'N/A'}</div>
                        {isEditingDetails && (
                          <p className='text-xs text-gray-500 mt-1 italic'>HOA cannot be changed</p>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Buyer</label>
                        {isEditingDetails ? (
                          <input
                            type='text'
                            value={editedDetails.buyer_name}
                            onChange={(e) => setEditedDetails({ ...editedDetails, buyer_name: e.target.value })}
                            className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-2'
                            placeholder='Enter buyer name'
                          />
                        ) : (
                          <div className='text-sm text-gray-900'>{selectedApplication.buyer_name || 'N/A'}</div>
                        )}
                        {!isEditingDetails && selectedApplication.buyer_email && (
                          <div className='text-xs text-gray-500 mt-0.5'>
                            {parseEmails(selectedApplication.buyer_email).map((email, idx) => (
                              <div key={idx}>{email}</div>
                            ))}
                          </div>
                        )}
                        {isEditingDetails && (
                          <div className='mt-2 space-y-2'>
                            <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block'>Buyer Email(s)</label>
                            {editedDetails.buyer_email.map((email, index) => (
                              <div key={index} className='flex items-center gap-2'>
                                <input
                                  type='email'
                                  value={email}
                                  onChange={(e) => handleUpdateBuyerEmail(index, e.target.value)}
                                  className='flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                  placeholder='Enter buyer email'
                                />
                                {editedDetails.buyer_email.length > 1 && (
                                  <button
                                    type='button'
                                    onClick={() => handleRemoveBuyerEmail(index)}
                                    className='p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors'
                                    title='Remove email'
                                  >
                                    <X className='w-4 h-4' />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type='button'
                              onClick={handleAddBuyerEmail}
                              className='text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1'
                            >
                              <span>+</span> Add Email
                            </button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Seller</label>
                        <div className='text-sm text-gray-900'>{selectedApplication.seller_name || 'N/A'}</div>
                        {!isEditingDetails && selectedApplication.seller_email && (
                          <div className='text-xs text-gray-500 mt-0.5'>{selectedApplication.seller_email}</div>
                        )}
                        {isEditingDetails && (
                          <div className='mt-2'>
                            <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Seller Email</label>
                            <input
                              type='email'
                              value={editedDetails.seller_email}
                              onChange={(e) => setEditedDetails({ ...editedDetails, seller_email: e.target.value })}
                              className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              placeholder='Enter seller email (optional)'
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Sale Price</label>
                        {isEditingDetails ? (
                          <div className='relative'>
                            <span className='absolute left-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500'>$</span>
                            <input
                              type='number'
                              step='0.01'
                              min='0'
                              value={editedDetails.sale_price}
                              onChange={(e) => setEditedDetails({ ...editedDetails, sale_price: e.target.value })}
                              className='w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              placeholder='0.00'
                            />
                          </div>
                        ) : (
                          <div className='text-sm text-gray-900'>${selectedApplication.sale_price?.toLocaleString() || 'N/A'}</div>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Closing Date</label>
                        {isEditingDetails ? (
                          <input
                            type='date'
                            value={editedDetails.closing_date}
                            onChange={(e) => setEditedDetails({ ...editedDetails, closing_date: e.target.value })}
                            className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                          />
                        ) : (
                          <div className='text-sm text-gray-900'>
                            {selectedApplication.closing_date ? formatDate(selectedApplication.closing_date) : 'TBD'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Submission Info Card */}
                  <div className='bg-white rounded-xl border border-gray-200 p-5 shadow-sm'>
                    <h3 className='text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wider'>
                      <FileText className='w-4 h-4 text-gray-400' />
                      Submission Details
                    </h3>
                    <div className='grid grid-cols-2 gap-y-4 gap-x-2'>
                      <div className='col-span-2'>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Submitted By</label>
                        {isEditingDetails ? (
                          <div className='space-y-2'>
                            <input
                              type='text'
                              value={editedDetails.submitter_name}
                              onChange={(e) => setEditedDetails({ ...editedDetails, submitter_name: e.target.value })}
                              className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              placeholder='Enter submitter name'
                            />
                            <input
                              type='email'
                              value={editedDetails.submitter_email}
                              onChange={(e) => setEditedDetails({ ...editedDetails, submitter_email: e.target.value })}
                              className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              placeholder='Enter submitter email'
                            />
                            <input
                              type='tel'
                              value={editedDetails.submitter_phone}
                              onChange={(e) => setEditedDetails({ ...editedDetails, submitter_phone: e.target.value })}
                              className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              placeholder='Enter phone number'
                            />
                          </div>
                        ) : (
                          <>
                            <div className='text-sm font-medium text-gray-900'>{selectedApplication.submitter_name || 'N/A'}</div>
                            <div className='text-xs text-gray-500 mt-0.5'>{selectedApplication.submitter_email || 'N/A'}</div>
                            {selectedApplication.submitter_phone && (
                              <div className='text-xs text-gray-500'>{selectedApplication.submitter_phone}</div>
                            )}
                          </>
                        )}
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Type</label>
                        <div className='text-sm text-gray-900 capitalize'>{selectedApplication.submitter_type || 'N/A'}</div>
                      </div>
                       <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>License</label>
                        <div className='text-sm text-gray-900'>{selectedApplication.realtor_license || 'N/A'}</div>
                      </div>
                      <div className='col-span-2'>
                         <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Application Type</label>
                         <div className='inline-flex'>
                          {(() => {
                            const appType = selectedApplication.application_type || 'single_property';
                            let label = 'Single Property';
                            let color = 'bg-gray-100 text-gray-800';
                            
                            if (appType === 'settlement_va') { label = 'Settlement - VA'; color = 'bg-green-100 text-green-800'; }
                            else if (appType === 'settlement_nc') { label = 'Settlement - NC'; color = 'bg-blue-100 text-blue-800'; }
                            else if (appType === 'public_offering') { label = 'Public Offering'; color = 'bg-purple-100 text-purple-800'; }
                            else if (appType === 'multi_community') { label = 'Multi-Community'; color = 'bg-orange-100 text-orange-800'; }
                            else if (appType === 'lender_questionnaire') { label = 'Lender Questionnaire'; color = 'bg-indigo-100 text-indigo-800'; }
                            
                            return <span className={`px-2 py-1 rounded-md text-xs font-medium ${color}`}>{label}</span>;
                          })()}
                         </div>
                      </div>
                       <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Package</label>
                        <div className='text-sm text-gray-900 capitalize'>{selectedApplication.package_type || 'N/A'}</div>
                      </div>
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1'>Total Amount</label>
                        <div className='text-sm font-bold text-gray-900'>${selectedApplication.total_amount?.toFixed(2) || '0.00'}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Assignment Section */}
                {selectedApplication.status !== 'rejected' && (
                  <div className='bg-white rounded-xl border border-gray-200 p-5 shadow-sm'>
                    <h3 className='text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wider'>
                        <User className='w-4 h-4 text-gray-400' />
                        Assignment
                      </h3>
                    <div className='flex items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100'>
                      <div className='flex-1 max-w-md'>
                        <label className='block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2'>
                            Assigned Staff Member
                          </label>
                          <div className="relative">
                            <select
                              value={selectedApplication.assigned_to || ''}
                              onChange={(e) => handleAssignApplication(selectedApplication.id, e.target.value || null)}
                              disabled={assigningApplication === selectedApplication.id}
                              className='w-full pl-3 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none transition-all'
                            >
                              <option value="">Unassigned</option>
                              {staffMembers.map((staff) => (
                                <option key={staff.email} value={staff.email}>
                                  {staff.first_name} {staff.last_name} ({staff.role})
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                          </div>
                      </div>
                      
                      {!selectedApplication.assigned_to && isLegacyApplication(selectedApplication) && (
                        <div className='flex items-end h-full pt-6'>
                          <button
                              onClick={() => handleAutoAssignApplication(selectedApplication.id)}
                              disabled={assigningApplication === selectedApplication.id}
                              className='px-4 py-2.5 text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                              Auto-Assign
                            </button>
                        </div>
                      )}

                      {assigningApplication === selectedApplication.id && (
                        <div className='flex items-center gap-2 text-blue-600 pt-6'>
                          <RefreshCw className='w-5 h-5 animate-spin' />
                          <span className='text-sm font-medium'>Updating...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lender Questionnaire Workflow */}
                {selectedApplication.application_type === 'lender_questionnaire' && selectedApplication.status !== 'rejected' && (
                  <div>
                    <h3 className='text-lg font-bold text-gray-900 mb-4 flex items-center gap-2'>
                      <span className="flex items-center justify-center w-6 h-6 rounded bg-indigo-100 text-indigo-600 text-xs">LQ</span>
                      Questionnaire Tasks
                    </h3>
                    <div className='space-y-4'>
                      {(() => {
                        const taskStatuses = getTaskStatuses(selectedApplication);
                        
                        return (
                          <>
                            {/* Step 1: Download the Form */}
                            <div className={`border rounded-xl p-5 bg-white shadow-sm transition-all ${getTaskStatusColor(taskStatuses.download)}`}>
                              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                                <div className='flex items-start gap-4'>
                                  <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                                    taskStatuses.download === 'completed' ? 'bg-green-50 border-green-500 text-green-600' : 'bg-gray-50 border-gray-300 text-gray-500'
                                  }`}>
                                    <span className='text-sm font-bold'>1</span>
                                  </div>
                                  <div>
                                    <h4 className='font-semibold text-gray-900'>Download the Form</h4>
                                    <p className='text-sm text-gray-500 mt-1'>Download the original lender questionnaire form uploaded by the requester</p>
                                    {selectedApplication.lender_questionnaire_deletion_date && (
                                      <p className='text-xs text-orange-600 mt-2 bg-orange-50 inline-block px-2 py-1 rounded'>
                                        Auto-deletes: {formatDate(selectedApplication.lender_questionnaire_deletion_date)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    /* ... existing download logic ... */
                                    try {
                                      if (!selectedApplication.lender_questionnaire_file_path) {
                                        showSnackbar('No file available to download', 'error');
                                        return;
                                      }
                                      const { data, error } = await supabase.storage
                                        .from('bucket0')
                                        .createSignedUrl(selectedApplication.lender_questionnaire_file_path, 3600);
                                      
                                      if (error) throw error;
                                      if (data?.signedUrl) {
                                        window.open(data.signedUrl, '_blank');
                                        
                                        // Track download
                                        try {
                                          const trackResponse = await fetch('/api/track-lender-questionnaire-download', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              applicationId: selectedApplication.id,
                                            }),
                                          });
                                          
                                          if (trackResponse.ok) {
                                            await refreshSelectedApplication(selectedApplication.id);
                                          }
                                        } catch (trackError) {
                                          console.error('Error tracking download:', trackError);
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Error downloading file:', error);
                                      showSnackbar('Failed to download file', 'error');
                                    }
                                  }}
                                  disabled={!selectedApplication.lender_questionnaire_file_path}
                                  className='flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all font-medium text-sm shadow-sm'
                                >
                                  <Download className='w-4 h-4' />
                                  Download Form
                                </button>
                              </div>
                              {selectedApplication.lender_questionnaire_file_path && (
                                <div className='mt-3 pl-14 text-xs text-gray-500'>
                                  File: {selectedApplication.lender_questionnaire_file_path.split('/').pop()}
                                </div>
                              )}
                            </div>

                            {/* Step 2: Reupload or Edit the Form */}
                            <div className={`border rounded-xl p-5 bg-white shadow-sm transition-all ${getTaskStatusColor(taskStatuses.upload)}`}>
                               {/* ... Similar structure for Step 2 ... */}
                              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                                <div className='flex items-start gap-4'>
                                  <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                                    taskStatuses.upload === 'completed' ? 'bg-green-50 border-green-500 text-green-600' : 'bg-gray-50 border-gray-300 text-gray-500'
                                  }`}>
                                    <span className='text-sm font-bold'>2</span>
                                  </div>
                                  <div>
                                    <h4 className='font-semibold text-gray-900'>Reupload or Edit</h4>
                                    <p className='text-sm text-gray-500 mt-1'>Upload completed form or edit directly</p>
                                     <div className="flex flex-col gap-1 mt-2">
                                        {selectedApplication.lender_questionnaire_completed_uploaded_at && (
                                          <span className='text-xs text-green-600 bg-green-50 px-2 py-1 rounded w-fit'>
                                            Uploaded: {formatDateTimeFull(selectedApplication.lender_questionnaire_completed_uploaded_at)}
                                          </span>
                                        )}
                                        {selectedApplication.lender_questionnaire_edited_at && (
                                          <span className='text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit'>
                                            Edited: {formatDateTimeFull(selectedApplication.lender_questionnaire_edited_at)}
                                          </span>
                                        )}
                                     </div>
                                  </div>
                                </div>
                                <div className='flex flex-wrap gap-2'>
                                  {(selectedApplication.lender_questionnaire_completed_file_path || selectedApplication.lender_questionnaire_edited_file_path) && (
                                    <button
                                      onClick={async () => {
                                         /* ... existing view logic ... */
                                          try {
                                          const filePath = selectedApplication.lender_questionnaire_completed_file_path || selectedApplication.lender_questionnaire_edited_file_path;
                                          const { data, error } = await supabase.storage
                                            .from('bucket0')
                                            .createSignedUrl(filePath, 3600);
                                          
                                          if (error) throw error;
                                          if (data?.signedUrl) {
                                            window.open(data.signedUrl, '_blank');
                                          }
                                        } catch (error) {
                                          console.error('Error viewing file:', error);
                                          showSnackbar('Failed to view file', 'error');
                                        }
                                      }}
                                      className='flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm'
                                    >
                                      <Eye className='w-4 h-4' /> View
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                        /* ... existing edit logic ... */
                                        try {
                                        if (!selectedApplication.lender_questionnaire_file_path) {
                                          showSnackbar('No original file available to edit', 'error');
                                          return;
                                        }
                                        
                                        if (!simplePdfReady) {
                                          showSnackbar('PDF editor is loading, please wait...', 'error');
                                          return;
                                        }

                                        setEditingPdf(true);
                                        
                                        // Get signed URL for the original file (use edited file if available for re-editing)
                                        const fileToEdit = selectedApplication.lender_questionnaire_edited_file_path || selectedApplication.lender_questionnaire_file_path;
                                        const { data: urlData, error: urlError } = await supabase.storage
                                          .from('bucket0')
                                          .createSignedUrl(fileToEdit, 3600);
                                        
                                        if (urlError) throw urlError;
                                        
                                        if (urlData?.signedUrl && window.simplePDF) {
                                          // Open SimplePDF editor with the PDF
                                          window.simplePDF.openEditor({
                                            href: urlData.signedUrl,
                                            context: {
                                              applicationId: selectedApplication.id,
                                              type: 'lender_questionnaire_edit'
                                            }
                                          });
                                          
                                          // Show instructions to user after editor opens
                                          setTimeout(() => {
                                            showSnackbar('PDF editor opened. After editing, download the PDF and upload it using the "Upload Completed Form" button.', 'info');
                                            setEditingPdf(false);
                                          }, 1500);
                                        } else {
                                          throw new Error('PDF editor not available');
                                        }
                                      } catch (error) {
                                        console.error('Error opening PDF editor:', error);
                                        showSnackbar(error.message || 'Failed to open PDF editor', 'error');
                                        setEditingPdf(false);
                                      }
                                    }}
                                    disabled={!selectedApplication.lender_questionnaire_file_path || editingPdf || !simplePdfReady || !selectedApplication.lender_questionnaire_downloaded_at}
                                    className='flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm disabled:opacity-50'
                                  >
                                    <Edit className='w-4 h-4' /> {editingPdf ? 'Opening...' : 'Edit PDF'}
                                  </button>
                                  <button
                                      onClick={() => {
                                        /* ... existing upload logic ... */
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.pdf,.doc,.docx';
                                        input.onchange = async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;

                                          try {
                                            setUploading(true);
                                            const formData = new FormData();
                                            formData.append('file', file);
                                            formData.append('applicationId', selectedApplication.id);

                                            const response = await fetch('/api/upload-lender-questionnaire-completed', {
                                              method: 'POST',
                                              body: formData,
                                            });

                                            if (!response.ok) {
                                              const error = await response.json();
                                              throw new Error(error.error || 'Failed to upload file');
                                            }

                                            showSnackbar('Completed form uploaded successfully', 'success');
                                            await refreshSelectedApplication(selectedApplication.id);
                                          } catch (error) {
                                            console.error('Error uploading completed form:', error);
                                            showSnackbar(error.message || 'Failed to upload completed form', 'error');
                                          } finally {
                                            setUploading(false);
                                          }
                                        };
                                        input.click();
                                      }}
                                      disabled={uploading || !selectedApplication.lender_questionnaire_downloaded_at}
                                      className='flex items-center gap-2 px-3 py-2 bg-blue-600 text-white border border-transparent rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm disabled:opacity-50'
                                    >
                                      <Upload className='w-4 h-4' /> {uploading ? 'Uploading...' : (selectedApplication.lender_questionnaire_completed_file_path ? 'Replace' : 'Upload')}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Step 3: Send Form via Email */}
                            <div className={`border rounded-xl p-5 bg-white shadow-sm transition-all ${getTaskStatusColor(taskStatuses.email)}`}>
                              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                                <div className='flex items-start gap-4'>
                                  <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                                    taskStatuses.email === 'completed' ? 'bg-green-50 border-green-500 text-green-600' : 'bg-gray-50 border-gray-300 text-gray-500'
                                  }`}>
                                    <span className='text-sm font-bold'>3</span>
                                  </div>
                                  <div>
                                    <h4 className='font-semibold text-gray-900'>Send via Email</h4>
                                    <p className='text-sm text-gray-500 mt-1'>Email the completed form to the requester</p>
                                    {selectedApplication.email_completed_at && (
                                      <p className='text-xs text-green-600 bg-green-50 px-2 py-1 rounded w-fit mt-2'>
                                        Sent: {formatDateTimeFull(selectedApplication.email_completed_at)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                      /* ... existing email logic ... */
                                      try {
                                      setSendingEmail(true);
                                      const response = await fetch('/api/send-lender-questionnaire-email', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          applicationId: selectedApplication.id,
                                        }),
                                      });

                                      if (!response.ok) {
                                        const error = await response.json();
                                        throw new Error(error.error || 'Failed to send email');
                                      }

                                      showSnackbar('Email sent successfully', 'success');
                                      await refreshSelectedApplication(selectedApplication.id);
                                    } catch (error) {
                                      console.error('Error sending email:', error);
                                      showSnackbar(error.message || 'Failed to send email', 'error');
                                    } finally {
                                      setSendingEmail(false);
                                    }
                                  }}
                                  disabled={(!selectedApplication.lender_questionnaire_completed_file_path && !selectedApplication.lender_questionnaire_edited_file_path) || sendingEmail}
                                  className='flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm disabled:opacity-50'
                                >
                                  <Mail className='w-4 h-4' /> {sendingEmail ? 'Sending...' : 'Send Email'}
                                </button>
                              </div>
                              <div className='mt-4 p-4 border border-blue-100 rounded-lg bg-blue-50/50'>
                                <label className='flex items-start gap-3 cursor-pointer'>
                                  <input
                                    type='checkbox'
                                    checked={!!selectedApplication.include_property_documents}
                                    onChange={async (e) => {
                                        /* ... existing toggle logic ... */
                                        try {
                                        const response = await fetch('/api/update-application-field', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            applicationId: selectedApplication.id,
                                            field: 'include_property_documents',
                                            value: e.target.checked,
                                          }),
                                        });

                                        if (!response.ok) {
                                          const error = await response.json();
                                          throw new Error(error.error || 'Failed to update setting');
                                        }

                                        await refreshSelectedApplication(selectedApplication.id);
                                      } catch (error) {
                                        console.error('Error updating include_property_documents:', error);
                                        showSnackbar(error.message || 'Failed to update setting', 'error');
                                      }
                                    }}
                                    className='mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                  />
                                  <div>
                                    <div className='font-medium text-gray-900 text-sm'>Include All Property Documents</div>
                                    <div className='text-xs text-gray-500 mt-0.5'>
                                      When checked, all property supporting documents (except Public Offering Statement) will be included in the email.
                                    </div>
                                  </div>
                                </label>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Multi-Community Properties Section */}
                {(() => {
                  // Don't show tasks if application is rejected
                  if (selectedApplication.status === 'rejected') {
                    return null;
                  }
                  const isMultiCommunity = selectedApplication.hoa_properties?.is_multi_community && propertyGroups.length > 1;
                  const isLenderQuestionnaire = selectedApplication.application_type === 'lender_questionnaire';
                  
                  if (isMultiCommunity && !isLenderQuestionnaire) {
                    return (
                      <div>
                        <h3 className='text-lg font-bold text-gray-900 mb-4 flex items-center gap-2'>
                          <Building className='w-5 h-5 text-gray-500' />
                          Multi-Community Properties
                        </h3>
                        <div className='space-y-6'>
                          {loadingGroups ? (
                            <div className='flex items-center justify-center py-12 bg-white rounded-xl border border-gray-200'>
                              <RefreshCw className='w-6 h-6 animate-spin text-blue-600' />
                              <span className='ml-2 text-gray-600 font-medium'>Loading properties...</span>
                            </div>
                          ) : (
                            propertyGroups.sort((a, b) => {
                                if (a.is_primary && !b.is_primary) return -1;
                                if (!a.is_primary && b.is_primary) return 1;
                                return (a.property_name || '').localeCompare(b.property_name || '');
                            }).map((group) => (
                              <div key={group.id} className='bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm'>
                                {/* Group Header */}
                                <div className='px-5 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
                                  <div className='flex items-center gap-3'>
                                    <div className={`w-2 h-2 rounded-full ${group.is_primary ? 'bg-blue-600' : 'bg-gray-400'}`}></div>
                                    <div>
                                      <h4 className='font-bold text-gray-900 flex items-center gap-2'>
                                        {group.property_name}
                                        {group.is_primary && <span className='px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium'>Primary</span>}
                                      </h4>
                                      <p className='text-sm text-gray-500 mt-0.5'>{group.property_location}</p>
                                    </div>
                                  </div>
                                  <div className='flex items-center gap-3'>
                                    {group.property_owner_email && (
                                       <span className='text-xs text-gray-500 bg-white px-2 py-1 border border-gray-200 rounded'>Mgr: {group.property_owner_email}</span>
                                    )}
                                    {/* Status Badge Logic */}
                                    {(() => {
                                      const isSettlementApp = selectedApplication.submitter_type === 'settlement' || selectedApplication.application_type?.startsWith('settlement');
                                      let isCompleted = false;
                                      let label = 'Pending';
                                      let badgeColor = 'bg-gray-100 text-gray-600';

                                      if (isSettlementApp) {
                                          const taskStatuses = getTaskStatuses(selectedApplication, group);
                                          // Check if all tasks are completed
                                          const settlementCompleted = taskStatuses.settlement === 'completed';
                                          const pdfCompleted = taskStatuses.pdf === 'completed' || !!group.pdf_url || (group.pdf_status === 'completed');
                                          const emailCompleted = taskStatuses.email === 'completed' || !!group.email_completed_at || (group.email_status === 'completed');
                                          
                                          isCompleted = settlementCompleted && pdfCompleted && emailCompleted;
                                      } else {
                                          // For standard applications
                                          const inspectionStatus = group.inspection_status || 'not_started';
                                          // group.status === 'completed' often indicates resale form completion in this context,
                                          // OR it might be used as the overall status. 
                                          // To be safe, let's check if all steps are done.
                                          const resaleStatus = group.status === 'completed'; 
                                          const pdfStatus = group.pdf_status === 'completed' || !!group.pdf_url;
                                          const emailStatus = group.email_status === 'completed' || !!group.email_completed_at;
                                          
                                          isCompleted = (inspectionStatus === 'completed') && resaleStatus && pdfStatus && emailStatus;
                                      }

                                      if (isCompleted) { 
                                        badgeColor = 'bg-green-100 text-green-700'; 
                                        label = 'Completed'; 
                                      } else if (group.status === 'failed') {
                                         badgeColor = 'bg-red-100 text-red-700'; 
                                         label = 'Failed';
                                      } else if (group.email_status === 'completed' || group.email_completed_at) {
                                        // If email is sent but maybe something else is missing? (Unlikely flow, but good for feedback)
                                        // Usually email is the last step.
                                        // But if we are here, it means !isCompleted.
                                        // If email is sent, it should be completed unless we added more steps.
                                        // So this branch might not be hit if isCompleted is true.
                                        // Keep consistent with old logic:
                                        badgeColor = 'bg-blue-100 text-blue-700';
                                        label = 'Email Sent';
                                      }

                                      return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${badgeColor}`}>{label}</span>;
                                    })()}
                                  </div>
                                </div>

                                {/* Group Tasks */}
                                <div className='p-5 space-y-4'>
                                    {/* ... Logic for Per-Property Tasks ... */}
                                   {(() => {
                                      const taskStatuses = getTaskStatuses(selectedApplication, group);
                                      const isSettlementApp = selectedApplication.submitter_type === 'settlement' || selectedApplication.application_type?.startsWith('settlement');
                                      const isPrimary = !!group.is_primary;

                                      if (isSettlementApp) {
                                         /* ... Settlement Tasks UI ... */
                                         // Simplify for length - use similar structure to main Settlement tasks but within this loop
                                          const settlementFormCompleted = taskStatuses.settlement === 'completed';
                                          const pdfCanBeGenerated = settlementFormCompleted && (taskStatuses.pdf === 'not_started' || taskStatuses.pdf === 'update_needed' || taskStatuses.pdf === 'completed');
                                          const emailCanBeSent = taskStatuses.pdf === 'completed';

                                          return (
                                            <div className="grid grid-cols-1 gap-4">
                                               {/* Task 1 */}
                                               <div className={`flex items-center justify-between p-3 rounded-lg border ${getTaskStatusColor(taskStatuses.settlement)}`}>
                                                  <div className="flex items-center gap-3">
                                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-300 text-xs font-bold">1</span>
                                                    <span className="text-sm font-medium">Settlement Form</span>
                                                  </div>
                                                  <div className="flex gap-2">
                                                     <button onClick={() => handleCompleteForm(selectedApplication.id, 'settlement', group)} className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700">
                                                        {loadingFormData ? (
                                                          <div className="flex items-center gap-1.5">
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            <span>Loading...</span>
                                                          </div>
                                                        ) : getFormButtonText(taskStatuses.settlement)}
                                                     </button>
                                                     {taskStatuses.settlement !== 'completed' && (
                                                        <button onClick={() => handleCompleteTask(selectedApplication.id, 'settlement_form', group)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100">Complete</button>
                                                     )}
                                                  </div>
                                               </div>
                                               {/* Task 2 */}
                                                <div className={`flex items-center justify-between p-3 rounded-lg border ${getTaskStatusColor(taskStatuses.pdf)}`}>
                                                  <div className="flex items-center gap-3">
                                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-300 text-xs font-bold">2</span>
                                                    <span className="text-sm font-medium">Generate PDF</span>
                                                  </div>
                                                   <div className="flex gap-2">
                                                     <button onClick={() => handleGenerateSettlementPDF(selectedApplication.id, group)} disabled={!pdfCanBeGenerated || generatingPDF} className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-50">
                                                        {generatingPDF ? (
                                                          <div className="flex items-center gap-1.5">
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            <span>Generating...</span>
                                                          </div>
                                                        ) : (group.pdf_url || taskStatuses.pdf === 'completed' ? 'Regenerate' : 'Generate')}
                                                     </button>
                                                     {group.pdf_url && (
                                                        <button onClick={() => window.open(group.pdf_url, '_blank')} className="px-3 py-1 text-xs font-medium bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 text-gray-600">View</button>
                                                     )}
                                                  </div>
                                               </div>
                                                {/* Task 3 */}
                                                <div className={`p-3 rounded-lg border ${getTaskStatusColor(taskStatuses.email)}`}>
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3 flex-1">
                                                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-300 text-xs font-bold">3</span>
                                                      <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium">Send Email</span>
                                                        {group.email_completed_at && (
                                                          <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded inline-block">
                                                            Completed: {formatDateTimeFull(group.email_completed_at)}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                      <button onClick={() => handleSendApprovalEmail(selectedApplication.id, group)} disabled={!emailCanBeSent || sendingEmail} className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-50">
                                                        {sendingEmail ? (
                                                          <div className="flex items-center gap-1.5">
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            <span>Sending...</span>
                                                          </div>
                                                        ) : 'Send'}
                                                      </button>
                                                    </div>
                                                  </div>
                                               </div>
                                            </div>
                                          )
                                      } else {
                                          /* ... Standard Tasks UI ... */
                                          const inspectionStatusForGroup = group.inspection_status ?? 'not_started';
                                          const resaleStatusForGroup = group.status === 'completed' ? 'completed' : 'not_started';
                                          
                                          return (
                                             <div className="space-y-4">
                                                {/* Inspection */}
                                                <TaskCard 
                                                    step="1" 
                                                    title="Property Inspection Form" 
                                                    description={inspectionStatusForGroup === 'not_started' ? 'Not Started' : 'Complete property inspection checklist'}
                                                    status={inspectionStatusForGroup}
                                                    completedAt={group.inspection_completed_at}
                                                >
                                                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                                       <button onClick={() => handleCompleteForm(selectedApplication.id, 'inspection', group)} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">
                                                          {loadingFormKey === `inspection:${group.id}` ? (
                                                             <div className="flex items-center gap-1.5">
                                                               <RefreshCw className="w-3 h-3 animate-spin" />
                                                               <span>Loading...</span>
                                                             </div>
                                                          ) : getFormButtonText(inspectionStatusForGroup)}
                                                       </button>
                                                       {inspectionStatusForGroup !== 'completed' && (
                                                          <button onClick={() => {
                                                             supabase.from('application_property_groups').update({ inspection_status: 'completed', inspection_completed_at: new Date().toISOString() }).eq('id', group.id).then(() => refreshSelectedApplication(selectedApplication.id));
                                                          }} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Mark Complete</button>
                                                       )}
                                                    </div>
                                                </TaskCard>

                                                {/* Resale */}
                                                <TaskCard 
                                                    step="2" 
                                                    title="Virginia Resale Certificate" 
                                                    description={resaleStatusForGroup === 'not_started' ? 'Not Started' : 'Fill out Virginia resale disclosure'}
                                                    status={resaleStatusForGroup}
                                                >
                                                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                                       <button onClick={() => handleCompleteForm(selectedApplication.id, 'resale', group)} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">
                                                          {loadingFormKey === `resale:${group.id}` ? (
                                                             <div className="flex items-center gap-1.5">
                                                               <RefreshCw className="w-3 h-3 animate-spin" />
                                                               <span>Loading...</span>
                                                             </div>
                                                          ) : getFormButtonText(resaleStatusForGroup)}
                                                       </button>
                                                       {isPrimary && !selectedApplication.resale_certificate_completed_at && (
                                                          <button onClick={() => handleCompleteTask(selectedApplication.id, 'resale_certificate')} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Mark Complete</button>
                                                       )}
                                                    </div>
                                                </TaskCard>

                                                {/* PDF */}
                                                <TaskCard 
                                                    step="3" 
                                                    title="Generate PDF" 
                                                    description="Generate PDF for this property"
                                                    status={group.pdf_status || 'not_started'}
                                                    completedAt={group.pdf_completed_at}
                                                >
                                                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                                       <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGeneratePDFForProperty(selectedApplication.id, group); }} disabled={generatingPDFForProperty === group.id || !canGeneratePDFForProperty(group)} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                                          {generatingPDFForProperty === group.id ? (
                                                             <div className="flex items-center gap-1.5">
                                                               <RefreshCw className="w-3 h-3 animate-spin" />
                                                               <span>Generating...</span>
                                                             </div>
                                                          ) : 'Generate PDF'}
                                                       </button>
                                                       {group.pdf_url && (
                                                          <button onClick={() => window.open(group.pdf_url, '_blank')} className="w-full sm:w-auto px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-200 active:bg-gray-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">View</button>
                                                       )}
                                                    </div>
                                                </TaskCard>

                                                {/* Email */}
                                                <TaskCard 
                                                    step="4" 
                                                    title="Send Email" 
                                                    description="Send email for this property"
                                                    status={group.email_status || 'not_started'}
                                                    completedAt={group.email_completed_at}
                                                >
                                                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                                       <button onClick={() => handleSendEmailForProperty(selectedApplication.id, group)} disabled={sendingEmailForProperty === group.id || !canSendEmailForProperty(group)} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                                          {sendingEmailForProperty === group.id ? (
                                                             <div className="flex items-center gap-1.5">
                                                               <RefreshCw className="w-3 h-3 animate-spin" />
                                                               <span>Sending...</span>
                                                             </div>
                                                          ) : 'Send Email'}
                                                       </button>
                                                    </div>
                                                </TaskCard>
                                             </div>
                                          )
                                      }
                                   })()}

                                   {/* Generated Docs Display */}
                                   {group.generated_docs && group.generated_docs.length > 0 && (
                                     <div className="mt-3 pt-3 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 mb-2">Documents:</p>
                                        <div className="flex flex-wrap gap-2">
                                           {group.generated_docs.map((doc, i) => (
                                              <span key={i} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200">{doc.type}</span>
                                           ))}
                                        </div>
                                     </div>
                                   )}
                                </div>
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
                {selectedApplication.status !== 'rejected' && (
                  <div className='bg-white rounded-xl border border-gray-200 p-5 shadow-sm'>
                    <h3 className='text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wider'>
                        <MessageSquare className='w-4 h-4 text-gray-400' />
                        Comments & Notes
                      </h3>
                    <div className='flex flex-col gap-3'>
                      <textarea
                        value={selectedApplication.notes || ''}
                        onChange={(e) => setSelectedApplication({
                          ...selectedApplication,
                          notes: e.target.value
                        })}
                        className='w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all text-sm'
                        rows='4'
                        placeholder='Add notes about this application, task progress, issues, or important information...'
                      />
                      <div className='flex justify-end'>
                        <button
                          onClick={() => handleSaveComments(selectedApplication.id, selectedApplication.notes)}
                          className='px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm'
                        >
                          Save Comments
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard/Settlement Tasks (Single Property) */}
                {(() => {
                  // Don't show tasks if application is rejected
                  if (selectedApplication.status === 'rejected') {
                    return false;
                  }
                  const isMultiCommunity = selectedApplication.hoa_properties?.is_multi_community && propertyGroups.length > 1;
                  const isLenderQuestionnaire = selectedApplication.application_type === 'lender_questionnaire';
                  return !isMultiCommunity && !isLenderQuestionnaire;
                })() && (
                  <div>
                    <h3 className='text-lg font-bold text-gray-900 mb-4 flex items-center gap-2'>
                       <CheckSquare className='w-5 h-5 text-gray-500' />
                       Tasks Checklist
                    </h3>
                    <div className='space-y-4'>
                    {(() => {
                      const taskStatuses = getTaskStatuses(selectedApplication);
                      const isSettlementApp = selectedApplication.submitter_type === 'settlement' || selectedApplication.application_type?.startsWith('settlement');
                      
                      if (isSettlementApp) {
                        const settlementFormCompleted = taskStatuses.settlement === 'completed';
                        const pdfCanBeGenerated = settlementFormCompleted && (taskStatuses.pdf === 'not_started' || taskStatuses.pdf === 'update_needed' || taskStatuses.pdf === 'completed');
                        const emailCanBeSent = taskStatuses.pdf === 'completed';

                        return (
                          <>
                             <TaskCard step="1" status={taskStatuses.settlement} title="Settlement Form" description="Complete form with assessment details" completedAt={selectedApplication.settlement_form_completed_at}>
                                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                   <button onClick={() => handleCompleteForm(selectedApplication.id, 'settlement')} disabled={loadingFormData} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                      {loadingFormData ? (
                                         <div className="flex items-center gap-1.5">
                                           <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                           <span>Loading...</span>
                                         </div>
                                      ) : getFormButtonText(taskStatuses.settlement)}
                                   </button>
                                   {!selectedApplication.settlement_form_completed_at && (
                                      <button onClick={() => handleCompleteTask(selectedApplication.id, 'settlement_form')} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Complete</button>
                                   )}
                                </div>
                             </TaskCard>
                             
                             <TaskCard step="2" status={taskStatuses.pdf} title="Generate PDF" description="Generate settlement PDF document" completedAt={selectedApplication.pdf_completed_at}>
                                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                   <button onClick={() => handleGenerateSettlementPDF(selectedApplication.id)} disabled={!pdfCanBeGenerated || generatingPDF} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                      {generatingPDF ? (
                                         <div className="flex items-center gap-1.5">
                                           <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                           <span>Generating...</span>
                                         </div>
                                      ) : (taskStatuses.pdf === 'completed' || taskStatuses.pdf === 'update_needed' ? 'Regenerate' : 'Generate')}
                                   </button>
                                   {selectedApplication.pdf_url && (
                                      <button onClick={() => window.open(selectedApplication.pdf_url, '_blank')} className="w-full sm:w-auto px-3 py-2 bg-gray-100 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-200 active:bg-gray-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">View</button>
                                   )}
                                </div>
                             </TaskCard>
                             
                             <TaskCard step="3" status={taskStatuses.email} title="Send Email" description="Send details to settlement agent" completedAt={selectedApplication.email_completed_at || selectedApplication.notifications?.find(n => n.notification_type === 'application_approved')?.sent_at}>
                                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                   <button onClick={() => handleSendApprovalEmail(selectedApplication.id)} disabled={!emailCanBeSent || sendingEmail} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                      {sendingEmail ? (
                                         <div className="flex items-center gap-1.5">
                                           <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                           <span>Sending...</span>
                                         </div>
                                      ) : 'Send Email'}
                                   </button>
                                </div>
                             </TaskCard>
                          </>
                        );
                      } else {
                        // Standard App
                         const bothFormsCompleted = taskStatuses.inspection === 'completed' && taskStatuses.resale === 'completed';
                         const pdfCanBeGenerated = bothFormsCompleted && (taskStatuses.pdf === 'not_started' || taskStatuses.pdf === 'update_needed');
                         const emailCanBeSent = bothFormsCompleted && taskStatuses.pdf === 'completed';

                        return (
                           <>
                              <TaskCard step="1" status={taskStatuses.inspection} title="Inspection Form" description="Complete property inspection checklist" completedAt={selectedApplication.inspection_form_completed_at}>
                                 <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                    <button onClick={() => handleCompleteForm(selectedApplication.id, 'inspection')} disabled={loadingFormData} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                       {loadingFormData ? (
                                          <div className="flex items-center gap-1.5">
                                            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                            <span>Loading...</span>
                                          </div>
                                       ) : getFormButtonText(taskStatuses.inspection)}
                                    </button>
                                    {!selectedApplication.inspection_form_completed_at && (
                                       <button onClick={() => handleCompleteTask(selectedApplication.id, 'inspection_form')} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Mark Done</button>
                                    )}
                                 </div>
                              </TaskCard>

                              <TaskCard step="2" status={taskStatuses.resale} title="Resale Certificate" description="Fill out Virginia resale disclosure" completedAt={selectedApplication.resale_certificate_completed_at}>
                                 <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                    <button onClick={() => handleCompleteForm(selectedApplication.id, 'resale')} disabled={loadingFormData} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                       {loadingFormData ? (
                                          <div className="flex items-center gap-1.5">
                                            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                            <span>Loading...</span>
                                          </div>
                                       ) : getFormButtonText(taskStatuses.resale)}
                                    </button>
                                    {!selectedApplication.resale_certificate_completed_at && (
                                       <button onClick={() => handleCompleteTask(selectedApplication.id, 'resale_certificate')} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Mark Done</button>
                                    )}
                                 </div>
                              </TaskCard>

                              <TaskCard step="3" status={taskStatuses.pdf} title="Generate PDF" description="Create final PDF document" completedAt={selectedApplication.pdf_completed_at}>
                                 <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                    <button 
                                       type="button"
                                       onClick={(e) => {
                                         e.preventDefault();
                                         e.stopPropagation();
                                         const inspectionForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'inspection_form');
                                         const resaleForm = selectedApplication.property_owner_forms?.find(form => form.form_type === 'resale_certificate');
                                         handleGeneratePDF({ inspectionForm: inspectionForm?.form_data, resaleCertificate: resaleForm?.form_data }, selectedApplication.id);
                                       }} 
                                       disabled={generatingPDF} 
                                       className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                     >
                                       {generatingPDF ? (
                                          <div className="flex items-center gap-1.5">
                                            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                            <span>Generating...</span>
                                          </div>
                                       ) : (taskStatuses.pdf === 'completed' ? 'Regenerate' : 'Generate')}
                                    </button>
                                    {selectedApplication.pdf_url && (
                                       <button onClick={() => window.open(selectedApplication.pdf_url, '_blank')} className="w-full sm:w-auto px-3 py-2 bg-gray-100 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-200 active:bg-gray-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">View</button>
                                    )}
                                 </div>
                              </TaskCard>

                              <TaskCard step="4" status={taskStatuses.email} title="Send Completion Email" description="Send PDF and files to applicant" completedAt={selectedApplication.email_completed_at}>
                                 <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                                    <button onClick={() => setShowAttachmentModal(true)} className="w-full sm:w-auto px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 active:bg-gray-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Attachments</button>
                                    <button onClick={() => handleSendApprovalEmail(selectedApplication.id)} disabled={!emailCanBeSent || sendingEmail || taskStatuses.pdf === 'update_needed'} className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                       {sendingEmail ? (
                                          <div className="flex items-center gap-1.5">
                                            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                            <span>Sending...</span>
                                          </div>
                                       ) : 'Send Email'}
                                    </button>
                                    {!selectedApplication.email_completed_at && (
                                       <button onClick={() => handleCompleteTask(selectedApplication.id, 'email')} className="w-full sm:w-auto px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:bg-green-300 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">Mark Done</button>
                                    )}
                                 </div>
                              </TaskCard>
                           </>
                        );
                      }
                    })()}
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <div className='flex justify-center pt-6 border-t border-gray-200'>
                  <button
                    onClick={handleCloseModal}
                    className='px-8 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold shadow-sm transition-all'
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
                  propertyGroupId={selectedApplicationForSettlement.propertyGroupId || null}
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

        {/* Reject Modal */}
        {showRejectModal && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[80]'>
            <div className='bg-white rounded-xl shadow-xl w-full max-w-md'>
              <div className='p-6 border-b border-gray-200'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-900'>
                    Reject Application
                  </h2>
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectComments('');
                    }}
                    className='text-gray-400 hover:text-gray-600'
                  >
                    <X className='w-6 h-6' />
                  </button>
                </div>
              </div>
              
              <div className='p-6 space-y-4'>
                <p className='text-sm text-gray-600'>
                  Are you sure you want to reject this application? 
                  This action will send an email notification to the requestor and resales@gmgva.com.
                </p>
                
                {selectedApplication && (
                  <div className='bg-gray-50 rounded-lg p-4 space-y-2'>
                    <div className='text-sm'>
                      <span className='font-medium text-gray-700'>Application ID:</span>
                      <span className='ml-2 text-gray-900'>#{selectedApplication.id}</span>
                    </div>
                    <div className='text-sm'>
                      <span className='font-medium text-gray-700'>Property:</span>
                      <span className='ml-2 text-gray-900'>{selectedApplication.property_address}</span>
                    </div>
                    <div className='text-sm'>
                      <span className='font-medium text-gray-700'>Requestor:</span>
                      <span className='ml-2 text-gray-900'>
                        {selectedApplication.submitter_name}
                        {selectedApplication.submitter_email && ` (${selectedApplication.submitter_email})`}
                      </span>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Reason for Rejection <span className='text-red-500'>*</span>
                  </label>
                  <textarea
                    value={rejectComments}
                    onChange={(e) => setRejectComments(e.target.value)}
                    className='w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all text-sm'
                    rows='4'
                    placeholder='Please provide a reason for rejecting this application...'
                  />
                </div>
              </div>
              
              <div className='p-6 border-t border-gray-200 flex justify-end gap-3'>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectComments('');
                  }}
                  className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors'
                  disabled={processingReject}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingReject || !rejectComments.trim()}
                  className='px-4 py-2 bg-red-600 text-white rounded-lg font-medium transition-colors hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed flex items-center gap-2'
                >
                  {processingReject ? (
                    <>
                      <RefreshCw className='w-4 h-4 animate-spin' />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className='w-4 h-4' />
                      Reject Application
                    </>
                  )}
                </button>
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
                                Uploaded {file.created_at ? formatDate(file.created_at) : 'Recently'}
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