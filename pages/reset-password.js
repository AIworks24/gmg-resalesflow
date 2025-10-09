import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import companyLogo from '../assets/company_logo.png';

export default function ResetPassword() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    // Check if we have URL parameters (access_token and type=recovery)
    const checkTokenFromURL = async () => {
      if (typeof window === 'undefined') return;
      
      // Check both hash and search parameters
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const searchParams = new URLSearchParams(window.location.search);
      
      // Try hash first
      let accessToken = hashParams.get('access_token');
      let type = hashParams.get('type');
      let refreshToken = hashParams.get('refresh_token');
      
      // If not in hash, try search parameters
      if (!accessToken) {
        accessToken = searchParams.get('access_token');
        type = searchParams.get('type');
        refreshToken = searchParams.get('refresh_token');
      }
      
      
      if (accessToken && type === 'recovery') {
        try {
          // Set the session using the access token
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });
          
          if (error) {
            console.error('Error setting session:', error);
            setMessage('Invalid or expired reset link. Please request a new password reset.');
          } else if (data.session) {
            setIsTokenValid(true);
            setMessage('');
          }
        } catch (error) {
          console.error('Error processing reset token:', error);
          setMessage('Invalid or expired reset link. Please request a new password reset.');
        }
      } else {
        // Check if we already have a valid session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          setIsTokenValid(true);
        } else {
          // Maybe the token is being processed, let's wait a bit
          setTimeout(async () => {
            const { data: { session: delayedSession } } = await supabase.auth.getSession();
            if (delayedSession) {
              setIsTokenValid(true);
              setMessage('');
            } else {
              setMessage('Invalid or expired reset link. Please request a new password reset.');
            }
          }, 2000);
        }
      }
    };

    // Handle auth state change from the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session ? 'session exists' : 'no session');
      
      if (event === 'PASSWORD_RECOVERY' && session) {
        setIsTokenValid(true);
        setMessage('');
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setIsTokenValid(true);
        setMessage('');
      }
    });

    checkTokenFromURL();

    return () => subscription.unsubscribe();
  }, []);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      setIsSuccess(false);
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters long.');
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setMessage(error.message);
        setIsSuccess(false);
      } else {
        setMessage('Password updated successfully! Redirecting to sign in...');
        setIsSuccess(true);
        
        // Sign out the user and redirect to home page after 3 seconds
        setTimeout(async () => {
          await supabase.auth.signOut();
          router.push('/');
        }, 3000);
      }
    } catch (error) {
      setMessage('An error occurred. Please try again.');
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isTokenValid && !message) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-green-700 mx-auto'></div>
          <p className='mt-4 text-gray-600'>Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div className='text-center'>
          <div className='w-24 h-24 mx-auto mb-4'>
            <Image src={companyLogo} alt='GMG Logo' width={96} height={96} className='object-contain' />
          </div>
          <h2 className='text-3xl font-bold text-gray-900'>Reset Your Password</h2>
          <p className='mt-2 text-sm text-gray-600'>
            Enter your new password below
          </p>
        </div>

        {!isTokenValid ? (
          <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
            <div className='flex items-center'>
              <AlertCircle className='h-5 w-5 text-red-400 mr-2' />
              <p className='text-red-700'>{message}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className='mt-4 w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors'
            >
              Go to Home Page
            </button>
          </div>
        ) : (
          <form className='mt-8 space-y-6' onSubmit={handlePasswordReset}>
            <div className='space-y-4'>
              <div>
                <label htmlFor='password' className='block text-sm font-medium text-gray-700'>
                  New Password
                </label>
                <div className='mt-1 relative'>
                  <input
                    id='password'
                    name='password'
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 pr-10'
                    placeholder='Enter new password'
                  />
                  <button
                    type='button'
                    className='absolute inset-y-0 right-0 pr-3 flex items-center'
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className='h-5 w-5 text-gray-400' />
                    ) : (
                      <Eye className='h-5 w-5 text-gray-400' />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor='confirmPassword' className='block text-sm font-medium text-gray-700'>
                  Confirm New Password
                </label>
                <div className='mt-1 relative'>
                  <input
                    id='confirmPassword'
                    name='confirmPassword'
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 pr-10'
                    placeholder='Confirm new password'
                  />
                  <button
                    type='button'
                    className='absolute inset-y-0 right-0 pr-3 flex items-center'
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className='h-5 w-5 text-gray-400' />
                    ) : (
                      <Eye className='h-5 w-5 text-gray-400' />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-lg border ${
                isSuccess 
                  ? 'bg-green-50 border-green-200 text-green-700' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <div className='flex items-center'>
                  {isSuccess ? (
                    <CheckCircle className='h-5 w-5 mr-2' />
                  ) : (
                    <AlertCircle className='h-5 w-5 mr-2' />
                  )}
                  <p>{message}</p>
                </div>
              </div>
            )}

            <button
              type='submit'
              disabled={isLoading || isSuccess}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isLoading || isSuccess
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-700 hover:bg-green-800'
              } text-white`}
            >
              {isLoading ? (
                <>
                  <svg className='animate-spin -ml-1 mr-3 h-5 w-5 text-white' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                  </svg>
                  Updating Password...
                </>
              ) : isSuccess ? (
                'Redirecting...'
              ) : (
                'Update Password'
              )}
            </button>

            <div className='text-center'>
              <button
                type='button'
                onClick={() => router.push('/')}
                className='text-green-600 hover:text-green-800 text-sm'
              >
                Back to Home Page
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}