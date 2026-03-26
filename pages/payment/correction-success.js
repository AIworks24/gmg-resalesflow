import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, Clock, Mail, Home } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function CorrectionSuccess() {
  const router = useRouter();
  const [info, setInfo]       = useState(null);  // { applicationId, correctionType, propertyAddress }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { session_id } = router.query;
    if (!session_id) return;

    (async () => {
      try {
        // Look up by correction_stripe_session_id to get application details
        const { data } = await supabase
          .from('applications')
          .select('id, property_address, package_type, processing_locked_reason')
          .eq('correction_stripe_session_id', session_id)
          .single();

        if (data) {
          const correctionType = data.processing_locked_reason === 'pending_rush_upgrade_payment'
            ? 'rush_upgrade'
            : 'additional_property';
          setInfo({
            applicationId:  data.id,
            propertyAddress: data.property_address,
            packageType:    data.package_type,
            correctionType,
          });
        }
      } catch (err) {
        console.error('correction-success: could not load application:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router.query]);

  const isRushUpgrade = info?.correctionType === 'rush_upgrade';

  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
      <div className='max-w-lg w-full'>

        {/* Icon + heading */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-5'>
            <CheckCircle className='w-10 h-10 text-green-600' />
          </div>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>Payment Received</h1>
          <p className='text-gray-500 text-base'>
            {isRushUpgrade
              ? 'Your application has been upgraded to Rush processing.'
              : 'Your application has been updated with the corrected property.'}
          </p>
        </div>

        {/* Details card */}
        {!loading && info && (
          <div className='bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6'>
            <h2 className='text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4'>Application Details</h2>
            <div className='space-y-3'>
              <div className='flex justify-between text-sm'>
                <span className='text-gray-500'>Application</span>
                <span className='font-semibold text-gray-900'>#{info.applicationId}</span>
              </div>
              {info.propertyAddress && (
                <div className='flex justify-between text-sm'>
                  <span className='text-gray-500'>Property</span>
                  <span className='font-medium text-gray-900 text-right max-w-xs'>{info.propertyAddress}</span>
                </div>
              )}
              <div className='flex justify-between text-sm'>
                <span className='text-gray-500'>Processing</span>
                <span className={`font-semibold ${info.packageType === 'rush' ? 'text-amber-700' : 'text-gray-900'}`}>
                  {info.packageType === 'rush' ? 'Rush — 5 business days' : 'Standard — 15 calendar days'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* What happens next */}
        <div className='bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6'>
          <h2 className='text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4'>What happens next</h2>
          <div className='space-y-4'>
            <div className='flex items-start gap-3'>
              <div className='w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Mail className='w-4 h-4 text-green-600' />
              </div>
              <div>
                <p className='text-sm font-medium text-gray-900'>Payment receipt on its way</p>
                <p className='text-xs text-gray-500 mt-0.5'>A receipt has been sent to your email address.</p>
              </div>
            </div>
            <div className='flex items-start gap-3'>
              <div className='w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Clock className='w-4 h-4 text-blue-600' />
              </div>
              <div>
                <p className='text-sm font-medium text-gray-900'>
                  {isRushUpgrade ? 'Deadline updated' : 'Application updated'}
                </p>
                <p className='text-xs text-gray-500 mt-0.5'>
                  {isRushUpgrade
                    ? 'Your new target completion date reflects the expedited timeline.'
                    : 'Your application has been updated and all tasks have been reset for processing.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push('/')}
          className='w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-700 transition-colors'
        >
          <Home className='w-4 h-4' />
          Return to Home
        </button>

        <p className='text-center text-xs text-gray-400 mt-4'>
          Questions? Email us at <a href='mailto:resales@gmgva.com' className='text-green-600 hover:underline'>resales@gmgva.com</a>
        </p>
      </div>
    </div>
  );
}
