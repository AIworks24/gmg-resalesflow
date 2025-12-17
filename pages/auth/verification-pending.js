import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Mail, Clock, CheckCircle, AlertCircle, Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import companyLogo from '../../assets/company_logo.png';

export default function VerificationPending() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { returnUrl } = router.query; // Get return URL from query params

  // User state
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resend state
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  // ==========================================
  // LOAD USER DATA
  // ==========================================
  useEffect(() => {
    const loadUser = async () => {
      try {
        // Get current user
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (!authUser) {
          // Not logged in - redirect to home
          router.push('/');
          return;
        }

        // Get profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, email_confirmed_at')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          console.error('Error loading profile:', profileError);
          setIsLoading(false);
          return;
        }

        // Check if email is already verified
        if (profileData.email_confirmed_at) {
          // Already verified - redirect to home
          router.push('/');
          return;
        }

        setUser(authUser);
        setProfile(profileData);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading user:', error);
        setIsLoading(false);
      }
    };

    loadUser();
  }, [supabase, router]);

  // ==========================================
  // COUNTDOWN TIMER
  // ==========================================
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  // ==========================================
  // REALTIME SUBSCRIPTION FOR EMAIL CONFIRMATION
  // ==========================================
  useEffect(() => {
    if (!profile?.id) return;

    // Subscribe to profile changes
    const channel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          console.log('Profile updated:', payload);
          
          // Check if email was confirmed
          if (payload.new.email_confirmed_at) {
            // Email confirmed! Show success and redirect
            const destination = returnUrl || '/';
            setResendSuccess(`Email verified! Redirecting${returnUrl ? ' to your requested page' : ''}...`);
            setTimeout(() => {
              router.push(destination);
            }, 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, supabase, router]);

  // ==========================================
  // RESEND VERIFICATION EMAIL
  // ==========================================
  const handleResendEmail = async () => {
    if (!profile?.email) return;

    // Reset states
    setResendError('');
    setResendSuccess('');
    setIsResending(true);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: profile.email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResendSuccess(data.message || 'Verification email sent! Please check your inbox.');
        
        // Set cooldown timer (2 minutes = 120 seconds)
        setCooldownSeconds(120);
        
        // Update attempts remaining
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }

        // Clear success message after 5 seconds
        setTimeout(() => {
          setResendSuccess('');
        }, 5000);
      } else if (response.status === 429) {
        // Rate limit error
        setResendError(data.message || 'Too many requests. Please try again later.');
        
        // Calculate cooldown from response if available
        if (data.nextResendAvailable) {
          const resetTime = new Date(data.nextResendAvailable);
          const now = new Date();
          const diffSeconds = Math.max(0, Math.ceil((resetTime - now) / 1000));
          setCooldownSeconds(diffSeconds);
        }
      } else {
        setResendError(data.error || data.message || 'Failed to send verification email. Please try again.');
      }
    } catch (error) {
      console.error('Error resending verification email:', error);
      setResendError('An unexpected error occurred. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // ==========================================
  // FORMAT COOLDOWN TIME
  // ==========================================
  const formatCooldown = (seconds) => {
    if (seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // ==========================================
  // SIGN OUT
  // ==========================================
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // ==========================================
  // LOADING STATE
  // ==========================================
  if (isLoading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center'>
        <Loader2 className='h-12 w-12 text-green-600 animate-spin' />
      </div>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-2xl w-full space-y-8'>
        
        {/* Header */}
        <div className='text-center'>
          <div className='w-32 h-32 mx-auto mb-6 bg-white rounded-full p-3 shadow-md border border-gray-200 flex items-center justify-center'>
            <Image 
              src={companyLogo} 
              alt='Goodman Management Group' 
              width={120} 
              height={120} 
              className='object-contain' 
            />
          </div>
          <h1 className='text-4xl font-bold text-gray-900 mb-2'>
            Please Verify Your Email
          </h1>
          <p className='text-lg text-gray-600'>
            You're almost there! Just one more step.
          </p>
        </div>

        {/* Main Content Card */}
        <div className='bg-white rounded-2xl shadow-xl border border-gray-200 p-8 md:p-12'>
          
          {/* Email Icon */}
          <div className='flex justify-center mb-8'>
            <div className='w-20 h-20 bg-green-100 rounded-full flex items-center justify-center'>
              <Mail className='h-10 w-10 text-green-600' />
            </div>
          </div>

          {/* Message */}
          <div className='text-center mb-8 space-y-4'>
            <p className='text-lg text-gray-700'>
              We sent a verification email to:
            </p>
            <p className='text-xl font-semibold text-green-700 bg-green-50 py-3 px-4 rounded-lg inline-block'>
              {profile?.email || user?.email}
            </p>
            <p className='text-gray-600 max-w-md mx-auto'>
              Click the link in the email to verify your account and start creating resale certificate applications.
            </p>
          </div>

          {/* Divider */}
          <div className='border-t border-gray-200 my-8'></div>

          {/* Resend Section */}
          <div className='space-y-6'>
            <div className='text-center'>
              <p className='text-sm text-gray-600 mb-4'>
                Didn't receive the email? Check your spam folder or request a new one.
              </p>

              {/* Success Message */}
              {resendSuccess && (
                <div className='mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3'>
                  <CheckCircle className='h-5 w-5 text-green-600 flex-shrink-0 mt-0.5' />
                  <p className='text-sm text-green-800 text-left'>{resendSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {resendError && (
                <div className='mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3'>
                  <AlertCircle className='h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' />
                  <p className='text-sm text-red-800 text-left'>{resendError}</p>
                </div>
              )}

              {/* Resend Button */}
              <button
                onClick={handleResendEmail}
                disabled={isResending || cooldownSeconds > 0}
                className='w-full md:w-auto px-8 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-3 font-semibold text-lg shadow-lg hover:shadow-xl mx-auto'
              >
                {isResending ? (
                  <>
                    <Loader2 className='h-6 w-6 animate-spin' />
                    Sending...
                  </>
                ) : cooldownSeconds > 0 ? (
                  <>
                    <Clock className='h-6 w-6' />
                    Wait {formatCooldown(cooldownSeconds)}
                  </>
                ) : (
                  <>
                    <RefreshCw className='h-6 w-6' />
                    Resend Verification Email
                  </>
                )}
              </button>

              {/* Attempts Remaining */}
              {attemptsRemaining < 5 && attemptsRemaining > 0 && (
                <div className='mt-4 flex items-center justify-center gap-2 text-sm text-gray-600'>
                  <AlertCircle className='h-4 w-4' />
                  <span>
                    {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining today
                  </span>
                </div>
              )}

              {attemptsRemaining === 0 && (
                <div className='mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3'>
                  <p className='text-sm text-yellow-800'>
                    Daily limit reached. Please try again tomorrow or contact support.
                  </p>
                </div>
              )}

              {/* Cooldown Progress Bar */}
              {cooldownSeconds > 0 && (
                <div className='mt-4'>
                  <div className='bg-gray-200 rounded-full h-2 overflow-hidden'>
                    <div 
                      className='bg-green-600 h-full transition-all duration-1000 ease-linear'
                      style={{ width: `${((120 - cooldownSeconds) / 120) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className='border-t border-gray-200 my-8'></div>

          {/* Instructions */}
          <div className='bg-blue-50 border border-blue-200 rounded-xl p-6'>
            <h3 className='text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2'>
              <CheckCircle className='h-4 w-4' />
              What to do next:
            </h3>
            <ol className='space-y-2 text-sm text-blue-800'>
              <li className='flex items-start gap-2'>
                <span className='font-semibold'>1.</span>
                <span>Check your inbox for an email from GMG ResaleFlow</span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='font-semibold'>2.</span>
                <span>Click the "Verify Email Address" button in the email</span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='font-semibold'>3.</span>
                <span>You'll be automatically logged in and redirected to your dashboard</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Footer Actions */}
        <div className='flex flex-col sm:flex-row items-center justify-center gap-4 text-sm'>
          <button
            onClick={handleSignOut}
            className='text-gray-600 hover:text-gray-900 font-medium underline'
          >
            Sign out and use a different email
          </button>
          <span className='hidden sm:inline text-gray-400'>•</span>
          <a 
            href='mailto:resales@gmgva.com' 
            className='text-green-600 hover:text-green-700 font-medium underline'
          >
            Contact support
          </a>
        </div>

        {/* Security Note */}
        <div className='text-center'>
          <p className='text-xs text-gray-500'>
            Verification links expire after 24 hours for your security.
          </p>
        </div>
      </div>
    </div>
  );
}

