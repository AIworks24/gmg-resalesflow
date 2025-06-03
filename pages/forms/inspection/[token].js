import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import PropertyInspectionForm from '../../../components/forms/PropertyInspectionForm';

export default function InspectionFormPage() {
  const router = useRouter();
  const { token } = router.query;
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    if (token) {
      loadFormData();
    }
  }, [token]);

  const loadFormData = async () => {
    try {
      const { data, error } = await supabase
        .from('property_owner_forms')
        .select(`
          id,
          application_id,
          form_type,
          status,
          form_data,
          response_data,
          expires_at,
          applications(property_address),
          hoa_properties(name)
        `)
        .eq('access_token', token)
        .eq('form_type', 'inspection_form')
        .single();

      if (error) throw error;

      if (new Date(data.expires_at) < new Date()) {
        throw new Error('This form has expired');
      }

      setFormData(data);
    } catch (err) {
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
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Form Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <PropertyInspectionForm
      formId={formData.id}
      accessToken={token}
      applicationId={formData.application_id}
      propertyName={formData.hoa_properties?.name || 'Property Owners Association'}
      initialData={formData.response_data || formData.form_data || {}}
    />
  );
}
