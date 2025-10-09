import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabase';
import AdminLayout from '../../../components/admin/AdminLayout';
import AdminSettlementForm from '../../../components/admin/AdminSettlementForm';
import { 
  ArrowLeft, 
  FileText, 
  AlertCircle,
  User,
  Calendar,
  DollarSign
} from 'lucide-react';

export default function SettlementFormPage() {
  const router = useRouter();
  const { applicationId } = router.query;
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (applicationId) {
      loadApplicationData();
      checkUserPermissions();
    }
  }, [applicationId]);

  const checkUserPermissions = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        router.push('/admin/login');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .single();

      if (userError) {
        throw new Error('User not found');
      }

      // Check if user has accounting role or is admin
      if (!userData.role || (!userData.role.includes('accounting') && !userData.role.includes('admin'))) {
        setError('Access denied. This page is only accessible to accounting users.');
        return;
      }

      setUser(userData);
    } catch (error) {
      console.error('Error checking permissions:', error);
      setError('Failed to verify user permissions');
    }
  };

  const loadApplicationData = async () => {
    try {
      setLoading(true);

      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties (
            name,
            location
          )
        `)
        .eq('id', applicationId)
        .single();

      if (appError) {
        throw new Error('Application not found');
      }

      // Verify this is a settlement agent application
      if (appData.submitter_type !== 'settlement') {
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
    router.push('/admin');
  };

  const handleClose = () => {
    router.push('/admin');
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

  if (!user) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Permission Required</h1>
            <p className="text-gray-600 mb-6">
              This page is only accessible to users with accounting permissions.
            </p>
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
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="inline-flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Dashboard
              </button>
              <div className="h-6 border-l border-gray-300"></div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Settlement Form</h1>
                <p className="text-gray-600">Application #{applicationId}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <FileText className="h-6 w-6 text-green-600" />
              <span className="text-sm text-gray-500">Settlement Agent Request</span>
            </div>
          </div>
        </div>

        {/* Application Summary */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start space-x-3">
              <User className="h-5 w-5 text-blue-600 mt-1" />
              <div>
                <p className="text-sm font-medium text-gray-900">Settlement Agent</p>
                <p className="text-sm text-gray-600">{application.submitter_name}</p>
                <p className="text-sm text-gray-500">{application.submitter_email}</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <Calendar className="h-5 w-5 text-orange-600 mt-1" />
              <div>
                <p className="text-sm font-medium text-gray-900">Closing Date</p>
                <p className="text-sm text-gray-600">
                  {application.closing_date 
                    ? new Date(application.closing_date).toLocaleDateString()
                    : 'Not specified'
                  }
                </p>
                <p className="text-sm text-gray-500">
                  Rush: {application.package_type === 'rush' ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <DollarSign className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <p className="text-sm font-medium text-gray-900">Payment</p>
                <p className="text-sm text-gray-600">
                  ${application.total_amount?.toFixed(2) || '0.00'}
                </p>
                <p className="text-sm text-gray-500">
                  Status: {application.payment_status === 'completed_free' ? 'Free (VA)' : application.payment_status}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Property: {application.hoa_property}
                </p>
                <p className="text-sm text-gray-600">
                  {application.property_address} {application.unit_number && `Unit ${application.unit_number}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  Buyer: {application.buyer_name}
                </p>
                <p className="text-sm text-gray-600">
                  {application.buyer_email}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Settlement Form Component */}
        <AdminSettlementForm 
          applicationId={applicationId}
          onClose={handleClose}
        />
      </div>
    </AdminLayout>
  );
}