import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminPropertyInspectionForm from '../../../../components/admin/AdminPropertyInspectionForm';

export default function AdminInspectionFormPage() {
  const router = useRouter();
  const { applicationId } = router.query;
  const [applicationData, setApplicationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const supabase = createClientComponentClient();

  useEffect(() => {
    if (applicationId) {
      checkAuthAndLoadData();
    }
  }, [applicationId]);

  const checkAuthAndLoadData = async () => {
    try {
      // Check if user is admin
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/admin/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin' && profile?.role !== 'staff') {
        router.push('/');
        return;
      }

      setIsAdmin(true);

      // Load application data
      const { data: appData, error: appError } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name),
          property_owner_forms!inner(id, form_data, response_data, status)
        `)
        .eq('id', applicationId)
        .eq('property_owner_forms.form_type', 'inspection_form')
        .single();

      if (appError) throw appError;

      setApplicationData(appData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading application data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Application</h1>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={() => router.push('/admin/dashboard')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin || !applicationData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <AdminPropertyInspectionForm
      applicationData={applicationData}
      formId={applicationData.property_owner_forms[0]?.id}
      onComplete={() => router.push('/admin/dashboard')}
    />
  );
}
