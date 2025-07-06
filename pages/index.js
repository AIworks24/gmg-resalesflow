import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { loadStripe } from '@stripe/stripe-js';
import { useAppContext } from '../lib/AppContext';
import { useAuth } from '../lib/AuthContext';
import {
  Building2,
  FileText,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  Upload,
  User,
  Users,
  DollarSign,
  Search,
  Menu,
  X,
  UserPlus,
  InfoIcon,
  Trash2,
} from 'lucide-react';

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
);

// Helper function to calculate total amount
const calculateTotal = (formData, stripePrices) => {
  if (!stripePrices) {
    // Fallback to hardcoded prices if Stripe prices not loaded yet
    let total = 317.95;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card') total += 9.95;
    return total;
  }

  let total = stripePrices.standard.displayAmount;
  if (formData.packageType === 'rush') {
    total = stripePrices.standard.displayAmount + stripePrices.rush.rushFeeDisplay;
  }
  if (formData.paymentMethod === 'credit_card') {
    total += stripePrices.convenienceFee.display;
  }
  return total;
};

// Move form step components outside the main component to prevent recreation
const HOASelectionStep = React.memo(
  ({ formData, handleInputChange, hoaProperties }) => {
    const [query, setQuery] = React.useState('');
    const [showDropdown, setShowDropdown] = React.useState(false);
    const inputRef = React.useRef(null);

    // Filter HOA options based on query
    const filteredHOAs = (hoaProperties || []).filter((hoa) => {
      const search = query.toLowerCase();
      return (
        hoa.name.toLowerCase().includes(search) ||
        (hoa.location && hoa.location.toLowerCase().includes(search))
      );
    });

    // Function to highlight matching text
    const highlightText = (text, query) => {
      if (!query.trim()) return text;
      
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      
      return parts.map((part, index) => 
        regex.test(part) ? (
          <span key={index} className="bg-green-500 text-white font-medium">
            {part}
          </span>
        ) : (
          part
        )
      );
    };

    // When a HOA is selected
    const selectHOA = (hoa) => {
      handleInputChange('hoaProperty', hoa.name);
      setQuery(hoa.name + (hoa.location ? ` - ${hoa.location}` : ''));
      setShowDropdown(false);
    };

    // Keep input in sync with formData
    React.useEffect(() => {
      if (!formData.hoaProperty) {
        setQuery('');
      } else {
        // Find the HOA object to get the full display text with location
        const selectedHOA = (hoaProperties || []).find(hoa => hoa.name === formData.hoaProperty);
        if (selectedHOA) {
          setQuery(selectedHOA.name + (selectedHOA.location ? ` - ${selectedHOA.location}` : ''));
        } else {
          // Fallback if HOA not found in the list
          setQuery(formData.hoaProperty);
        }
      }
    }, [formData.hoaProperty, hoaProperties]);

    // Hide dropdown on outside click
    React.useEffect(() => {
      function handleClickOutside(event) {
        if (inputRef.current && !inputRef.current.contains(event.target)) {
          setShowDropdown(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className='space-y-6'>
        <div className='text-center mb-8'>
          <h3 className='text-2xl font-bold text-green-900 mb-2'>
            Select HOA Property
          </h3>
          <p className='text-gray-600'>
            Choose the HOA community for your resale certificate application
          </p>
        </div>

        <div className='bg-white p-6 rounded-lg border border-green-200'>
          <label className='block text-sm font-medium text-gray-700 mb-3'>
            HOA Community *
          </label>
          <div className='relative' ref={inputRef}>
            <Search className='absolute left-3 top-3 h-5 w-5 text-gray-400' />
            <input
              type='text'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(e.target.value.length > 0);
                handleInputChange('hoaProperty', '');
              }}
              placeholder='Select an HOA Community'
              className='w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
              autoComplete='off'
            />
            {showDropdown && filteredHOAs.length > 0 && (
              <ul className='absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg'>
                {filteredHOAs.map((hoa) => (
                  <li
                    key={hoa.id}
                    className='px-4 py-2 cursor-pointer hover:bg-green-100'
                    onClick={() => selectHOA(hoa)}
                  >
                    {highlightText(hoa.name, query)} {hoa.location && (
                      <>
                        - {highlightText(hoa.location, query)}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {showDropdown && filteredHOAs.length === 0 && (
              <div className='absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 px-4 py-2 text-gray-500'>
                No HOA found
              </div>
            )}
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-2'>
              Property Address *
            </label>
            <input
              type='text'
              value={formData.propertyAddress}
              onChange={(e) =>
                handleInputChange('propertyAddress', e.target.value)
              }
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
              placeholder='123 Main Street'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-2'>
              Unit Number (if applicable)
            </label>
            <input
              type='text'
              value={formData.unitNumber}
              onChange={(e) => handleInputChange('unitNumber', e.target.value)}
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
              placeholder='4B'
            />
          </div>
        </div>

        {formData.hoaProperty && (
          <div className='bg-green-50 p-4 rounded-lg border border-green-200'>
            <div className='flex items-start'>
              <CheckCircle className='h-5 w-5 text-green-600 mt-0.5 mr-2' />
              <div>
                <h4 className='font-medium text-green-900'>
                  HOA Documents Ready
                </h4>
                <p className='text-sm text-green-700 mt-1'>
                  All required HOA documents for {formData.hoaProperty} will be
                  automatically included in your resale package.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

const SubmitterInfoStep = React.memo(({ formData, handleInputChange }) => (
  <div className='space-y-6'>
    <div className='text-center mb-8'>
      <h3 className='text-2xl font-bold text-green-900 mb-2'>
        Who is Submitting?
      </h3>
      <p className='text-gray-600'>
        Tell us about yourself and your role in this transaction
      </p>
    </div>

    <div className='bg-white p-6 rounded-lg border border-green-200'>
      <label className='block text-sm font-medium text-gray-700 mb-3'>
        I am the: *
      </label>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        {[
          { value: 'seller', label: 'Property Owner/Seller', icon: User },
          { value: 'realtor', label: 'Licensed Realtor', icon: FileText },
          { value: 'builder', label: 'Builder/Developer', icon: Building2 },
          { value: 'admin', label: 'GMG Staff', icon: CheckCircle },
        ].map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              onClick={() => handleInputChange('submitterType', type.value)}
              className={`p-4 rounded-lg border-2 transition-all ${
                formData.submitterType === type.value
                  ? 'border-green-500 bg-green-50 text-green-900'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <Icon className='h-8 w-8 mx-auto mb-2' />
              <div className='text-sm font-medium'>{type.label}</div>
            </button>
          );
        })}
      </div>
    </div>

    <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
      <div>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Full Name *
          {formData.submitterName && (
            <span className='text-xs text-green-600 ml-1'>(auto-filled)</span>
          )}
        </label>
        <input
          type='text'
          value={formData.submitterName}
          onChange={(e) => handleInputChange('submitterName', e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
            formData.submitterName ? 'border-green-300 bg-green-50' : 'border-gray-300'
          }`}
          placeholder='John Smith'
        />
      </div>
      <div>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Email Address *
          {formData.submitterEmail && (
            <span className='text-xs text-green-600 ml-1'>(auto-filled)</span>
          )}
        </label>
        <input
          type='email'
          value={formData.submitterEmail}
          onChange={(e) => handleInputChange('submitterEmail', e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
            formData.submitterEmail ? 'border-green-300 bg-green-50' : 'border-gray-300'
          }`}
          placeholder='john@example.com'
        />
      </div>
      <div>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Phone Number *
        </label>
        <input
          type='tel'
          value={formData.submitterPhone}
          onChange={(e) => handleInputChange('submitterPhone', e.target.value)}
          className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
          placeholder='(555) 123-4567'
        />
      </div>
    </div>

    {formData.submitterType === 'realtor' && (
      <div>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Virginia Real Estate License Number *
        </label>
        <input
          type='text'
          value={formData.realtorLicense}
          onChange={(e) => handleInputChange('realtorLicense', e.target.value)}
          className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
          placeholder='License #'
        />
      </div>
    )}
  </div>
));

const TransactionDetailsStep = ({ formData, handleInputChange }) => (
  <div className='space-y-6'>
    <div className='text-center mb-8'>
      <h3 className='text-2xl font-bold text-green-900 mb-2'>
        Transaction Details
      </h3>
      <p className='text-gray-600'>
        Information about the buyer, seller, and sale details
      </p>
    </div>

    <div className='bg-blue-50 p-6 rounded-lg border border-blue-200'>
      <h4 className='font-semibold text-blue-900 mb-4 flex items-center'>
        <User className='h-5 w-5 mr-2' />
        Buyer Information
      </h4>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <input
          type='text'
          placeholder='Buyer Full Name *'
          value={formData.buyerName || ''}
          onChange={(e) => handleInputChange('buyerName', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='email'
          placeholder='Buyer Email *'
          value={formData.buyerEmail || ''}
          onChange={(e) => handleInputChange('buyerEmail', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='tel'
          placeholder='Buyer Phone *'
          value={formData.buyerPhone || ''}
          onChange={(e) => handleInputChange('buyerPhone', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
      </div>
    </div>

    <div className='bg-green-50 p-6 rounded-lg border border-green-200'>
      <h4 className='font-semibold text-green-900 mb-4 flex items-center'>
        <User className='h-5 w-5 mr-2' />
        Seller Information
      </h4>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <input
          type='text'
          placeholder='Seller Full Name *'
          value={formData.sellerName || ''}
          onChange={(e) => handleInputChange('sellerName', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='email'
          placeholder='Seller Email *'
          value={formData.sellerEmail || ''}
          onChange={(e) => handleInputChange('sellerEmail', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='tel'
          placeholder='Seller Phone *'
          value={formData.sellerPhone || ''}
          onChange={(e) => handleInputChange('sellerPhone', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
      </div>
    </div>

    <div className='bg-gray-50 p-6 rounded-lg border border-gray-200'>
      <h4 className='font-semibold text-gray-900 mb-4 flex items-center'>
        <DollarSign className='h-5 w-5 mr-2' />
        Sale Information
      </h4>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            Sale Price *
          </label>
          <div className='relative'>
            <DollarSign className='absolute left-3 top-3 h-5 w-5 text-gray-400' />
            <input
              type='number'
              placeholder='450000'
              value={formData.salePrice || ''}
              onChange={(e) => handleInputChange('salePrice', e.target.value)}
              className='w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
            />
          </div>
        </div>
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            Expected Closing Date *
          </label>
          <input
            type='date'
            value={formData.closingDate || ''}
            onChange={(e) => handleInputChange('closingDate', e.target.value)}
            className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
          />
        </div>
      </div>
    </div>
  </div>
);

const PackagePaymentStep = ({
  formData,
  handleInputChange,
  currentStep,
  setCurrentStep,
  applicationId,
  user,
  hoaProperties,
  setShowAuthModal,
  stripePrices,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Check if this is a pending payment application
  const [isPendingPayment, setIsPendingPayment] = React.useState(false);
  
  React.useEffect(() => {
    const checkApplicationStatus = async () => {
      if (applicationId) {
        try {
          const { data, error } = await supabase
            .from('applications')
            .select('status')
            .eq('id', applicationId)
            .single();
          
          if (!error && data?.status === 'pending_payment') {
            setIsPendingPayment(true);
          }
        } catch (error) {
          console.error('Error checking application status:', error);
        }
      }
    };
    
    checkApplicationStatus();
  }, [applicationId]);


  const handlePayment = async () => {
    if (!formData.packageType || !formData.paymentMethod) {
      setPaymentError('Please select a package and payment method');
      return;
    }

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      if (formData.paymentMethod === 'credit_card') {
        let createdApplicationId;

        // Check if we already have an application (from draft or previous payment attempt)
        if (applicationId) {
          // Update existing application
          const hoaProperty = (hoaProperties || []).find(
            (h) => h.name === formData.hoaProperty
          );

          const applicationData = {
            hoa_property_id: hoaProperty?.id,
            property_address: formData.propertyAddress,
            unit_number: formData.unitNumber,
            submitter_type: formData.submitterType,
            submitter_name: formData.submitterName,
            submitter_email: formData.submitterEmail,
            submitter_phone: formData.submitterPhone,
            realtor_license: formData.realtorLicense,
            buyer_name: formData.buyerName,
            buyer_email: formData.buyerEmail,
            buyer_phone: formData.buyerPhone,
            seller_name: formData.sellerName,
            seller_email: formData.sellerEmail,
            seller_phone: formData.sellerPhone,
            sale_price: parseFloat(formData.salePrice),
            closing_date: formData.closingDate || null,
            package_type: formData.packageType,
            payment_method: formData.paymentMethod,
            total_amount: calculateTotal(formData, stripePrices),
            status: 'pending_payment',
            updated_at: new Date().toISOString(),
            expected_completion_date: new Date(
              Date.now() +
                (formData.packageType === 'rush' ? 5 : 15) * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split('T')[0],
          };

          const { data: applicationResult, error: applicationError } = await supabase
            .from('applications')
            .update(applicationData)
            .eq('id', applicationId)
            .select();

          if (applicationError) throw applicationError;
          createdApplicationId = applicationResult[0].id;
        } else {
          // Create new application
          const hoaProperty = (hoaProperties || []).find(
            (h) => h.name === formData.hoaProperty
          );

          const applicationData = {
            user_id: user.id,
            hoa_property_id: hoaProperty?.id,
            property_address: formData.propertyAddress,
            unit_number: formData.unitNumber,
            submitter_type: formData.submitterType,
            submitter_name: formData.submitterName,
            submitter_email: formData.submitterEmail,
            submitter_phone: formData.submitterPhone,
            realtor_license: formData.realtorLicense,
            buyer_name: formData.buyerName,
            buyer_email: formData.buyerEmail,
            buyer_phone: formData.buyerPhone,
            seller_name: formData.sellerName,
            seller_email: formData.sellerEmail,
            seller_phone: formData.sellerPhone,
            sale_price: parseFloat(formData.salePrice),
            closing_date: formData.closingDate || null,
            package_type: formData.packageType,
            payment_method: formData.paymentMethod,
            total_amount: calculateTotal(formData, stripePrices),
            status: 'pending_payment',
            submitted_at: new Date().toISOString(),
            expected_completion_date: new Date(
              Date.now() +
                (formData.packageType === 'rush' ? 5 : 15) * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split('T')[0],
          };

          const { data: applicationResult, error: applicationError } = await supabase
            .from('applications')
            .insert([applicationData])
            .select();

          if (applicationError) throw applicationError;
          createdApplicationId = applicationResult[0].id;
          
          // Set the application ID for future updates
          setApplicationId(createdApplicationId);
        }

        // Get Stripe instance
        const stripe = await stripePromise;

        if (!stripe) {
          throw new Error('Stripe failed to load. Please check your publishable key.');
        }

        // Create checkout session
        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageType: formData.packageType,
            paymentMethod: formData.paymentMethod,
            applicationId: createdApplicationId,
            formData: formData,
            amount: Math.round(calculateTotal(formData, stripePrices) * 100), // Convert to cents
          }),
        });

        const { sessionId, error: sessionError } = await response.json();

        if (sessionError) {
          throw new Error(sessionError);
        }

        if (!sessionId) {
          throw new Error('Failed to create checkout session');
        }

        // Redirect to Stripe Checkout
        const { error: redirectError } = await stripe.redirectToCheckout({
          sessionId: sessionId,
        });

        if (redirectError) {
          throw new Error(redirectError.message);
        }
      } else {
        // Handle ACH payment (redirect to external processor or show instructions)
        alert('ACH payment processing will be implemented separately. Please contact support for bank transfer instructions.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentError(error.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className='space-y-6'>
      {isPendingPayment && (
        <div className='bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6'>
          <div className='flex items-center'>
            <InfoIcon className='h-6 w-6 text-blue-600 mr-3' />
            <div>
              <h4 className='text-lg font-semibold text-blue-900'>
                Resume Payment
              </h4>
              <p className='text-sm text-blue-700'>
                Your application has been saved. You can revise any details below or proceed with payment to complete your application.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className='text-center mb-8'>
        <h3 className='text-2xl font-bold text-green-900 mb-2'>
          Package Selection & Payment
        </h3>
        <p className='text-gray-600'>
          Choose your processing speed and payment method
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div
          onClick={() => handleInputChange('packageType', 'standard')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            formData.packageType === 'standard'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className='flex items-start justify-between mb-4'>
            <div>
              <h4 className='text-lg font-semibold text-gray-900'>
                Standard Processing
              </h4>
              <p className='text-sm text-gray-600'>10-15 business days</p>
            </div>
            <div className='text-right'>
              <div className='text-2xl font-bold text-green-600'>
                ${stripePrices ? stripePrices.standard.displayAmount.toFixed(2) : '317.95'}
              </div>
            </div>
          </div>
          <ul className='text-sm text-gray-600 space-y-1'>
            <li>• Complete Virginia Resale Certificate</li>
            <li>• HOA Documents Package</li>
            <li>• Compliance Inspection Report</li>
            <li>• Digital & Print Delivery</li>
          </ul>
        </div>

        <div
          onClick={() => handleInputChange('packageType', 'rush')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            formData.packageType === 'rush'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div className='flex items-start justify-between mb-4'>
            <div>
              <h4 className='text-lg font-semibold text-gray-900 flex items-center'>
                Rush Processing
                <span className='ml-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded'>
                  PRIORITY
                </span>
              </h4>
              <p className='text-sm text-gray-600'>5 business days</p>
            </div>
            <div className='text-right'>
              <div className='text-lg text-gray-500'>
                ${stripePrices ? stripePrices.standard.displayAmount.toFixed(2) : '317.95'}
              </div>
              <div className='text-sm text-gray-500'>
                + ${stripePrices ? stripePrices.rush.rushFeeDisplay.toFixed(2) : '70.66'}
              </div>
              <div className='text-2xl font-bold text-orange-600'>
                ${stripePrices ? (stripePrices.standard.displayAmount + stripePrices.rush.rushFeeDisplay).toFixed(2) : '388.61'}
              </div>
            </div>
          </div>
          <ul className='text-sm text-gray-600 space-y-1'>
            <li>• Everything in Standard</li>
            <li>• Priority queue processing</li>
            <li>• Expedited compliance inspection</li>
            <li>✓ 5-day completion guarantee</li>
          </ul>
        </div>
      </div>

      <div className='bg-white p-6 rounded-lg border border-gray-200'>
        <h4 className='font-semibold text-gray-900 mb-4'>Payment Method</h4>

        <div className='space-y-4 mb-6'>
          <div>
            <label className='flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50'>
              <input
                type='radio'
                name='paymentMethod'
                value='credit_card'
                checked={formData.paymentMethod === 'credit_card'}
                onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                className='h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300'
              />
              <div className='ml-3 flex-1'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-medium text-gray-700'>
                    Credit/Debit Card
                  </span>
                  <span className='text-sm text-gray-500'>
                    + ${stripePrices ? stripePrices.convenienceFee.display.toFixed(2) : '9.95'} convenience fee
                  </span>
                </div>
                <p className='text-xs text-gray-500'>
                  Secure checkout powered by Stripe
                </p>
              </div>
            </label>


          </div>

          <label className='flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50'>
            <input
              type='radio'
              name='paymentMethod'
              value='ach'
              checked={formData.paymentMethod === 'ach'}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className='h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300'
            />
            <div className='ml-3 flex-1'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium text-gray-700'>
                  Bank Transfer (ACH)
                </span>
                <span className='text-sm text-green-600'>No convenience fee</span>
              </div>
              <p className='text-xs text-gray-500'>
                Direct bank account transfer
              </p>
            </div>
          </label>
        </div>

        <div className='bg-green-50 p-4 rounded-lg border border-green-200'>
          <h5 className='font-medium text-green-900 mb-2'>Order Summary</h5>
          <div className='space-y-2 text-sm'>
            <div className='flex justify-between'>
              <span>Processing Fee:</span>
              <span>${stripePrices ? stripePrices.standard.displayAmount.toFixed(2) : '317.95'}</span>
            </div>
            {formData.packageType === 'rush' && (
              <div className='flex justify-between'>
                <span>Rush Processing:</span>
                <span>+${stripePrices ? stripePrices.rush.rushFeeDisplay.toFixed(2) : '70.66'}</span>
              </div>
            )}
            {formData.paymentMethod === 'credit_card' && (
              <div className='flex justify-between'>
                <span>Convenience Fee:</span>
                <span>+${stripePrices ? stripePrices.convenienceFee.display.toFixed(2) : '9.95'}</span>
              </div>
            )}
            <div className='border-t border-green-200 pt-2 flex justify-between font-semibold text-green-900'>
              <span>Total:</span>
              <span>${calculateTotal(formData, stripePrices)}</span>
            </div>
          </div>
        </div>

        {/* Payment Error */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{paymentError}</p>
          </div>
        )}

              {/* Payment Button */}
      <div className="flex justify-between items-center pt-6">
        <button
          onClick={() => setCurrentStep(currentStep - 1)}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        
        <button
          onClick={handlePayment}
          disabled={
            isProcessing || 
            !formData.packageType || 
            !formData.paymentMethod
          }
          className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </>
          ) : (
            formData.paymentMethod === 'credit_card' ? 'Continue to Checkout' : `Pay $${calculateTotal(formData, stripePrices)}`
          )}
        </button>
      </div>
      </div>
    </div>
  );
};

// Snackbar Component
const Snackbar = ({ isOpen, message, type = 'success', onClose }) => {
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); // Auto-close after 3 seconds
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  const icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : InfoIcon;
  const Icon = icon;

  return (
    <div className='fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300'>
      <div className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 max-w-sm`}>
        <Icon className='h-5 w-5' />
        <span className='text-sm font-medium'>{message}</span>
        <button
          onClick={onClose}
          className='ml-2 text-white hover:text-gray-200 transition-colors'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
};

// Confirmation Modal Component
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', isDestructive = true }) => {
  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg p-6 max-w-md w-full mx-4'>
        <div className='flex items-center mb-4'>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
            isDestructive ? 'bg-red-100' : 'bg-blue-100'
          }`}>
            {isDestructive ? (
              <AlertCircle className='h-6 w-6 text-red-600' />
            ) : (
              <InfoIcon className='h-6 w-6 text-blue-600' />
            )}
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-900'>{title}</h3>
          </div>
        </div>
        
        <p className='text-gray-600 mb-6'>{message}</p>
        
        <div className='flex justify-end space-x-3'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors'
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Authentication Modal Component
const AuthModal = ({ authMode, setAuthMode, setShowAuthModal, handleAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg p-8 max-w-md w-full mx-4'>
        <div className='flex justify-between items-center mb-6'>
          <h2 className='text-2xl font-bold text-green-800'>
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <button onClick={() => setShowAuthModal(false)}>
            <X className='h-6 w-6 text-gray-400' />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAuth(email, password, {
              first_name: firstName,
              last_name: lastName,
            });
          }}
        >
          {authMode === 'signup' && (
            <div className='grid grid-cols-2 gap-4 mb-4'>
              <input
                type='text'
                placeholder='First Name'
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
                required
              />
              <input
                type='text'
                placeholder='Last Name'
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
                required
              />
            </div>
          )}

          <div className='space-y-4'>
            <input
              type='email'
              placeholder='Email Address'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
              required
            />
            <input
              type='password'
              placeholder='Password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
              required
            />
          </div>

          <button
            type='submit'
            className='w-full mt-6 px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors'
          >
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className='mt-4 text-center'>
          <button
            onClick={() =>
              setAuthMode(authMode === 'signin' ? 'signup' : 'signin')
            }
            className='text-green-600 hover:text-green-800'
          >
            {authMode === 'signin'
              ? 'Need an account? Sign up'
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReviewSubmitStep = ({ formData, stripePrices, applicationId }) => {
  // Check if user just returned from payment
  const [showPaymentSuccess, setShowPaymentSuccess] = React.useState(false);
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentSuccess = urlParams.get('payment_success');
      if (paymentSuccess === 'true') {
        setShowPaymentSuccess(true);
      }
    }
  }, []);

  return (
    <div className='space-y-6'>
      {showPaymentSuccess && (
        <div className='bg-green-50 border border-green-200 rounded-lg p-6 mb-6'>
          <div className='flex items-center'>
            <CheckCircle className='h-6 w-6 text-green-600 mr-3' />
            <div>
              <h4 className='text-lg font-semibold text-green-900'>
                Payment Successful!
              </h4>
              <p className='text-sm text-green-700'>
                Your payment has been processed successfully. Please review your information below and submit your application.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className='text-center mb-8'>
        <h3 className='text-2xl font-bold text-green-900 mb-2'>
          Review & Submit
        </h3>
        <p className='text-gray-600'>
          Please review your information before submitting
        </p>
      </div>

    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
      <div className='bg-white p-6 rounded-lg border border-gray-200'>
        <h4 className='font-semibold text-gray-900 mb-4 flex items-center'>
          <Building2 className='h-5 w-5 mr-2 text-green-600' />
          Property Information
        </h4>
        <div className='space-y-2 text-sm'>
          <div>
            <span className='font-medium'>HOA:</span> {formData.hoaProperty}
          </div>
          <div>
            <span className='font-medium'>Address:</span>{' '}
            {formData.propertyAddress} {formData.unitNumber}
          </div>
          <div>
            <span className='font-medium'>Sale Price:</span> $
            {formData.salePrice
              ? Number(formData.salePrice).toLocaleString()
              : 'N/A'}
          </div>
          <div>
            <span className='font-medium'>Closing Date:</span>{' '}
            {formData.closingDate}
          </div>
        </div>
      </div>

      <div className='bg-white p-6 rounded-lg border border-gray-200'>
        <h4 className='font-semibold text-gray-900 mb-4 flex items-center'>
          <User className='h-5 w-5 mr-2 text-green-600' />
          Submitter Information
        </h4>
        <div className='space-y-2 text-sm'>
          <div>
            <span className='font-medium'>Role:</span> {formData.submitterType}
          </div>
          <div>
            <span className='font-medium'>Name:</span> {formData.submitterName}
          </div>
          <div>
            <span className='font-medium'>Email:</span>{' '}
            {formData.submitterEmail}
          </div>
          <div>
            <span className='font-medium'>Phone:</span>{' '}
            {formData.submitterPhone}
          </div>
        </div>
      </div>

      <div className='bg-white p-6 rounded-lg border border-gray-200'>
        <h4 className='font-semibold text-gray-900 mb-4 flex items-center'>
          <Users className='h-5 w-5 mr-2 text-green-600' />
          Transaction Parties
        </h4>
        <div className='space-y-2 text-sm'>
          <div>
            <span className='font-medium'>Buyer:</span> {formData.buyerName}
          </div>
          <div>
            <span className='font-medium'>Buyer Email:</span>{' '}
            {formData.buyerEmail}
          </div>
          <div>
            <span className='font-medium'>Seller:</span> {formData.sellerName}
          </div>
          <div>
            <span className='font-medium'>Seller Email:</span>{' '}
            {formData.sellerEmail}
          </div>
        </div>
      </div>

      <div className='bg-white p-6 rounded-lg border border-gray-200'>
        <h4 className='font-semibold text-gray-900 mb-4 flex items-center'>
          <CreditCard className='h-5 w-5 mr-2 text-green-600' />
          Package & Payment
        </h4>
        <div className='space-y-2 text-sm'>
          <div>
            <span className='font-medium'>Package:</span>{' '}
            {formData.packageType === 'rush'
              ? 'Rush (5 days)'
              : 'Standard (10-15 days)'}
          </div>
          <div>
            <span className='font-medium'>Payment Method:</span>{' '}
            {formData.paymentMethod === 'credit_card'
              ? 'Credit Card'
              : 'Bank Transfer'}
          </div>
          <div>
            <span className='font-medium'>Total:</span> ${calculateTotal(formData, stripePrices)}
          </div>
        </div>
      </div>
    </div>

    <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-6'>
      <div className='flex'>
        <AlertCircle className='h-5 w-5 text-yellow-400 mr-3 mt-0.5' />
        <div>
          <h5 className='font-medium text-yellow-800'>Important Information</h5>
          <div className='text-sm text-yellow-700 mt-2 space-y-1'>
            <p>
              • Your application will be processed within the selected timeframe
            </p>
            <p>• You will receive email updates throughout the process</p>
            <p>• Payment will be processed securely upon submission</p>
            <p>• All documents will be delivered electronically</p>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default function GMGResaleFlow() {
  // Get static data from context
  const { hoaProperties, stripePrices, isDataLoaded } = useAppContext();
  
  // Get auth data from context
  const { 
    user, 
    userRole, 
    isAuthenticated, 
    isLoading: authLoading,
    signIn,
    signUp,
    signOut,
    getUserProfileData
  } = useAuth();
  
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [applicationId, setApplicationId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [isPendingPayment, setIsPendingPayment] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState({
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Delete'
  });
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarData, setSnackbarData] = useState({
    message: '',
    type: 'success'
  });

  const [formData, setFormData] = useState({
    hoaProperty: '',
    propertyAddress: '',
    unitNumber: '',
    submitterType: '',
    submitterName: '',
    submitterEmail: '',
    submitterPhone: '',
    realtorLicense: '',
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    sellerName: '',
    sellerEmail: '',
    sellerPhone: '',
    salePrice: '',
    closingDate: new Date().toISOString().split('T')[0], // Default to today's date
    packageType: 'standard',
    paymentMethod: '',
    totalAmount: 317.95,
  });

  // Load applications for the current user
  const loadApplications = React.useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('applications')
        .select('*, hoa_properties(name)')
        .order('created_at', { ascending: false });

      if (userRole !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading applications:', error);
        return;
      }

      setApplications(data || []);
    } catch (error) {
      console.error('Error in loadApplications:', error);
    }
  }, [user, userRole]);

  // Load existing draft application
  const loadDraftApplication = React.useCallback(async (appId) => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, hoa_properties(name)')
        .eq('id', appId)
        .single();

      if (error) throw error;

      if (!data) {
        alert('Application not found');
        return;
      }

      // Set application ID first to prevent user profile from overriding data
      setApplicationId(appId);

      // Populate form with existing data
      const draftFormData = {
        hoaProperty: data.hoa_properties?.name || '',
        propertyAddress: data.property_address || '',
        unitNumber: data.unit_number || '',
        submitterType: data.submitter_type || '',
        submitterName: data.submitter_name || '',
        submitterEmail: data.submitter_email || '',
        submitterPhone: data.submitter_phone || '',
        realtorLicense: data.realtor_license || '',
        buyerName: data.buyer_name || '',
        buyerEmail: data.buyer_email || '',
        buyerPhone: data.buyer_phone || '',
        sellerName: data.seller_name || '',
        sellerEmail: data.seller_email || '',
        sellerPhone: data.seller_phone || '',
        salePrice: data.sale_price || '',
        closingDate: data.closing_date || '',
        packageType: data.package_type || 'standard',
        paymentMethod: data.payment_method || '',
        totalAmount: data.total_amount || 317.95,
      };

      setFormData(draftFormData);

      // Set pending payment status
      setIsPendingPayment(data.status === 'pending_payment');

      // Don't navigate to any step here - let the caller decide the step
    } catch (error) {
      console.error('Error loading draft:', error);
      alert('Error loading application draft: ' + error.message);
    }
  }, []);

  // Handle payment success redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentSuccess = urlParams.get('payment_success');
      const sessionId = urlParams.get('session_id');
      const appId = urlParams.get('app_id');

      if (paymentSuccess === 'true' && sessionId && appId) {
        // Load the application and continue to review step
        loadDraftApplication(appId).then(() => {
          setCurrentStep(5); // Go to review step
          // Clean up URL parameters
          window.history.replaceState({}, document.title, window.location.pathname);
        });
      }

      const paymentCancelled = urlParams.get('payment_cancelled');
      if (paymentCancelled === 'true' && appId) {
        // Load the application and go back to payment step
        loadDraftApplication(appId).then(() => {
          setCurrentStep(4); // Go back to payment step
          // Clean up URL parameters
          window.history.replaceState({}, document.title, window.location.pathname);
        });
      }
    }
  }, [loadDraftApplication]);

  // Simple input change handler without useCallback
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Save draft application
  const saveDraftApplication = React.useCallback(async () => {
    if (!user || currentStep < 2) return null;

    try {
      const hoaProperty = (hoaProperties || []).find(
        (h) => h.name === formData.hoaProperty
      );

      const draftData = {
        user_id: user.id,
        hoa_property_id: hoaProperty?.id,
        property_address: formData.propertyAddress,
        unit_number: formData.unitNumber,
        submitter_type: formData.submitterType,
        submitter_name: formData.submitterName,
        submitter_email: formData.submitterEmail,
        submitter_phone: formData.submitterPhone,
        realtor_license: formData.realtorLicense,
        buyer_name: formData.buyerName,
        buyer_email: formData.buyerEmail,
        buyer_phone: formData.buyerPhone,
        seller_name: formData.sellerName,
        seller_email: formData.sellerEmail,
        seller_phone: formData.sellerPhone,
        sale_price: formData.salePrice ? parseFloat(formData.salePrice) : null,
        closing_date: formData.closingDate || null,
        package_type: formData.packageType,
        payment_method: formData.paymentMethod,
        total_amount: calculateTotal(formData, stripePrices),
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (applicationId) {
        // Update existing draft
        const { data, error } = await supabase
          .from('applications')
          .update(draftData)
          .eq('id', applicationId)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from('applications')
          .insert([draftData])
          .select()
          .single();

        if (error) throw error;
        setApplicationId(data.id);
        return data;
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      return null;
    }
  }, [user, currentStep, hoaProperties, formData, stripePrices, applicationId]);

  // Memoize other handlers
  const nextStep = React.useCallback(async () => {
    if (currentStep < 5) {
      // Save draft before moving to next step
      await saveDraftApplication();
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, saveDraftApplication]);

  const prevStep = React.useCallback(() => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  }, [currentStep]);

  // Delete draft application
  const deleteDraftApplication = React.useCallback(async (appId) => {
    if (!confirm('Are you sure you want to delete this application draft?')) {
      return;
    }

    try {
      // Optimistically remove from UI first for immediate feedback
      setApplications(prev => prev.filter(app => app.id !== appId));

      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', appId);

      if (error) throw error;

      // Reload applications to ensure consistency
      await loadApplications();
      alert('Application draft deleted successfully.');
    } catch (error) {
      console.error('Error deleting draft:', error);
      // Reload applications to restore the list if deletion failed
      await loadApplications();
      alert('Error deleting application draft: ' + error.message);
    }
  }, [loadApplications]);

  // Delete unpaid application (draft or pending_payment)
  const deleteUnpaidApplication = React.useCallback((appId, status) => {
    const statusText = status === 'draft' ? 'draft' : 'pending payment application';
    
    setConfirmModalData({
      title: 'Delete Application',
      message: `Are you sure you want to delete this ${statusText}? This action cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        setShowConfirmModal(false);
        
        try {
          console.log('Attempting to delete application:', appId, 'with status:', status);

          // First, delete any related property owner forms
          const { error: formsError } = await supabase
            .from('property_owner_forms')
            .delete()
            .eq('application_id', appId);

          if (formsError) {
            console.error('Error deleting property owner forms:', formsError);
            // Continue with application deletion even if forms deletion fails
          }

          // Delete the application
          const { error } = await supabase
            .from('applications')
            .delete()
            .eq('id', appId);

          if (error) {
            console.error('Supabase delete error:', error);
            throw error;
          }

          console.log('Application deleted successfully, reloading list...');
          
          // Reload applications to refresh the list
          await loadApplications();
          
          // Show success snackbar
          setSnackbarData({
            message: `${status === 'draft' ? 'Draft' : 'Application'} deleted successfully`,
            type: 'success'
          });
          setShowSnackbar(true);
        } catch (error) {
          console.error('Error deleting application:', error);
          // Reload applications to ensure we have the correct state
          await loadApplications();
          alert('Error deleting application: ' + error.message);
        }
      }
    });
    
    setShowConfirmModal(true);
  }, [loadApplications]);

  // Reset form for new application
  const startNewApplication = React.useCallback(async () => {
    // Reset application ID first
    setApplicationId(null);
    setIsPendingPayment(false);
    
    // Get user profile data for auto-population
    let autoFillData = { submitterName: '', submitterEmail: '' };
    if (user) {
      try {
        const profileData = await getUserProfileData();
        if (profileData) {
          const fullName = [profileData.first_name, profileData.last_name].filter(Boolean).join(' ');
          autoFillData = {
            submitterName: fullName || '',
            submitterEmail: profileData.email || user.email || '',
          };
        } else {
          autoFillData.submitterEmail = user.email || '';
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
        autoFillData.submitterEmail = user.email || '';
      }
    }
    
    // Reset form data with auto-populated user info
    setFormData({
      hoaProperty: '',
      propertyAddress: '',
      unitNumber: '',
      submitterType: '',
      submitterName: autoFillData.submitterName,
      submitterEmail: autoFillData.submitterEmail,
      submitterPhone: '',
      realtorLicense: '',
      buyerName: '',
      buyerEmail: '',
      buyerPhone: '',
      sellerName: '',
      sellerEmail: '',
      sellerPhone: '',
      salePrice: '',
      closingDate: new Date().toISOString().split('T')[0], // Default to today's date
      packageType: 'standard',
      paymentMethod: '',
      totalAmount: 317.95,
    });
    
    // Navigate to first step
    setCurrentStep(1);
  }, [user, getUserProfileData]);

  // Load applications when user or role changes
  useEffect(() => {
    if (user && userRole) {
      loadApplications();
    }
  }, [user, userRole]);

  // Add this function to your application submission process
  // This should be called after an application is successfully created

  const createPropertyOwnerForms = async (applicationId, applicationData) => {
    try {
      console.log(
        '🔧 Creating property owner forms for application:',
        applicationId
      );

      // Generate unique access tokens
      const inspectionToken = crypto.randomUUID();
      const resaleToken = crypto.randomUUID();

      // Determine recipient email (property owner email, or fallback to submitter)
      const recipientEmail =
        applicationData.hoa_properties?.property_owner_email ||
        applicationData.submitter_email ||
        'admin@gmgva.com';

      // Create both forms at once
      const formsToCreate = [
        {
          application_id: applicationId,
          form_type: 'inspection_form',
          status: 'not_started',
          access_token: inspectionToken,
          recipient_email: recipientEmail,
          expires_at: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(), // 30 days from now
          created_at: new Date().toISOString(),
        },
        {
          application_id: applicationId,
          form_type: 'resale_certificate',
          status: 'not_started',
          access_token: resaleToken,
          recipient_email: recipientEmail,
          expires_at: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(), // 30 days from now
          created_at: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase
        .from('property_owner_forms')
        .insert(formsToCreate)
        .select();

      if (error) {
        console.error('❌ Error creating forms:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to create property owner forms:', error);
      throw error;
    }
  };

  const handleAuth = React.useCallback(
    async (email, password, userData = {}) => {
      try {
        if (authMode === 'signin') {
          await signIn(email, password);
          setShowAuthModal(false);
        } else {
          await signUp(email, password, userData);
          alert('Check your email for verification link!');
          setShowAuthModal(false);
        }
      } catch (error) {
        console.error('🔐 Auth error:', error);
        alert(error.message);
      }
    },
    [authMode, signIn, signUp]
  );

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    setCurrentStep(0);
    
    // Clear form fields when signing out
    setFormData(prev => ({
      ...prev,
      submitterName: '',
      submitterEmail: '',
    }));
  }, [signOut]);



  const handleSubmit = async () => {
    try {
      if (applicationId) {
        // Update existing application to under_review status
        const { data, error } = await supabase
          .from('applications')
          .update({
            status: 'under_review',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', applicationId)
          .select()
          .single();

        if (error) throw error;

        // CREATE THE PROPERTY OWNER FORMS if not already created
        await createPropertyOwnerForms(data.id, data);

        // Send confirmation email
        try {
          const hoaProperty = (hoaProperties || []).find(
            (h) => h.id === data.hoa_property_id
          );
          
          const emailResponse = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailType: 'application_submission',
              applicationId: data.id,
              customerName: data.submitter_name,
              customerEmail: data.submitter_email,
              propertyAddress: data.property_address,
              packageType: data.package_type,
              totalAmount: data.total_amount,
              hoaName: hoaProperty?.name || 'Unknown HOA',
              submitterType: data.submitter_type,
            }),
          });

          if (!emailResponse.ok) {
            throw new Error('Failed to send confirmation email');
          }
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Don't fail the submission if email fails
        }

        // Show success snackbar
        setSnackbarData({
          message: 'Application submitted successfully! You will receive a confirmation email shortly.',
          type: 'success'
        });
        setShowSnackbar(true);
      } else {
        // Create new application (fallback for non-payment flow)
        const hoaProperty = (hoaProperties || []).find(
          (h) => h.name === formData.hoaProperty
        );

        const applicationData = {
          user_id: user.id,
          hoa_property_id: hoaProperty?.id,
          property_address: formData.propertyAddress,
          unit_number: formData.unitNumber,
          submitter_type: formData.submitterType,
          submitter_name: formData.submitterName,
          submitter_email: formData.submitterEmail,
          submitter_phone: formData.submitterPhone,
          realtor_license: formData.realtorLicense,
          buyer_name: formData.buyerName,
          buyer_email: formData.buyerEmail,
          buyer_phone: formData.buyerPhone,
          seller_name: formData.sellerName,
          seller_email: formData.sellerEmail,
          seller_phone: formData.sellerPhone,
          sale_price: formData.salePrice ? parseFloat(formData.salePrice) : null,
          closing_date: formData.closingDate || null,
          package_type: formData.packageType,
          payment_method: formData.paymentMethod,
          total_amount: calculateTotal(formData, stripePrices),
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('applications')
          .insert([applicationData])
          .select();

        if (error) throw error;

        // CREATE THE PROPERTY OWNER FORMS
        await createPropertyOwnerForms(data[0].id, data[0]);

        // Send confirmation email
        try {
          const hoaProperty = (hoaProperties || []).find(
            (h) => h.id === data[0].hoa_property_id
          );
          
          const emailResponse = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailType: 'application_submission',
              applicationId: data[0].id,
              customerName: data[0].submitter_name,
              customerEmail: data[0].submitter_email,
              propertyAddress: data[0].property_address,
              packageType: data[0].package_type,
              totalAmount: data[0].total_amount,
              hoaName: hoaProperty?.name || 'Unknown HOA',
              submitterType: data[0].submitter_type,
            }),
          });

          if (!emailResponse.ok) {
            throw new Error('Failed to send confirmation email');
          }
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Don't fail the submission if email fails
        }

        // Show success snackbar
        setSnackbarData({
          message: 'Application submitted successfully! You will receive a confirmation email shortly.',
          type: 'success'
        });
        setShowSnackbar(true);
      }

      setCurrentStep(0);
      await loadApplications();
      setApplicationId(null);

      // Reset form
      setFormData({
        hoaProperty: '',
        propertyAddress: '',
        unitNumber: '',
        submitterType: '',
        submitterName: '',
        submitterEmail: '',
        submitterPhone: '',
        realtorLicense: '',
        buyerName: '',
        buyerEmail: '',
        buyerPhone: '',
        sellerName: '',
        sellerEmail: '',
        sellerPhone: '',
        salePrice: '',
        closingDate: new Date().toISOString().split('T')[0], // Default to today's date
        packageType: 'standard',
        paymentMethod: '',
        totalAmount: 317.95,
      });
    } catch (error) {
      console.error('Error submitting application:', error);
      alert('Error submitting application: ' + error.message);
    }
  };

  // Dashboard Component - Updated with role-based access
  const Dashboard = () => {
    const statusConfig = {
      draft: {
        color: 'bg-gray-100 text-gray-800',
        icon: Clock,
        label: 'Draft',
      },
      pending_payment: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: DollarSign,
        label: 'Pending Payment',
      },
      submitted: {
        color: 'bg-blue-100 text-blue-800',
        icon: CheckCircle,
        label: 'Submitted',
      },
      under_review: {
        color: 'bg-blue-100 text-blue-800',
        icon: Clock,
        label: 'Under Review',
      },
      compliance_pending: {
        color: 'bg-orange-100 text-orange-800',
        icon: AlertCircle,
        label: 'Compliance Pending',
      },
      approved: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Completed',
      },
      rejected: {
        color: 'bg-red-100 text-red-800',
        icon: AlertCircle,
        label: 'Rejected',
      },
    };

    // For regular users, show a cleaner welcome screen
    if (userRole !== 'admin') {
      return (
        <div className='space-y-8'>
          {/* Welcome Section */}
          <div className='text-center py-12'>
            <div className='w-20 h-20 bg-green-700 rounded-full flex items-center justify-center mx-auto mb-6'>
              <Building2 className='h-10 w-10 text-white' />
            </div>
            <h2 className='text-3xl font-bold text-gray-900 mb-4'>
              Welcome to GMG ResaleFlow
            </h2>
            <p className='text-lg text-gray-600 mb-8 max-w-2xl mx-auto'>
              Your streamlined solution for Virginia HOA resale certificates.
              Get your documents processed quickly and efficiently.
            </p>
            {isAuthenticated ? (
              <button
                onClick={startNewApplication}
                className='bg-green-700 text-white px-8 py-4 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-3 mx-auto text-lg font-semibold'
              >
                <FileText className='h-6 w-6' />
                Start New Application
              </button>
            ) : (
              <div className='space-y-4'>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuthModal(true);
                  }}
                  className='bg-green-700 text-white px-8 py-4 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-3 mx-auto text-lg font-semibold'
                >
                  <UserPlus className='h-6 w-6' />
                  Sign Up to Start Application
                </button>
                <p className='text-sm text-gray-500'>
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setAuthMode('signin');
                      setShowAuthModal(true);
                    }}
                    className='text-green-600 hover:text-green-700 font-medium'
                  >
                    Sign in here
                  </button>
                </p>
              </div>
            )}
          </div>

          {/* Process Steps */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8'>
            <h3 className='text-2xl font-bold text-gray-900 mb-6 text-center'>
              How It Works
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
              <div className='text-center'>
                <div className='w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                  <FileText className='h-8 w-8 text-blue-600' />
                </div>
                <h4 className='text-lg font-semibold text-gray-900 mb-2'>
                  1. Submit Application
                </h4>
                <p className='text-gray-600'>
                  Provide property details, transaction information, and select
                  your processing speed.
                </p>
              </div>
              <div className='text-center'>
                <div className='w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                  <Clock className='h-8 w-8 text-yellow-600' />
                </div>
                <h4 className='text-lg font-semibold text-gray-900 mb-2'>
                  2. We Process
                </h4>
                <p className='text-gray-600'>
                  Our team handles compliance inspections and gathers all
                  required HOA documents.
                </p>
              </div>
              <div className='text-center'>
                <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                  <CheckCircle className='h-8 w-8 text-green-600' />
                </div>
                <h4 className='text-lg font-semibold text-gray-900 mb-2'>
                  3. Receive Documents
                </h4>
                <p className='text-gray-600'>
                  Get your complete resale certificate package delivered
                  electronically.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div className='bg-white p-8 rounded-lg shadow-sm border border-gray-200'>
              <h4 className='text-xl font-semibold text-gray-900 mb-2'>
                Standard Processing
              </h4>
              <div className='text-3xl font-bold text-green-600 mb-4'>
                $317.95
              </div>
              <p className='text-gray-600 mb-4'>10-15 business days</p>
              <ul className='space-y-2 text-sm text-gray-600'>
                <li>✓ Complete Virginia Resale Certificate</li>
                <li>✓ HOA Documents Package</li>
                <li>✓ Compliance Inspection Report</li>
                <li>✓ Digital & Print Delivery</li>
              </ul>
            </div>
            <div className='bg-orange-50 p-8 rounded-lg shadow-sm border border-orange-200'>
              <div className='flex items-center justify-between mb-2'>
                <h4 className='text-xl font-semibold text-gray-900'>
                  Rush Processing
                </h4>
                <span className='px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full font-medium'>
                  PRIORITY
                </span>
              </div>
              <div className='text-3xl font-bold text-orange-600 mb-4'>
                $388.61
              </div>
              <p className='text-gray-600 mb-4'>5 business days</p>
              <ul className='space-y-2 text-sm text-gray-600'>
                <li>✓ Everything in Standard</li>
                <li>✓ Priority queue processing</li>
                <li>✓ Expedited compliance inspection</li>
                <li>✓ 5-day completion guarantee</li>
              </ul>
            </div>
          </div>

          {/* Recent Applications - Only show if user has any */}
          {applications.length > 0 && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200'>
              <div className='px-6 py-4 border-b border-gray-200'>
                <h3 className='text-lg font-medium text-gray-900'>
                  Your Recent Applications
                </h3>
              </div>
              <div className='divide-y divide-gray-200'>
                {applications.slice(0, 3).map((app) => {
                  const StatusIcon = statusConfig[app.status]?.icon || Clock;
                  const statusStyle =
                    statusConfig[app.status]?.color ||
                    'bg-gray-100 text-gray-800';
                  const statusLabel =
                    statusConfig[app.status]?.label || app.status;

                  // Check if application can be deleted (draft or pending_payment)
                  const canDelete = app.status === 'draft' || app.status === 'pending_payment';

                  return (
                    <div key={app.id} className='p-6 hover:bg-gray-50'>
                      <div className='flex items-center justify-between'>
                        <div className='flex-1'>
                          <h4 className='text-sm font-medium text-gray-900'>
                            {app.hoa_properties?.name} - {app.property_address}
                          </h4>
                          <p className='text-sm text-gray-500'>
                            Submitted:{' '}
                            {app.submitted_at
                              ? new Date(app.submitted_at).toLocaleDateString()
                              : 'Draft'}
                          </p>
                          {app.total_amount && (
                            <p className='text-sm text-gray-500'>
                              Amount: ${app.total_amount}
                            </p>
                          )}
                        </div>
                        <div className='flex items-center space-x-3'>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}
                          >
                            <StatusIcon className='h-3 w-3 mr-1' />
                            {statusLabel}
                          </span>
                          <div className='flex space-x-2'>
                            {(app.status === 'draft' || app.status === 'pending_payment') && (
                              <button
                                onClick={() => {
                                  loadDraftApplication(app.id).then(() => {
                                    // If pending payment, go to payment step; if draft, go to first step
                                    setCurrentStep(app.status === 'pending_payment' ? 4 : 1);
                                  });
                                }}
                                className='text-green-600 hover:text-green-900 text-sm flex items-center'
                                title='Resume Application'
                              >
                                <FileText className='h-4 w-4 mr-1' />
                                Resume
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deleteUnpaidApplication(app.id, app.status)}
                                className='text-red-600 hover:text-red-900 text-sm flex items-center'
                                title={`Delete ${app.status === 'draft' ? 'Draft' : 'Application'}`}
                              >
                                <Trash2 className='h-4 w-4 mr-1' />
                                Delete
                              </button>
                            )}
                            {!canDelete && app.status !== 'draft' && app.status !== 'pending_payment' && (
                              <span className='text-gray-400 text-sm'>—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Admin Dashboard (original code)
    return (
      <div className='space-y-6'>
        <div className='flex justify-between items-center'>
          <h2 className='text-2xl font-bold text-gray-900'>
            Resale Applications Dashboard
          </h2>
          <button
            onClick={startNewApplication}
            className='bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2'
          >
            <FileText className='h-5 w-5' />
            New Resale Application
          </button>
        </div>

        {/* Dashboard metrics for admins */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
          <div className='bg-white p-6 rounded-lg shadow border-l-4 border-green-700'>
            <div className='flex items-center'>
              <FileText className='h-8 w-8 text-green-700' />
              <div className='ml-3'>
                <p className='text-sm font-medium text-gray-500'>
                  Total Applications
                </p>
                <p className='text-2xl font-semibold text-gray-900'>
                  {applications.length}
                </p>
              </div>
            </div>
          </div>
          <div className='bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500'>
            <div className='flex items-center'>
              <Clock className='h-8 w-8 text-yellow-500' />
              <div className='ml-3'>
                <p className='text-sm font-medium text-gray-500'>
                  Under Review
                </p>
                <p className='text-2xl font-semibold text-gray-900'>
                  {
                    applications.filter((app) => app.status === 'under_review')
                      .length
                  }
                </p>
              </div>
            </div>
          </div>
          <div className='bg-white p-6 rounded-lg shadow border-l-4 border-green-500'>
            <div className='flex items-center'>
              <CheckCircle className='h-8 w-8 text-green-500' />
              <div className='ml-3'>
                <p className='text-sm font-medium text-gray-500'>Completed</p>
                <p className='text-2xl font-semibold text-gray-900'>
                  {
                    applications.filter((app) => app.status === 'approved')
                      .length
                  }
                </p>
              </div>
            </div>
          </div>
          <div className='bg-white p-6 rounded-lg shadow border-l-4 border-green-600'>
            <div className='flex items-center'>
              <DollarSign className='h-8 w-8 text-green-600' />
              <div className='ml-3'>
                <p className='text-sm font-medium text-gray-500'>
                  Revenue (Month)
                </p>
                <p className='text-2xl font-semibold text-gray-900'>
                  $
                  {applications
                    .reduce((sum, app) => sum + (app.total_amount || 0), 0)
                    .toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg shadow overflow-hidden'>
          <div className='px-6 py-4 border-b border-gray-200 bg-green-50'>
            <h3 className='text-lg font-medium text-green-900'>
              All Applications
            </h3>
          </div>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Property
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Submitter
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Package
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Status
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Submitted
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Total
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {applications.map((app) => {
                  const StatusIcon = statusConfig[app.status]?.icon || Clock;
                  const statusStyle =
                    statusConfig[app.status]?.color ||
                    'bg-gray-100 text-gray-800';
                  const statusLabel =
                    statusConfig[app.status]?.label || app.status;

                  return (
                    <tr key={app.id} className='hover:bg-gray-50'>
                      <td className='px-6 py-4 text-sm text-gray-900 max-w-xs'>
                        <div className='truncate'>
                          {app.hoa_properties?.name} - {app.property_address}
                        </div>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                        {app.submitter_name} ({app.submitter_type})
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            app.package_type === 'rush'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {app.package_type === 'rush'
                            ? 'Rush (5 days)'
                            : 'Standard'}
                        </span>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}
                        >
                          <StatusIcon className='h-3 w-3 mr-1' />
                          {statusLabel}
                        </span>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                        {app.submitted_at
                          ? new Date(app.submitted_at).toLocaleDateString()
                          : 'Draft'}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>
                        ${app.total_amount || 0}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm font-medium'>
                                                <div className='flex space-x-2'>
                          {(app.status === 'draft' || app.status === 'pending_payment') && (
                            <>
                              <button
                                onClick={() => {
                                  loadDraftApplication(app.id).then(() => {
                                    // If pending payment, go to payment step; if draft, go to first step
                                    setCurrentStep(app.status === 'pending_payment' ? 4 : 1);
                                  });
                                }}
                                className='text-green-600 hover:text-green-900 flex items-center'
                                title='Resume Application'
                              >
                                <FileText className='h-4 w-4 mr-1' />
                                Resume
                              </button>
                              <button
                                onClick={() => deleteUnpaidApplication(app.id, app.status)}
                                className='text-red-600 hover:text-red-900 flex items-center'
                                title={`Delete ${app.status === 'draft' ? 'Draft' : 'Unpaid Application'}`}
                              >
                                <Trash2 className='h-4 w-4 mr-1' />
                                Delete
                              </button>
                            </>
                          )}
                          {app.status !== 'draft' && app.status !== 'pending_payment' && (
                            <span className='text-gray-400'>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Form Step Components
  const steps = [
    { number: 1, title: 'HOA Selection', icon: Building2 },
    { number: 2, title: 'Submitter Info', icon: User },
    { number: 3, title: 'Transaction Details', icon: Users },
    { number: 4, title: 'Package & Payment', icon: CreditCard },
    { number: 5, title: 'Review & Submit', icon: CheckCircle },
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <HOASelectionStep
            formData={formData}
            handleInputChange={handleInputChange}
            hoaProperties={hoaProperties}
          />
        );
      case 2:
        return (
          <SubmitterInfoStep
            formData={formData}
            handleInputChange={handleInputChange}
          />
        );
      case 3:
        return (
          <TransactionDetailsStep
            formData={formData}
            handleInputChange={handleInputChange}
          />
        );
      case 4:
        return (
          <PackagePaymentStep
            formData={formData}
            handleInputChange={handleInputChange}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            applicationId={applicationId}
            user={user}
            hoaProperties={hoaProperties}
            setShowAuthModal={setShowAuthModal}
            stripePrices={stripePrices}
          />
        );
      case 5:
        return (
          <ReviewSubmitStep
            formData={formData}
            stripePrices={stripePrices}
            applicationId={applicationId}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  // Loading state - only wait for auth context to initialize
  if (authLoading) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='w-16 h-16 bg-green-700 rounded-lg flex items-center justify-center mx-auto mb-4'>
            <Building2 className='h-8 w-8 text-white' />
          </div>
          <h2 className='text-xl font-semibold text-gray-900'>
            Loading GMG ResaleFlow...
          </h2>
          <p className='text-sm text-gray-600 mt-2'>
            Authenticating...
          </p>
        </div>
      </div>
    );
  }

  // Main application render - Dashboard view
  if (currentStep === 0) {
    return (
      <div className='min-h-screen bg-gray-50'>
        {/* Header */}
        <div className='bg-white shadow-sm border-b'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex justify-between items-center py-4'>
              <div className='flex items-center space-x-4'>
                <div className='flex items-center space-x-3'>
                  <div className='w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center'>
                    <Building2 className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <h1 className='text-xl font-bold text-green-900'>
                      Goodman Management Group
                    </h1>
                    <p className='text-sm text-gray-600'>
                      Resale Certificate System
                    </p>
                  </div>
                </div>
              </div>
              <div className='flex items-center space-x-4'>
                {isAuthenticated ? (
                  <div className='flex items-center space-x-4'>
                    <span className='text-sm text-gray-600'>
                      Welcome, {user?.email}
                      {userRole && (
                        <span className='ml-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded'>
                          {userRole}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setCurrentStep(99)}
                      className='text-blue-600 hover:text-blue-800 px-3 py-1 text-sm'
                    >
                      Test Input
                    </button>
                    <button
                      onClick={handleSignOut}
                      className='text-gray-600 hover:text-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors'
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className='bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition-colors'
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <Dashboard />
        </div>

        {/* Footer */}
        <div className='bg-green-900 text-white py-8 mt-12'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex flex-col md:flex-row justify-between items-center'>
              <div className='mb-4 md:mb-0'>
                <h3 className='text-lg font-semibold'>
                  Goodman Management Group
                </h3>
                <p className='text-green-200'>
                  Professional HOA Management & Resale Services
                </p>
              </div>
              <div className='text-center md:text-right'>
                <p className='text-green-200'>Questions? Contact us:</p>
                <p className='font-medium'>resales@gmgva.com</p>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Modal */}
        {showAuthModal && (
          <AuthModal
            authMode={authMode}
            setAuthMode={setAuthMode}
            setShowAuthModal={setShowAuthModal}
            handleAuth={handleAuth}
          />
        )}

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={confirmModalData.onConfirm}
          title={confirmModalData.title}
          message={confirmModalData.message}
          confirmText={confirmModalData.confirmText}
          isDestructive={true}
        />

        {/* Snackbar */}
        <Snackbar
          isOpen={showSnackbar}
          message={snackbarData.message}
          type={snackbarData.type}
          onClose={() => setShowSnackbar(false)}
        />
      </div>
    );
  }

  // Form view
  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <div className='bg-white shadow-sm border-b'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-4'>
            <div className='flex items-center space-x-4'>
              <div className='flex items-center space-x-3'>
                <div className='w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center'>
                  <Building2 className='h-6 w-6 text-white' />
                </div>
                <div>
                  <h1 className='text-xl font-bold text-green-900'>
                    Goodman Management Group
                  </h1>
                  <p className='text-sm text-gray-600'>
                    Resale Certificate System
                  </p>
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              <button
                onClick={() => setCurrentStep(0)}
                className='text-gray-600 hover:text-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors'
              >
                {userRole === 'admin' ? 'Dashboard' : 'Home'}
              </button>
              {isAuthenticated && (
                <div className='flex items-center space-x-2'>
                  <div className='w-3 h-3 bg-green-400 rounded-full'></div>
                  <span className='text-sm text-gray-600'>{user?.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className='max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20'>
        {/* Progress Steps */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;

              return (
                <div key={step.number} className='flex items-center'>
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                      isActive
                        ? 'border-green-600 bg-green-600 text-white'
                        : isCompleted
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500'
                    }`}
                  >
                    <StepIcon className='h-6 w-6' />
                  </div>
                  <span
                    className={`ml-3 text-sm font-medium ${
                      isActive
                        ? 'text-green-600'
                        : isCompleted
                        ? 'text-green-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-6 ${
                        currentStep > step.number
                          ? 'bg-green-600'
                          : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8'>
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className='flex justify-between mb-12'>
          {currentStep !== 5 ? (
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className='px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
            >
              Previous
            </button>
          ) : (
            <div></div>
          )}

          {currentStep < 5 && currentStep !== 4 ? (
            <button
              onClick={nextStep}
              disabled={
                (currentStep === 1 &&
                  (!formData.hoaProperty || !formData.propertyAddress)) ||
                (currentStep === 2 &&
                  (!formData.submitterType ||
                    !formData.submitterName ||
                    !formData.submitterEmail)) ||
                (currentStep === 3 &&
                  (!formData.buyerName ||
                    !formData.sellerName ||
                    !formData.salePrice))
              }
              className='px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
            >
              Continue
              <FileText className='h-4 w-4' />
            </button>
          ) : currentStep === 5 ? (
            <button
              onClick={handleSubmit}
              className='px-8 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2'
            >
              <CheckCircle className='h-5 w-5' />
              {applicationId ? 'Submit Application' : `Submit Application & Pay $${calculateTotal(formData, stripePrices)}`}
            </button>
          ) : null}
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          authMode={authMode}
          setAuthMode={setAuthMode}
          setShowAuthModal={setShowAuthModal}
          handleAuth={handleAuth}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmModalData.onConfirm}
        title={confirmModalData.title}
        message={confirmModalData.message}
        confirmText={confirmModalData.confirmText}
        isDestructive={true}
      />

      {/* Snackbar */}
      <Snackbar
        isOpen={showSnackbar}
        message={snackbarData.message}
        type={snackbarData.type}
        onClose={() => setShowSnackbar(false)}
      />
    </div>
  );
}