import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Clock, AlertTriangle, Home, Loader2 } from 'lucide-react';

const STATUS = {
  LOADING:  'loading',
  REDIRECT: 'redirect',
  EXPIRED:  'expired',
  INACTIVE: 'inactive',
  ERROR:    'error',
};

export default function CorrectionPayment() {
  const router = useRouter();
  const [status, setStatus] = useState(STATUS.LOADING);

  useEffect(() => {
    const { applicationId } = router.query;
    if (!applicationId) return;

    (async () => {
      try {
        const res  = await fetch(`/api/payment/correction-session?applicationId=${applicationId}`);
        const data = await res.json();

        if (data.status === 'redirect' && data.url) {
          window.location.href = data.url;
          // Keep loading state while the browser navigates
        } else {
          setStatus(data.status || STATUS.ERROR);
        }
      } catch (err) {
        console.error('correction: failed to load session:', err);
        setStatus(STATUS.ERROR);
      }
    })();
  }, [router.query]);

  if (status === STATUS.LOADING) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
        <div className='text-center'>
          <Loader2 className='w-10 h-10 text-green-600 animate-spin mx-auto mb-4' />
          <p className='text-gray-500 text-sm'>Preparing your payment...</p>
        </div>
      </div>
    );
  }

  if (status === STATUS.EXPIRED) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
        <div className='max-w-lg w-full'>
          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 mb-5'>
              <Clock className='w-10 h-10 text-amber-600' />
            </div>
            <h1 className='text-3xl font-bold text-gray-900 mb-2'>Payment Window Expired</h1>
            <p className='text-gray-500 text-base'>
              The 48-hour payment window for this correction has passed. Your application has been
              automatically reverted to its original submitted state.
            </p>
          </div>

          <div className='bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6'>
            <h2 className='text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4'>What happened?</h2>
            <div className='space-y-3 text-sm text-gray-600'>
              <p>A property correction was applied to your application and a payment was required to complete it.</p>
              <p>Because payment was not received within 48 hours, the correction has been undone and your application is back in its original state.</p>
              <p>If you still need a property correction, please contact us and we can reopen the process.</p>
            </div>
          </div>

          <a
            href='mailto:resales@gmgva.com'
            className='w-full flex items-center justify-center gap-2 bg-green-700 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-800 transition-colors'
          >
            Contact Us
          </a>

          <p className='text-center text-xs text-gray-400 mt-4'>
            Or email us directly at{' '}
            <a href='mailto:resales@gmgva.com' className='text-green-600 hover:underline'>resales@gmgva.com</a>
          </p>
        </div>
      </div>
    );
  }

  if (status === STATUS.INACTIVE) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
        <div className='max-w-lg w-full'>
          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-5'>
              <Home className='w-10 h-10 text-gray-500' />
            </div>
            <h1 className='text-3xl font-bold text-gray-900 mb-2'>Link No Longer Active</h1>
            <p className='text-gray-500 text-base'>
              This payment link is no longer active. It may have already been paid or expired.
            </p>
          </div>

          <p className='text-center text-xs text-gray-400'>
            Questions? Email us at{' '}
            <a href='mailto:resales@gmgva.com' className='text-green-600 hover:underline'>resales@gmgva.com</a>
          </p>
        </div>
      </div>
    );
  }

  // Fallback: error or not_found
  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
      <div className='max-w-lg w-full'>
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-5'>
            <AlertTriangle className='w-10 h-10 text-red-500' />
          </div>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>Something Went Wrong</h1>
          <p className='text-gray-500 text-base'>
            We couldn&apos;t load your payment link. Please contact us for assistance.
          </p>
        </div>

        <p className='text-center text-xs text-gray-400'>
          Email us at{' '}
          <a href='mailto:resales@gmgva.com' className='text-green-600 hover:underline'>resales@gmgva.com</a>
        </p>
      </div>
    </div>
  );
}
