import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, FileText, Clock, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function PaymentSuccess() {
  const router = useRouter();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { session_id } = router.query;
    
    if (session_id) {
      loadApplicationBySessionId(session_id);
    }
  }, [router.query]);

  const loadApplicationBySessionId = async (sessionId) => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name),
          property_owner_forms(
            id,
            form_type,
            status,
            access_token,
            expires_at
          )
        `)
        .eq('stripe_session_id', sessionId)
        .single();

      if (error) throw error;
      setApplication(data);
    } catch (error) {
      console.error('Error loading application by session ID:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your application...</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn't find your application. Please contact support.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const resaleForm = application.property_owner_forms?.find(f => f.form_type === 'resale_certificate');
  const inspectionForm = application.property_owner_forms?.find(f => f.form_type === 'inspection_form');

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Success Header */}
        <div className="text-center mb-8">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Payment Successful!
          </h1>
          <p className="text-lg text-gray-600">
            Your resale certificate application has been submitted successfully.
          </p>
        </div>

        {/* Application Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Application Details</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Property Information</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>HOA:</strong> {application.hoa_properties?.name}</p>
                <p><strong>Address:</strong> {application.property_address} {application.unit_number}</p>
                <p><strong>Sale Price:</strong> ${application.sale_price?.toLocaleString()}</p>
                <p><strong>Closing Date:</strong> {application.closing_date}</p>
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Contact Information</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>Submitter:</strong> {application.submitter_name}</p>
                <p><strong>Email:</strong> {application.submitter_email}</p>
                <p><strong>Buyer:</strong> {application.buyer_name}</p>
                <p><strong>Seller:</strong> {application.seller_name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Next Steps</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="bg-blue-100 p-2 rounded-full mr-4">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Email Confirmation</h3>
                <p className="text-sm text-gray-600">
                  You'll receive a confirmation email with your application details.
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="bg-green-100 p-2 rounded-full mr-4">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Complete Required Forms</h3>
                <p className="text-sm text-gray-600">
                  We'll notify you when resale certificate is ready.
                </p>
                {resaleForm && (
                  <a
                    href={`/forms/resale-certificate/${resaleForm.access_token}`}
                    className="inline-block mt-2 text-sm text-green-600 hover:text-green-700 underline"
                  >
                    Complete Resale Certificate Form →
                  </a>
                )}
                {inspectionForm && (
                  <a
                    href={`/forms/inspection/${inspectionForm.access_token}`}
                    className="inline-block mt-2 text-sm text-green-600 hover:text-green-700 underline ml-4"
                  >
                    Complete Inspection Form →
                  </a>
                )}
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="bg-orange-100 p-2 rounded-full mr-4">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Processing Timeline</h3>
                <p className="text-sm text-gray-600">
                  {application.package_type === 'rush' 
                    ? 'Rush processing: 5 business days'
                    : 'Standard processing: 10-15 business days'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="text-center space-x-4">
          <button
            onClick={() => router.push('/')}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
          >
            Return to Home
          </button>
          <button
            onClick={() => window.print()}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
          >
            Print Confirmation
          </button>
        </div>
      </div>
    </div>
  );
} 