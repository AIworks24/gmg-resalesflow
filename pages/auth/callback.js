import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import companyLogo from '../../assets/company_logo.png';
import useApplicantAuthStore from '../../stores/applicantAuthStore';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { initialize } = useApplicantAuthStore();
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      if (typeof window === 'undefined') return;

      try {
        // Check both hash and search parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);

        // Try hash first (Supabase typically uses hash for auth callbacks)
        let accessToken = hashParams.get('access_token');
        let type = hashParams.get('type');
        let refreshToken = hashParams.get('refresh_token');

        // If not in hash, try search parameters
        if (!accessToken) {
          accessToken = searchParams.get('access_token');
          type = searchParams.get('type');
          refreshToken = searchParams.get('refresh_token');
        }

        if (accessToken && type === 'signup') {
          // Set the session using the access token
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (error) {
            console.error('Error setting session:', error);
            setStatus('error');
            setMessage('Invalid or expired confirmation link. Please try signing up again.');
          } else if (data.session) {
            setStatus('success');
            setMessage('Email verified successfully! Redirecting to home page...');
            
            // Initialize auth store to recognize the new session
            await initialize();
            
            // Wait a bit for session to be fully established, then redirect
            setTimeout(() => {
              // Use window.location for hard redirect to avoid Next.js router issues
              window.location.href = '/';
            }, 2000);
          }
        } else {
          // Check if we already have a valid session (user might have already confirmed)
          const { data: { session }, error } = await supabase.auth.getSession();

          if (session && !error) {
            setStatus('success');
            setMessage('Email already verified! Redirecting to home page...');
            // Initialize auth store to recognize the session
            await initialize();
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
          } else {
            // Wait a bit for Supabase to process the token
            setTimeout(async () => {
              const { data: { session: delayedSession } } = await supabase.auth.getSession();
              if (delayedSession) {
                setStatus('success');
                setMessage('Email verified successfully! Redirecting to home page...');
                setTimeout(() => {
                  window.location.href = '/';
                }, 2000);
              } else {
                setStatus('error');
                setMessage('Invalid or expired confirmation link. Please try signing up again.');
              }
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Error processing confirmation token:', error);
        setStatus('error');
        setMessage('An error occurred while verifying your email. Please try again.');
      }
    };

    // Handle auth state change from the confirmation link
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session ? 'session exists' : 'no session');

      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        setMessage('Email verified successfully! Redirecting to home page...');
        // Initialize auth store to recognize the new session
        initialize().then(() => {
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setStatus('success');
        setMessage('Email verified successfully! Redirecting to home page...');
        // Initialize auth store to recognize the session
        initialize().then(() => {
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        });
      }
    });

    handleEmailConfirmation();

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div className='text-center'>
          <div className='w-24 h-24 mx-auto mb-4'>
            <Image src={companyLogo} alt='GMG Logo' width={96} height={96} className='object-contain' />
          </div>
          <h2 className='text-3xl font-bold text-gray-900'>Email Verification</h2>
        </div>

        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center'>
          {status === 'verifying' && (
            <div className='space-y-4'>
              <Loader2 className='h-12 w-12 text-green-600 animate-spin mx-auto' />
              <p className='text-gray-600'>{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className='space-y-4'>
              <CheckCircle className='h-12 w-12 text-green-600 mx-auto' />
              <p className='text-green-700 font-medium'>{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className='space-y-4'>
              <AlertCircle className='h-12 w-12 text-red-600 mx-auto' />
              <p className='text-red-700'>{message}</p>
              <button
                onClick={() => window.location.href = '/'}
                className='mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors'
              >
                Go to Home Page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

