import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminLayout from '../../../components/admin/AdminLayout';
import AdminSettlementForm from '../../../components/admin/AdminSettlementForm';
import { withAdminAuth } from '../../../providers/AdminAuthProvider';
import { 
  ArrowLeft, 
  FileText, 
  AlertCircle,
  User,
  Calendar,
  DollarSign
} from 'lucide-react';

function SettlementFormPage() {
  const router = useRouter();
  const { applicationId } = router.query;
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'success' });
  const supabase = createClientComponentClient();

  // Snackbar helper function
  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  useEffect(() => {
    if (applicationId) {
      loadApplicationData();
    }
  }, [applicationId]);

  const loadApplicationData = async () => {
    try {
      setLoading(true);

      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, location, property_owner_name, property_owner_email)
        `)
        .eq('id', applicationId)
        .single();

      if (appError) {
        throw new Error('Application not found');
      }

      // Verify this is a settlement agent application
      console.log('🔍 Application data:', appData);
      console.log('🔍 Submitter type:', appData.submitter_type);
      console.log('🔍 Application type:', appData.application_type);
      
      if (appData.submitter_type !== 'settlement' && !appData.application_type?.startsWith('settlement')) {
        throw new Error('This application is not a settlement agent request');
      }

      setApplication(appData);

    } catch (error) {
      console.error('Error loading application:', error);
      setError(error.message || 'Failed to load application data');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // Go back in browser history to the applications page
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/admin/applications');
    }
  };

  const handleClose = () => {
    // Go back in browser history to the applications page
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/admin/applications');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading settlement form...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !application) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Error</h1>
            <p className="text-gray-600 mb-6">{error || 'Application not found'}</p>
            <button
              onClick={handleBack}
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
        <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">
              Settlement Form - Application #{applicationId}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 overflow-auto max-h-[calc(95vh-80px)]">
            <AdminSettlementForm 
              applicationId={applicationId}
              applicationData={{
                id: applicationId,
                ...application,
                hoa_properties: application.hoa_properties || { name: application.hoa_property || 'N/A' },
                property_owner_forms: []
              }}
              onClose={handleClose}
              isModal={true}
              showSnackbar={showSnackbar}
            />
          </div>
        </div>
      </div>

      {/* Snackbar Notification */}
      {snackbar.show && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
          snackbar.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          <div className="flex items-center">
            <span>{snackbar.message}</span>
            <button
              onClick={() => setSnackbar({ show: false, message: '', type: 'success' })}
              className="ml-4 hover:opacity-75"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default withAdminAuth(SettlementFormPage);