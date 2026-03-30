import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, FileText, Clock, Mail, Home } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ImpersonationBanner from '../../components/ImpersonationBanner';

// Helper function to format property address with unit number
const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};

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
      <div className="min-h-screen bg-gray-50 flex flex-col pt-12">
        <ImpersonationBanner />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your application...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col pt-12">
        <ImpersonationBanner />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Not Found</h1>
            <p className="text-gray-600 mb-6">We couldn't find your application. Please contact support.</p>
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-700 transition-colors"
            >
              <Home className="w-4 h-4" />
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const resaleForm = application.property_owner_forms?.find(f => f.form_type === 'resale_certificate');
  const inspectionForm = application.property_owner_forms?.find(f => f.form_type === 'inspection_form');
  const isInfoPacket = application.application_type === 'info_packet';

  // Parse buyer emails for display
  const buyerEmailList = application.buyer_email
    ? application.buyer_email.split(',').map(e => e.trim()).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-6">
      <ImpersonationBanner />
      <div className="flex-1 py-6">
        <div className="max-w-4xl mx-auto px-4">
        {/* Success Header */}
        <div className="text-center mb-6">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Successful!
          </h1>
          <p className="text-lg text-gray-600">
            {isInfoPacket
              ? 'Your Info Packet (Welcome Package) request has been submitted.'
              : 'Your resale certificate application has been submitted successfully.'
            }
          </p>
        </div>

        {/* Payment Summary - shown when payment was required */}
        {(application.total_amount ?? 0) > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment Summary</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xl font-semibold text-gray-900">
                  ${Number(application.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-gray-500 mt-1">Total paid</p>
              </div>
              <p className="text-sm text-gray-600 max-w-md">
                The convenience fee is non-refundable.
              </p>
            </div>
          </div>
        )}

        {/* Application Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {isInfoPacket ? 'Info Packet Details' : 'Application Details'}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Property Information</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>HOA:</strong> {application.hoa_properties?.name}</p>
                <p><strong>Address:</strong> {formatPropertyAddress(application.property_address, application.unit_number)}</p>
                {!isInfoPacket && application.sale_price && (
                  <p><strong>Sale Price:</strong> ${application.sale_price?.toLocaleString()}</p>
                )}
                {!isInfoPacket && application.closing_date && (
                  <p><strong>Closing Date:</strong> {application.closing_date}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Contact Information</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>Submitted by:</strong> {application.submitter_name}</p>
                <p><strong>Your email:</strong> {application.submitter_email}</p>
                {application.buyer_name && (
                  <p><strong>Buyer:</strong> {application.buyer_name}</p>
                )}
                {buyerEmailList.length > 0 && (
                  <p><strong>Buyer email{buyerEmailList.length > 1 ? 's' : ''}:</strong> {buyerEmailList.join(', ')}</p>
                )}
                {!isInfoPacket && application.seller_name && (
                  <p><strong>Seller:</strong> {application.seller_name}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Packet Delivery Notice */}
        {isInfoPacket && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
            <div className="flex items-start">
              <div className="bg-blue-100 p-2 rounded-full mr-3 flex-shrink-0">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">Documents Are Being Sent Automatically</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Your Info Packet (Welcome Package) documents are being sent right now. No further action is required.
                </p>
                <ul className="text-sm text-blue-800 space-y-1">
                  {buyerEmailList.length > 0 && (
                    <li>
                      <strong>Buyer{buyerEmailList.length > 1 ? 's' : ''}:</strong> Documents sent to{' '}
                      {buyerEmailList.join(', ')}
                    </li>
                  )}
                  <li>
                    <strong>You (requester):</strong> A copy is being sent to {application.submitter_email}
                  </li>
                </ul>
                <p className="text-xs text-blue-700 mt-3">
                  Download links are valid for 30 days. Please save the documents for future reference.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Next Steps — only for non-info-packet flows */}
        {!isInfoPacket && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Next Steps</h2>
            <div className="space-y-3">
              <div className="flex items-start">
                <div className="bg-blue-100 p-2 rounded-full mr-3">
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
                <div className="bg-green-100 p-2 rounded-full mr-3">
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
                      className="inline-block mt-1 text-sm text-green-600 hover:text-green-700 underline"
                    >
                      Complete Resale Certificate Form →
                    </a>
                  )}
                  {inspectionForm && (
                    <a
                      href={`/forms/inspection/${inspectionForm.access_token}`}
                      className="inline-block mt-1 text-sm text-green-600 hover:text-green-700 underline ml-4"
                    >
                      Complete Inspection Form →
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start">
                <div className="bg-orange-100 p-2 rounded-full mr-3">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Processing Timeline</h3>
                  <p className="text-sm text-gray-600">
                    {application.package_type === 'rush'
                      ? 'Rush processing: 5 business days'
                      : 'Standard processing: 15 calendar days'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="text-center space-y-4 sm:space-y-0 sm:space-x-4 flex flex-col sm:flex-row justify-center items-center">
          <button
            onClick={() => router.push('/')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-700 transition-colors"
          >
            <Home className="w-4 h-4" />
            Return to Home
          </button>
          {!isInfoPacket && (
            <button
              onClick={() => window.print()}
              className="w-full sm:w-auto bg-gray-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors"
            >
              Print Confirmation
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
} 