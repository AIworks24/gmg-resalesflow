import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { CheckCircle, AlertCircle, Loader2, Mail, ArrowLeft, Clock } from 'lucide-react';
import companyLogo from '../../assets/company_logo.png';

export default function ConfirmEmail() {
  const router = useRouter();
  const { token } = router.query;
  
  // Main status states
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error', 'expired'
  const [message, setMessage] = useState('Verifying your email address...');
  
  // Resend form states
  const [showResendForm, setShowResendForm] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // ==========================================
  // EMAIL VERIFICATION LOGIC
  // ==========================================
  useEffect(() => {
    const confirmEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid confirmation link. Please check your email and try again.');
        return;
      }

      try {
        const response = await fetch('/api/auth/confirm-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        // Check if response is successful AND explicitly not marked as failed
        if (response.ok && data.success !== false && data.success) {
          // Check if email was already confirmed (token already used)
          if (data.alreadyConfirmed) {
            setStatus('success');
            setMessage('Email is already verified. Redirecting to home...');
            // Redirect to home page after 2 seconds
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
          } else {
            setStatus('success');
            setMessage('Email verified successfully! Redirecting to home...');
            // Redirect to home page after 2 seconds
            // User is already logged in, they just needed to verify
            // The profile will be refreshed automatically on the home page
            setTimeout(() => {
              window.location.href = '/?emailJustVerified=true';
            }, 2000);
          }
        } else {
          // Handle error responses
          const errorMsg = data.error || data.message || 'Failed to confirm email. Please try again.';
          
          // Check if token already used
          if (errorMsg.toLowerCase().includes('already been used') || errorMsg.toLowerCase().includes('already used')) {
            setStatus('error');
            setMessage('This verification link has already been used. Please request a new verification email if needed.');
          } else if (errorMsg.toLowerCase().includes('expired')) {
            // Check if token expired
            setStatus('expired');
            setMessage(errorMsg);
          } else {
            setStatus('error');
            setMessage(errorMsg);
          }
        }
      } catch (error) {
        console.error('Error confirming email:', error);
        setStatus('error');
        setMessage('An unexpected error occurred while confirming your email. Please try again.');
      }
    };

    if (token) {
      confirmEmail();
    }
  }, [token]);

  // ==========================================
  // COUNTDOWN TIMER LOGIC
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
  // RESEND EMAIL HANDLER
  // ==========================================
  const handleResendEmail = async (e) => {
    e.preventDefault();
    
    // Reset states
    setResendError('');
    setResendSuccess('');
    
    // Validate email
    if (!resendEmail || !resendEmail.trim()) {
      setResendError('Please enter your email address');
      return;
    }
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(resendEmail)) {
      setResendError('Please enter a valid email address');
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resendEmail }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResendSuccess(data.message || 'Verification email sent! Please check your inbox.');
        setResendEmail(''); // Clear email field
        
        // Set cooldown timer (2 minutes = 120 seconds)
        setCooldownSeconds(120);
        
        // Hide form after 3 seconds
        setTimeout(() => {
          setShowResendForm(false);
          setResendSuccess('');
        }, 3000);
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
  // RENDER
  // ==========================================
  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-6'>
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
          <h2 className='text-3xl font-bold text-gray-900'>Email Verification</h2>
          <p className='mt-2 text-sm text-gray-600'>
            Confirm your account to get started
          </p>
        </div>

        {/* Main Content Card */}
        <div className='bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center'>
          
          {/* VERIFYING STATE */}
          {status === 'verifying' && (
            <div className='space-y-4'>
              <Loader2 className='h-16 w-16 text-green-600 animate-spin mx-auto' />
              <h3 className='text-xl font-semibold text-gray-900'>{message}</h3>
              <p className='text-sm text-gray-500'>This will only take a moment...</p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {status === 'success' && (
            <div className='space-y-4'>
              <div className='w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center'>
                <CheckCircle className='h-10 w-10 text-green-600' />
              </div>
              <h3 className='text-xl font-semibold text-green-900'>{message}</h3>
              <div className='flex items-center justify-center gap-2 text-sm text-gray-600'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Redirecting...</span>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {(status === 'error' || status === 'expired') && !showResendForm && (
            <div className='space-y-6'>
              <div className='w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center'>
                <AlertCircle className='h-10 w-10 text-red-600' />
              </div>
              
              <div className='space-y-2'>
                <h3 className='text-xl font-semibold text-red-900'>
                  {status === 'expired' ? 'Link Expired' : 'Verification Failed'}
                </h3>
                <p className='text-sm text-gray-700'>{message}</p>
                
                {status === 'expired' && (
                  <p className='text-xs text-gray-500 pt-2'>
                    Verification links expire after 24 hours for security.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className='space-y-3 pt-2'>
                <button
                  onClick={() => setShowResendForm(true)}
                  disabled={cooldownSeconds > 0}
                  className='w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md'
                >
                  <Mail className='h-5 w-5' />
                  {cooldownSeconds > 0 
                    ? `Wait ${formatCooldown(cooldownSeconds)}` 
                    : 'Request New Verification Email'}
                </button>
                
                <button
                  onClick={() => window.location.href = '/'}
                  className='w-full bg-white border-2 border-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors font-medium'
                >
                  Go to Home Page
                </button>
              </div>
            </div>
          )}

          {/* RESEND FORM */}
          {(status === 'error' || status === 'expired') && showResendForm && (
            <div className='space-y-6'>
              <div className='flex items-center justify-between'>
                <button
                  onClick={() => {
                    setShowResendForm(false);
                    setResendError('');
                    setResendSuccess('');
                  }}
                  className='text-gray-600 hover:text-gray-900 flex items-center gap-1 text-sm font-medium'
                >
                  <ArrowLeft className='h-4 w-4' />
                  Back
                </button>
                <h3 className='text-lg font-semibold text-gray-900'>Resend Verification</h3>
                <div className='w-16'></div> {/* Spacer for alignment */}
              </div>

              <form onSubmit={handleResendEmail} className='space-y-4'>
                <div className='text-left'>
                  <label htmlFor='resend-email' className='block text-sm font-medium text-gray-700 mb-2'>
                    Email Address
                  </label>
                  <input
                    id='resend-email'
                    type='email'
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder='your.email@example.com'
                    disabled={isResending || cooldownSeconds > 0}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all'
                    autoComplete='email'
                  />
                </div>

                {/* Error Message */}
                {resendError && (
                  <div className='bg-red-50 border border-red-200 rounded-lg p-3 text-left'>
                    <p className='text-sm text-red-800'>{resendError}</p>
                  </div>
                )}

                {/* Success Message */}
                {resendSuccess && (
                  <div className='bg-green-50 border border-green-200 rounded-lg p-3 text-left'>
                    <p className='text-sm text-green-800'>{resendSuccess}</p>
                  </div>
                )}

                {/* Cooldown Warning */}
                {cooldownSeconds > 0 && (
                  <div className='bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2'>
                    <Clock className='h-4 w-4 text-blue-600 flex-shrink-0' />
                    <p className='text-sm text-blue-800'>
                      You can request another email in {formatCooldown(cooldownSeconds)}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type='submit'
                  disabled={isResending || cooldownSeconds > 0 || !resendEmail.trim()}
                  className='w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md'
                >
                  {isResending ? (
                    <>
                      <Loader2 className='h-5 w-5 animate-spin' />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className='h-5 w-5' />
                      Send Verification Email
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='text-center'>
          <p className='text-sm text-gray-600'>
            Need help?{' '}
            <a 
              href='mailto:resales@gmgva.com' 
              className='text-green-600 hover:text-green-700 font-medium hover:underline'
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
