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
  LogOut,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { mapFormDataToPDFFields } from '../../lib/pdfService';

const AdminDashboard = ({ userRole }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [runTour, setRunTour] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

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

  useEffect(() => {
    loadApplications();
    // Fetch user email for navbar and log auth.uid()
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email || '');
    };
    fetchUser();
  }, []);

  const loadApplications = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(
          `
          *,
          hoa_properties(name, property_owner_email, property_owner_name),
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
          notifications(id, notification_type, status, sent_at)
        `
        )
        .order('created_at', { ascending: false });

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

  const filteredApplications = applications.filter((app) => {
    const matchesStatus =
      selectedStatus === 'all' || app.status === selectedStatus;
    const matchesSearch =
      searchTerm === '' ||
      app.property_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.submitter_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.hoa_properties?.name.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  const handleCompleteForm = async (applicationId, formType) => {
    const form =
      formType === 'inspection' ? 'inspectionForm' : 'resaleCertificate';
    const status = selectedApplication.forms[form].status;

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
          .eq(
            'form_type',
            formType === 'inspection' ? 'inspection_form' : 'resale_certificate'
          );
      } catch (error) {
        console.error('Error updating form status:', error);
      }
    }

    // Navigate to the form page
    router.push(`/admin/${formType}/${applicationId}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleGeneratePDF = async (formData, applicationId) => {
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
      if (!result.success) throw new Error(result.error || 'Failed to regenerate PDF');
      // Optionally: use result.pdfUrl
      // Optionally: refresh applications list or update UI
    } catch (error) {
      console.error('Failed to generate and upload PDF:', error);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleDownloadPDF = async (application) => {
    try {
      setDownloading(true);

      if (!application.pdf_url) {
        throw new Error(
          'No PDF has been generated yet. Please generate the PDF first.'
        );
      }

      // Fetch the PDF from the URL
      const response = await fetch(application.pdf_url);
      if (!response.ok) {
        throw new Error('Failed to fetch PDF');
      }

      // Get the PDF as a blob
      const pdfBlob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resale_certificate_${application.id}.pdf`;
      
      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleSendApprovalEmail = async (applicationId) => {
    setSendingEmail(true);
    try {
      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send approval email');
      }

      // Refresh applications list
      await loadApplications();
      alert('Approval email sent successfully!');
    } catch (error) {
      console.error('Failed to send approval email:', error);
      alert('Failed to send approval email. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  };

  const renderActionButtons = (application) => {
    const bothFormsCompleted =
      application.forms.inspectionForm.status === 'completed' &&
      application.forms.resaleCertificate.status === 'completed';

    return (
      <div className='flex space-x-2'>
        <button
          onClick={() => setSelectedApplication(application)}
          className='px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center space-x-1'
        >
          <Eye className='w-4 h-4' />
          <span>View</span>
        </button>

        {/* Only show Generate PDF button in the main list if no PDF exists */}
        {bothFormsCompleted && !application.pdf_url && (
          <button
            onClick={() => handleGeneratePDF(application.forms.resaleCertificate.form_data, application.id)}
            disabled={generatingPDF}
            className={`px-3 py-1 text-sm ${
              generatingPDF
                ? 'bg-gray-100 text-gray-500'
                : 'bg-gmg-green-600 text-white hover:bg-gmg-green-700'
            } rounded-md flex items-center space-x-1`}
          >
            <FileText className='w-4 h-4' />
            <span>{generatingPDF ? 'Generating...' : 'Generate PDF'}</span>
          </button>
        )}

        {/* Show Download button if PDF exists */}
        {application.pdf_url && (
          <button
            onClick={() => handleDownloadPDF(application)}
            disabled={downloading}
            className={`px-3 py-1 text-sm ${
              downloading
                ? 'bg-gray-100 text-gray-500'
                : 'bg-gmg-green-600 text-white hover:bg-gmg-green-700'
            } rounded-md flex items-center space-x-1`}
          >
            <Download className='w-4 h-4' />
            <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
          </button>
        )}
      </div>
    );
  };

  const renderApplicationModal = () => {
    if (!selectedApplication) return null;

    const bothFormsCompleted =
      selectedApplication.forms.inspectionForm.status === 'completed' &&
      selectedApplication.forms.resaleCertificate.status === 'completed';

    return (
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
        <div className='bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6'>
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

            {/* Forms Status */}
            <div>
              <h3 className='text-lg font-semibold text-gray-800 mb-3'>
                Required Forms
              </h3>
              <div className='grid md:grid-cols-2 gap-4'>
                <div className='border rounded-lg p-4'>
                  <div className='flex items-center justify-between mb-2'>
                    <div className='flex items-center gap-2'>
                      {getFormStatusIcon(
                        selectedApplication.forms.inspectionForm.status
                      )}
                      <span className='font-medium'>
                        Property Inspection Form
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCompleteForm(selectedApplication.id, 'inspection')
                      }
                      className='px-3 py-1 bg-gmg-green-600 text-white text-sm rounded hover:bg-gmg-green-700'
                    >
                      {getFormButtonText(
                        selectedApplication.forms.inspectionForm.status
                      )}
                    </button>
                  </div>
                  <div className='text-sm text-gray-600'>
                    Status:{' '}
                    <span className='capitalize font-medium'>
                      {getFormStatusText(
                        selectedApplication.forms.inspectionForm.status
                      )}
                    </span>
                  </div>
                  {selectedApplication.forms.inspectionForm.completed_at && (
                    <div className='text-sm text-gray-600'>
                      Completed:{' '}
                      {new Date(
                        selectedApplication.forms.inspectionForm.completed_at
                      ).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className='border rounded-lg p-4'>
                  <div className='flex items-center justify-between mb-2'>
                    <div className='flex items-center gap-2'>
                      {getFormStatusIcon(
                        selectedApplication.forms.resaleCertificate.status
                      )}
                      <span className='font-medium'>
                        Virginia Resale Certificate
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCompleteForm(selectedApplication.id, 'resale')
                      }
                      className='px-3 py-1 bg-gmg-green-600 text-white text-sm rounded hover:bg-gmg-green-700'
                    >
                      {getFormButtonText(
                        selectedApplication.forms.resaleCertificate.status
                      )}
                    </button>
                  </div>
                  <div className='text-sm text-gray-600'>
                    Status:{' '}
                    <span className='capitalize font-medium'>
                      {getFormStatusText(
                        selectedApplication.forms.resaleCertificate.status
                      )}
                    </span>
                  </div>
                  {selectedApplication.forms.resaleCertificate.completed_at && (
                    <div className='text-sm text-gray-600'>
                      Completed:{' '}
                      {new Date(
                        selectedApplication.forms.resaleCertificate.completed_at
                      ).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className='flex justify-between gap-3 pt-4 border-t'>
              <button
                onClick={() => setSelectedApplication(null)}
                className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
              >
                Cancel
              </button>

              <div className='flex gap-3'>
                {selectedApplication.forms.inspectionForm.status ===
                  'completed' &&
                  selectedApplication.forms.resaleCertificate.status ===
                    'completed' && (
                    <button
                      onClick={() =>
                        handleGeneratePDF(
                          selectedApplication.forms.resaleCertificate.form_data,
                          selectedApplication.id
                        )
                      }
                      disabled={generatingPDF}
                      className='min-w-[160px] px-4 py-2 bg-gmg-green-600 text-white rounded-md hover:bg-gmg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                      {generatingPDF ? (
                        <>
                          <RefreshCw className='w-4 h-4 animate-spin' />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <FileText className='w-4 h-4' />
                          <span>
                            {selectedApplication.pdf_url
                              ? 'Regenerate PDF'
                              : 'Generate PDF'}
                          </span>
                        </>
                      )}
                    </button>
                  )}

                <div className='relative'>
                  <button
                    onClick={() =>
                      handleSendApprovalEmail(selectedApplication.id)
                    }
                    disabled={
                      sendingEmail ||
                      selectedApplication.forms.inspectionForm.status !==
                        'completed' ||
                      selectedApplication.forms.resaleCertificate.status !==
                        'completed' ||
                      !selectedApplication.pdf_url
                    }
                    className='min-w-[180px] px-4 py-2 bg-gmg-green-600 text-white rounded-md hover:bg-gmg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group'
                    title={
                      selectedApplication.forms.inspectionForm.status !==
                        'completed' ||
                      selectedApplication.forms.resaleCertificate.status !==
                        'completed'
                        ? 'Both forms must be completed before sending the certificate email'
                        : !selectedApplication.pdf_url
                          ? 'PDF must be generated before sending the certificate email'
                          : ''
                    }
                  >
                    {sendingEmail ? (
                      <>
                        <RefreshCw className='w-4 h-4 animate-spin' />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Mail className='w-4 h-4' />
                        <span>Send Certificate Email</span>
                      </>
                    )}
                  </button>
                  {(selectedApplication.forms.inspectionForm.status !==
                    'completed' ||
                    selectedApplication.forms.resaleCertificate.status !==
                      'completed' ||
                    !selectedApplication.pdf_url) && (
                    <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200'>
                      {selectedApplication.forms.inspectionForm.status !==
                        'completed' ||
                      selectedApplication.forms.resaleCertificate.status !==
                        'completed'
                        ? 'Both forms must be completed before sending the certificate email'
                        : !selectedApplication.pdf_url
                          ? 'PDF must be generated before sending the certificate email'
                          : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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
    <div className='min-h-screen bg-gray-100'>
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
        {/* Admin Navbar */}
        <div className='flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-md border'>
          <div className='flex items-center gap-3'>
            <Building className='w-8 h-8 text-blue-600' />
            <span className='text-xl font-bold text-gray-900 dashboard-header'>
              Admin Dashboard
            </span>
          </div>
          <div className='flex items-center gap-4'>
            <button
              onClick={() => setRunTour(true)}
              className='flex items-center gap-2 px-3 py-2 bg-gmg-green-50 hover:bg-gmg-green-100 text-gmg-green-600 rounded-md text-sm font-medium border border-gmg-green-200'
            >
              <HelpCircle className='w-4 h-4' />
              Start Tour
            </button>
            <span className='text-gray-700 text-sm'>{userEmail}</span>
            {userRole && (
              <span className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded'>
                {userRole}
              </span>
            )}
            <button
              onClick={handleLogout}
              className='flex items-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-md text-sm font-medium border border-red-200'
            >
              <LogOut className='w-4 h-4' /> Logout
            </button>
          </div>
        </div>

        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                GMG ResaleFlow Admin Dashboard
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
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 stats-cards'>
          <div className='bg-white p-6 rounded-lg shadow-md border'>
            <div className='flex items-center gap-3'>
              <FileText className='w-8 h-8 text-blue-600' />
              <div>
                <p className='text-sm text-gray-600'>Total Applications</p>
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
          <div className='flex flex-col md:flex-row gap-4'>
            <div className='flex items-center gap-2'>
              <Filter className='w-4 h-4 text-gray-500' />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className='px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='all'>All Statuses</option>
                <option value='submitted'>New Submissions</option>
                <option value='awaiting_property_owner_response'>
                  Awaiting Response
                </option>
                <option value='under_review'>Under Review</option>
                <option value='compliance_completed'>
                  Compliance Completed
                </option>
                <option value='approved'>Approved</option>
                <option value='completed'>Completed</option>
              </select>
            </div>

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
                        {app.status
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
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
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2 text-sm'>
                            {getFormStatusIcon(app.forms.inspectionForm.status)}
                            <span className='text-gray-700'>
                              Inspection Form
                            </span>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              app.forms.inspectionForm.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : app.forms.inspectionForm.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : app.forms.inspectionForm.status === 'not_started'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {getFormStatusText(app.forms.inspectionForm.status)}
                          </span>
                        </div>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2 text-sm'>
                            {getFormStatusIcon(
                              app.forms.resaleCertificate.status
                            )}
                            <span className='text-gray-700'>
                              Resale Certificate
                            </span>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              app.forms.resaleCertificate.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : app.forms.resaleCertificate.status ===
                                    'in_progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : app.forms.resaleCertificate.status ===
                                      'not_started'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {getFormStatusText(
                              app.forms.resaleCertificate.status
                            )}
                          </span>
                        </div>
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

        {/* Application Detail Modal */}
        {selectedApplication && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 view-modal'>
            {renderApplicationModal()}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
