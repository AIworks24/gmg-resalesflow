import { useRouter } from 'next/router';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import ImpersonationBanner from '../../components/ImpersonationBanner';

export default function PaymentCancel() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-12">
      <ImpersonationBanner />
      <div className="flex-1 flex items-center justify-center py-12">
      <div className="max-w-md mx-auto px-4 text-center">
        {/* Cancel Icon */}
        <XCircle className="h-16 w-16 text-red-600 mx-auto mb-6" />
        
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Payment Cancelled
        </h1>
        
        <p className="text-gray-600 mb-8">
          Your payment was cancelled. No charges have been made to your account.
        </p>

        {/* Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">What happens next?</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <p>• Your application has been saved as a draft</p>
            <p>• You can return and complete payment anytime</p>
            <p>• No charges have been made to your account</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/')}
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Return to Application
          </button>
          
          <button
            onClick={() => router.reload()}
            className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center justify-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Payment Again
          </button>
        </div>

        {/* Support Contact */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Need help? Contact us at{' '}
            <a href="mailto:support@gmgva.com" className="text-green-600 hover:text-green-700">
              support@gmgva.com
            </a>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
} 