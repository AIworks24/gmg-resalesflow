import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, FileText, Clock, Mail, Home, Pencil, X, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ImpersonationBanner from '../../components/ImpersonationBanner';
import posthog from '../../lib/posthog';

const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};

const INPUT_CLASS = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500';

export default function PaymentSuccess() {
  const router = useRouter();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Polling state for auto-submit completion
  const [isPolling, setIsPolling] = useState(false);
  const pollAttemptsRef = useRef(0);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    const { session_id, app_id } = router.query;
    if (session_id) {
      loadApplicationBySessionId(session_id);
    } else if (app_id) {
      loadApplicationById(app_id);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      posthog.capture('payment_completed', {
        application_id: data.id,
        stripe_session_id: sessionId,
        application_type: data.application_type,
        package_type: data.package_type,
        total_amount: data.total_amount,
      });

      // For standard resale types, poll until auto-submit completes if needed
      const isStandardResale = data.application_type !== 'info_packet' && data.application_type !== 'public_offering';
      if (isStandardResale && data.status !== 'under_review') {
        pollAttemptsRef.current = 0;
        setIsPolling(true);
        schedulePoll(data.stripe_session_id || sessionId);
      }
    } catch (error) {
      console.error('Error loading application by session ID:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApplicationById = async (appId) => {
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
        .eq('id', appId)
        .single();

      if (error) throw error;
      setApplication(data);

      posthog.capture('payment_completed', {
        application_id: data.id,
        application_type: data.application_type,
        package_type: data.package_type,
        total_amount: data.total_amount,
      });
    } catch (error) {
      console.error('Error loading application by ID:', error);
    } finally {
      setLoading(false);
    }
  };

  const schedulePoll = (sessionId) => {
    pollTimerRef.current = setTimeout(async () => {
      pollAttemptsRef.current += 1;
      try {
        const { data } = await supabase
          .from('applications')
          .select('status')
          .eq('stripe_session_id', sessionId)
          .single();

        if (data?.status === 'under_review' || pollAttemptsRef.current >= 10) {
          setIsPolling(false);
          if (data?.status === 'under_review') {
            setApplication(prev => ({ ...prev, status: 'under_review' }));
          }
        } else {
          schedulePoll(sessionId);
        }
      } catch {
        setIsPolling(false);
      }
    }, 3000);
  };

  const handleStartEdit = () => {
    const emails = application.buyer_email
      ? application.buyer_email.split(',').map(e => e.trim()).filter(Boolean)
      : [''];
    setEditedData({
      submitter_name: application.submitter_name || '',
      submitter_email: application.submitter_email || '',
      submitter_phone: application.submitter_phone || '',
      property_address: application.property_address || '',
      unit_number: application.unit_number || '',
      sale_price: application.sale_price ?? '',
      closing_date: application.closing_date || '',
      buyer_email: emails.length > 0 ? emails : [''],
      seller_email: application.seller_email || '',
    });
    setSaveError('');
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setSaveError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    const buyerEmailValue = editedData.buyer_email
      .map(e => e.trim())
      .filter(Boolean)
      .join(',');

    try {
      const res = await fetch('/api/update-application-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          submitter_name: editedData.submitter_name,
          submitter_email: editedData.submitter_email,
          submitter_phone: editedData.submitter_phone || null,
          property_address: editedData.property_address,
          unit_number: editedData.unit_number || null,
          sale_price: editedData.sale_price !== '' ? editedData.sale_price : null,
          closing_date: editedData.closing_date || null,
          buyer_email: buyerEmailValue || null,
          seller_email: editedData.seller_email || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      setApplication(prev => ({
        ...prev,
        submitter_name: editedData.submitter_name,
        submitter_email: editedData.submitter_email,
        submitter_phone: editedData.submitter_phone || null,
        property_address: editedData.property_address,
        unit_number: editedData.unit_number || null,
        sale_price: editedData.sale_price !== '' ? editedData.sale_price : null,
        closing_date: editedData.closing_date || null,
        buyer_email: buyerEmailValue || null,
        seller_email: editedData.seller_email || null,
      }));

      setSaveSuccess(true);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateBuyerEmail = (index, value) => {
    setEditedData(prev => {
      const emails = [...prev.buyer_email];
      emails[index] = value;
      return { ...prev, buyer_email: emails };
    });
  };

  const addBuyerEmail = () => {
    setEditedData(prev => ({ ...prev, buyer_email: [...prev.buyer_email, ''] }));
  };

  const removeBuyerEmail = (index) => {
    setEditedData(prev => ({
      ...prev,
      buyer_email: prev.buyer_email.filter((_, i) => i !== index),
    }));
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
            <p className="text-gray-600 mb-6">We couldn&apos;t find your application. Please contact support.</p>
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
  const isPublicOffering = application.application_type === 'public_offering';
  const isStandardResale = !isInfoPacket && !isPublicOffering;

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
                : isPublicOffering
                ? 'Your Public Offering Statement request has been submitted.'
                : 'Your resale certificate application has been submitted successfully.'
              }
            </p>

            {/* Submission status badge — only for standard resale */}
            {isStandardResale && (
              <div className="mt-3 inline-flex items-center gap-2">
                {isPolling ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-50 text-yellow-800 border border-yellow-200">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Finalizing submission…
                  </span>
                ) : application.status === 'under_review' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-800 border border-green-200">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Application Under Review
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-800 border border-blue-200">
                    <Clock className="w-3.5 h-3.5" />
                    Processing
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Save success toast */}
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Application details updated successfully.
            </div>
          )}

          {/* Application Details — with inline edit for standard resale */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isInfoPacket ? 'Info Packet Details' : isPublicOffering ? 'Submission Details' : 'Application Details'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  Application #{application.id}
                </p>
              </div>
              {isStandardResale && !isEditing && (
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {isStandardResale && isEditing && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            {saveError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {saveError}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Property Information */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Property Information</h3>
                <div className="space-y-3 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-700">HOA:</span>{' '}
                    <span>{application.hoa_properties?.name}</span>
                  </div>

                  {isEditing ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                        <input
                          type="text"
                          value={editedData.property_address}
                          onChange={e => setEditedData(p => ({ ...p, property_address: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Property address"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Unit / Lot</label>
                        <input
                          type="text"
                          value={editedData.unit_number}
                          onChange={e => setEditedData(p => ({ ...p, unit_number: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Unit or lot number (optional)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sale Price</label>
                        <input
                          type="number"
                          value={editedData.sale_price}
                          onChange={e => setEditedData(p => ({ ...p, sale_price: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Sale price (optional)"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Closing Date</label>
                        <input
                          type="date"
                          value={editedData.closing_date}
                          onChange={e => setEditedData(p => ({ ...p, closing_date: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="font-medium text-gray-700">Address:</span>{' '}
                        {formatPropertyAddress(application.property_address, application.unit_number)}
                      </div>
                      {application.sale_price && (
                        <div>
                          <span className="font-medium text-gray-700">Sale Price:</span>{' '}
                          ${Number(application.sale_price).toLocaleString()}
                        </div>
                      )}
                      {application.closing_date && (
                        <div>
                          <span className="font-medium text-gray-700">Closing Date:</span>{' '}
                          {application.closing_date}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Contact Information</h3>
                <div className="space-y-3 text-sm text-gray-600">
                  {isEditing ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Your Name</label>
                        <input
                          type="text"
                          value={editedData.submitter_name}
                          onChange={e => setEditedData(p => ({ ...p, submitter_name: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Your Email</label>
                        <input
                          type="email"
                          value={editedData.submitter_email}
                          onChange={e => setEditedData(p => ({ ...p, submitter_email: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Email address"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Your Phone</label>
                        <input
                          type="tel"
                          value={editedData.submitter_phone}
                          onChange={e => setEditedData(p => ({ ...p, submitter_phone: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Phone number (optional)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Buyer Email{editedData.buyer_email.length > 1 ? 's' : ''}
                        </label>
                        <div className="space-y-2">
                          {editedData.buyer_email.map((email, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="email"
                                value={email}
                                onChange={e => updateBuyerEmail(idx, e.target.value)}
                                className={`flex-1 ${INPUT_CLASS}`}
                                placeholder="Buyer email (optional)"
                              />
                              {editedData.buyer_email.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeBuyerEmail(idx)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addBuyerEmail}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 mt-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add buyer email
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Seller Email</label>
                        <input
                          type="email"
                          value={editedData.seller_email}
                          onChange={e => setEditedData(p => ({ ...p, seller_email: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Seller email (optional)"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="font-medium text-gray-700">Submitted by:</span>{' '}
                        {application.submitter_name}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Your email:</span>{' '}
                        {application.submitter_email}
                      </div>
                      {application.submitter_phone && (
                        <div>
                          <span className="font-medium text-gray-700">Phone:</span>{' '}
                          {application.submitter_phone}
                        </div>
                      )}
                      {application.buyer_name && (
                        <div>
                          <span className="font-medium text-gray-700">Buyer:</span>{' '}
                          {application.buyer_name}
                        </div>
                      )}
                      {buyerEmailList.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">
                            Buyer email{buyerEmailList.length > 1 ? 's' : ''}:
                          </span>{' '}
                          {buyerEmailList.join(', ')}
                        </div>
                      )}
                      {application.seller_name && (
                        <div>
                          <span className="font-medium text-gray-700">Seller:</span>{' '}
                          {application.seller_name}
                        </div>
                      )}
                      {application.seller_email && (
                        <div>
                          <span className="font-medium text-gray-700">Seller email:</span>{' '}
                          {application.seller_email}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
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

          {/* Public Offering Delivery Notice */}
          {isPublicOffering && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
              <div className="flex items-start">
                <div className="bg-blue-100 p-2 rounded-full mr-3 flex-shrink-0">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">Documents Are Being Sent Automatically</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    Your Public Offering Statement is being sent right now. No further action is required.
                  </p>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>
                      <strong>Your document:</strong> Being sent to {application.submitter_email}
                    </li>
                  </ul>
                  <p className="text-xs text-blue-700 mt-3">
                    Download links are valid for 30 days. Please save the document for future reference.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Next Steps — only for standard resale */}
          {isStandardResale && (
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
                      You&apos;ll receive a confirmation email with your application details.
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
                      We&apos;ll notify you when resale certificate is ready.
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

          {/* Action Button */}
          <div className="text-center">
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
    </div>
  );
}
