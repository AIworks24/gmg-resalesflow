import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminResaleCertificateForm from '../../../components/admin/AdminResaleCertificateForm';

export default function AdminResaleFormPage() {
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

  // Replace the checkAuthAndLoadData function in pages/admin/resale/[applicationId].js

// Replace the checkAuthAndLoadData function in pages/admin/resale/[applicationId].js

// Replace the checkAuthAndLoadData function in pages/admin/resale/[applicationId].js

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

    // Load application data - FIXED QUERY
    const { data: appData, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name, is_multi_community)
      `)
      .eq('id', applicationId)
      .single();

    if (appError) {
      console.error('Application query error:', appError);
      throw appError;
    }

    // Get or create the resale certificate form separately
    let { data: formData, error: formError } = await supabase
      .from('property_owner_forms')
      .select('id, form_data, response_data, status')
      .eq('application_id', applicationId)
      .eq('form_type', 'resale_certificate')
      .single();

    // If no form exists, create it
    if (formError && formError.code === 'PGRST116') {
      
      const { data: newForm, error: createError } = await supabase
        .from('property_owner_forms')
        .insert([{
          application_id: applicationId,
          form_type: 'resale_certificate',
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

    // Combine the data
    const combinedData = {
      ...appData,
      property_owner_forms: [formData]
    };

    setApplicationData(combinedData);
    
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
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
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
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
    <AdminResaleCertificateForm
      applicationData={applicationData}
      formId={applicationData.property_owner_forms[0]?.id}
      onComplete={() => router.push('/admin/dashboard')}
    />
  );
}
