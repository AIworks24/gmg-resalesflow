import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { loadStripe } from '@stripe/stripe-js';
import { getStripeWithFallback } from '../lib/stripe';
import { getTestModeFromRequest, setTestModeCookie, getTestModeFromCookie } from '../lib/stripeMode';
import { useAppContext } from '../lib/AppContext';
import { useApplicantAuth } from '../providers/ApplicantAuthProvider';
import useApplicantAuthStore from '../stores/applicantAuthStore';
// Removed pricingUtils import - using database-driven pricing instead
import { 
  determineApplicationType, 
  getApplicationTypePricing, 
  getFormSteps, 
  getFieldRequirements, 
  getApplicationTypeMessaging,
  calculateTotalAmount,
  isPaymentRequired 
} from '../lib/applicationTypes';
import { getPricing } from '../lib/pricingConfig';
import { formatDate, formatDateTime } from '../lib/timeUtils';
import Image from 'next/image';
import companyLogo from '../assets/company_logo.png';
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
  Briefcase,
  ChevronDown,
  ChevronUp,
  Filter,
  Calendar,
  Plus,
  ArrowRight,
} from 'lucide-react';

// Initialize Stripe with error handling
const stripePromise = (() => {
  try {
    return loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
    );
  } catch (error) {
    console.warn('Failed to initialize Stripe:', error);
    return Promise.reject(error);
  }
})();

// Check if ACH payment option is enabled (defaults to false)
const ACH_OPTION_ENABLED = process.env.NEXT_PUBLIC_ACH_OPTION === 'true' || process.env.NEXT_PUBLIC_ACH_OPTION === 'TRUE';

// Helper function to get forced price for a property (synchronous check)
const getForcedPriceSync = (property) => {
  if (property && property.force_price_enabled && property.force_price_value !== null && property.force_price_value >= 0) {
    return parseFloat(property.force_price_value);
  }
  return null;
};

// Helper function to check if forced price should apply
// Force price ONLY applies when submitterType is 'builder' AND public offering is NOT requested
const shouldApplyForcedPrice = (submitterType, publicOffering = false) => {
  return submitterType === 'builder' && !publicOffering;
};

// Helper function to calculate total amount
// Synchronous calculateTotal function for display purposes (approximation only)
const calculateTotal = (formData, stripePrices, hoaProperties) => {
  // Lender Questionnaire pricing - check FIRST (even for multi-community, treat as single application)
  if (formData.submitterType === 'lender_questionnaire') {
    const pricing = getPricing('lender_questionnaire', formData.packageType === 'rush');
    let total = pricing.total / 100; // Convert cents to dollars
    if (formData.paymentMethod === 'credit_card' && total > 0) {
      total += 9.95; // Credit card convenience fee
    }
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }

  // Check for multi-community pricing (skip for lender_questionnaire)
  if (formData.hoaProperty && hoaProperties) {
    const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
    if (selectedProperty && selectedProperty.is_multi_community) {
      // Multi-community pricing: 3 properties × base price + rush fees + convenience fee
      // Note: Forced prices for multi-community are handled in calculateTotalDatabase
      const basePricePerProperty = 317.95;
      const propertyCount = 3; // Primary + 2 linked properties
      const rushFeePerProperty = formData.packageType === 'rush' ? 70.66 : 0;
      const convenienceFee = formData.paymentMethod === 'credit_card' ? 9.95 : 0;
      
      const total = (basePricePerProperty + rushFeePerProperty) * propertyCount + convenienceFee;
      return Math.round(total * 100) / 100;
    }
  }

  // Public Offering Statement pricing
  if (formData.submitterType === 'builder' && formData.publicOffering) {
    let total = 200.0;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card' && total > 0) total += 9.95;
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }
  if (formData.submitterType === 'settlement') {
    // Settlement agents - approximate pricing for display
    // Note: Actual pricing comes from database via calculateTotalDatabase()
    const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
    
    // Debug logging removed
    
    if (selectedProperty && selectedProperty.location) {
      const location = selectedProperty.location.toUpperCase();
      const isRush = formData.packageType === 'rush';
      
      if (location.includes('VA') || location.includes('VIRGINIA')) {
        // Virginia: FREE standard, $70.66 rush
        let total = isRush ? 70.66 : 0;
        // Only add credit card fee if total > 0 (not for free transactions)
        if (formData.paymentMethod === 'credit_card' && total > 0) {
          total += 9.95; // Credit card fee
        }
        return Math.round(total * 100) / 100; // Round to 2 decimal places
      } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
        // North Carolina: $450 standard, $550 rush
        let total = isRush ? 550.00 : 450.00;
        if (formData.paymentMethod === 'credit_card') {
          total += 9.95; // Credit card fee
        }
        return Math.round(total * 100) / 100; // Round to 2 decimal places
      }
    }
    
    // Fallback pricing for settlement agents
    console.warn('Could not determine property state for settlement pricing, using fallback');
    return 200.00;
  }
  
  // Check for forced price override (single property) - ONLY for builder/developer WITHOUT public offering
  if (shouldApplyForcedPrice(formData.submitterType, formData.publicOffering) && formData.hoaProperty && hoaProperties) {
    const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
    if (selectedProperty) {
      const forcedPrice = getForcedPriceSync(selectedProperty);
      if (forcedPrice !== null) {
        // Forced price overrides base price, but rush fees still apply
        let total = forcedPrice;
        if (formData.packageType === 'rush') {
          total += stripePrices ? stripePrices.rush.rushFeeDisplay : 70.66;
        }
        if (formData.paymentMethod === 'credit_card' && total > 0) {
          total += stripePrices ? stripePrices.convenienceFee.display : 9.95;
        }
        return Math.round(total * 100) / 100;
      }
    }
  }
  
  // Regular pricing for non-settlement submitters
  const basePrice = 317.95;
  
  if (!stripePrices) {
    // Fallback to hardcoded prices if Stripe prices not loaded yet
    let total = basePrice;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card' && total > 0) total += 9.95;
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }

  // Use regular pricing
  let total = stripePrices.standard.displayAmount;
  if (formData.packageType === 'rush') {
    total += stripePrices.rush.rushFeeDisplay;
  }
  if (formData.paymentMethod === 'credit_card' && total > 0) {
    total += stripePrices.convenienceFee.display;
  }
  return Math.round(total * 100) / 100; // Round to 2 decimal places
};

// Async calculateTotalDatabase function using database-driven pricing for payment logic
const calculateTotalDatabase = async (formData, hoaProperties, applicationType) => {
  try {
    // Lender Questionnaire pricing - check FIRST (even for multi-community, treat as single application)
    if (applicationType === 'lender_questionnaire') {
      const { getPricing } = await import('../lib/pricingConfig');
      const pricing = getPricing('lender_questionnaire', formData.packageType === 'rush');
      let total = pricing.total / 100; // Convert cents to dollars
      if (formData.paymentMethod === 'credit_card' && total > 0) {
        total += 9.95; // Credit card convenience fee
      }
      return total;
    }

    // Check for multi-community pricing (skip for lender_questionnaire)
    if (formData.hoaProperty && hoaProperties) {
      const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
      if (selectedProperty && selectedProperty.is_multi_community) {
        // Import multi-community utilities
        const { calculateMultiCommunityPricing } = await import('../lib/multiCommunityUtils');
        
        // Calculate multi-community pricing (includes forced price checks per property)
        // Pass submitterType and publicOffering to check if forced price applies
        const pricing = await calculateMultiCommunityPricing(
          selectedProperty.id,
          formData.packageType,
          applicationType,
          null, // supabaseClient
          formData.submitterType,
          formData.publicOffering
        );
        
        // Add convenience fee if credit card and total > 0
        const convenienceFee = (formData.paymentMethod === 'credit_card' && pricing.total > 0) ? 9.95 : 0;
        return pricing.total + convenienceFee;
      }
    }
    
    // Single property pricing - check for forced price first (ONLY for builder/developer WITHOUT public offering)
    if (shouldApplyForcedPrice(formData.submitterType, formData.publicOffering) && formData.hoaProperty && hoaProperties) {
      const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
      if (selectedProperty) {
        const forcedPrice = getForcedPriceSync(selectedProperty);
        if (forcedPrice !== null) {
          // Forced price overrides base price, but rush fees still apply
          let total = forcedPrice;
          if (formData.packageType === 'rush') {
            // Add rush fee (70.66 for standard, 100 for NC settlement)
            const { getPricing } = await import('../lib/pricingConfig');
            const pricing = getPricing(applicationType, true);
            total += pricing.rushFee / 100; // Convert cents to dollars
          }
          if (formData.paymentMethod === 'credit_card' && total > 0) {
            total += 9.95;
          }
          return total;
        }
      }
    }
    
    // Single property pricing - standard logic
    const { calculateTotalAmount } = await import('../lib/applicationTypes');
    
    // Calculate total using database-driven pricing
    const total = await calculateTotalAmount(
      applicationType,
      formData.packageType,
      formData.paymentMethod
    );
    
    return total;
  } catch (error) {
    console.error('Error calculating total with database pricing:', error);
    
    // Fallback to synchronous calculation for safety
    return calculateTotal(formData, null, hoaProperties);
  }
};

// Move form step components outside the main component to prevent recreation
const HOASelectionStep = React.memo(
  ({ formData, handleInputChange, hoaProperties }) => {
    const [query, setQuery] = React.useState('');
    const [showDropdown, setShowDropdown] = React.useState(false);
    const [multiCommunityNotification, setMultiCommunityNotification] = React.useState(null);
    const [linkedProperties, setLinkedProperties] = React.useState([]);
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
    const selectHOA = async (hoa) => {
      handleInputChange('hoaProperty', hoa.name);
      setQuery(hoa.name + (hoa.location ? ` - ${hoa.location}` : ''));
      setShowDropdown(false);
      
      // Check if this is a multi-community property
      if (hoa.is_multi_community) {
        try {
          // Import the multi-community utilities
          const { getLinkedProperties, generateMultiCommunityNotification, calculateMultiCommunityPricing } = await import('../lib/multiCommunityUtils');
          
          // Get linked properties
          const linked = await getLinkedProperties(hoa.id);
          setLinkedProperties(linked);
          
          // Calculate pricing for multi-community
          const pricing = await calculateMultiCommunityPricing(hoa.id, formData.packageType || 'standard', 'standard', null, formData.submitterType, formData.publicOffering);
          
          // Generate notification
          const notification = generateMultiCommunityNotification(hoa.id, linked, pricing);
          setMultiCommunityNotification(notification);
        } catch (error) {
          console.error('Error loading multi-community data:', error);
          // Show a basic notification if we can't load detailed data
          setMultiCommunityNotification({
            type: 'multi_community',
            title: 'Multi-Community Association Detected',
            message: 'This property is part of a Master Association. Additional documents and fees will be included.',
            showWarning: true
          });
        }
      } else {
        // Clear multi-community notification if property is not multi-community
        setMultiCommunityNotification(null);
        setLinkedProperties([]);
      }
    };

    // Keep input in sync with formData
    React.useEffect(() => {
      if (!formData.hoaProperty) {
        setQuery('');
        setMultiCommunityNotification(null);
        setLinkedProperties([]);
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

    // Restore multi-community notification when formData.hoaProperty changes
    React.useEffect(() => {
      if (formData.hoaProperty && hoaProperties.length > 0) {
        const selectedHOA = hoaProperties.find(hoa => hoa.name === formData.hoaProperty);
        if (selectedHOA && selectedHOA.is_multi_community && !multiCommunityNotification) {
          // Restore multi-community state
          const restoreMultiCommunity = async () => {
            try {
              const { getLinkedProperties, generateMultiCommunityNotification, calculateMultiCommunityPricing } = await import('../lib/multiCommunityUtils');
              
              const linked = await getLinkedProperties(selectedHOA.id);
              setLinkedProperties(linked);
              
              const pricing = await calculateMultiCommunityPricing(selectedHOA.id, formData.packageType || 'standard', 'standard', null, formData.submitterType, formData.publicOffering);
              const notification = generateMultiCommunityNotification(selectedHOA.id, linked, pricing);
              setMultiCommunityNotification(notification);
            } catch (error) {
              console.error('Error restoring multi-community data:', error);
              setMultiCommunityNotification({
                type: 'multi_community',
                title: 'Multi-Community Association Detected',
                message: 'This property is part of a Master Association. Additional documents and fees will be included.',
                showWarning: true
              });
            }
          };
          
          restoreMultiCommunity();
        }
      }
    }, [formData.hoaProperty, hoaProperties, multiCommunityNotification]);

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

        {/* Multi-Community Notification (no pricing on this step) */}
        {multiCommunityNotification && (
          <div className={`p-4 rounded-lg border ${
            multiCommunityNotification.showWarning 
              ? 'bg-blue-50 border-blue-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className='flex items-start'>
              <AlertCircle className={`h-5 w-5 mt-0.5 mr-2 ${
                multiCommunityNotification.showWarning 
                  ? 'text-blue-600' 
                  : 'text-yellow-600'
              }`} />
              <div className='flex-1'>
                <h4 className={`font-medium ${
                  multiCommunityNotification.showWarning 
                    ? 'text-blue-900' 
                    : 'text-yellow-900'
                }`}>
                  Multi-Community Association Detected
                </h4>
                <p className={`text-sm mt-1 ${
                  multiCommunityNotification.showWarning 
                    ? 'text-blue-700' 
                    : 'text-yellow-700'
                }`}>
                  Your property is part of a Master Association. Additional documents and fees will be included.
                </p>

                {multiCommunityNotification.details && multiCommunityNotification.details.associations && (
                  <div className='mt-3'>
                    <div className='text-sm font-medium text-gray-900 mb-2'>
                      Included Associations:
                    </div>
                    <div className='space-y-1'>
                      {multiCommunityNotification.details.associations.map((association, index) => (
                        <div key={index} className='flex items-center text-sm text-gray-600'>
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            association.isPrimary ? 'bg-green-500' : 'bg-blue-500'
                          }`}></div>
                          <span className={association.isPrimary ? 'font-medium' : ''}>
                            {association.name}
                            {association.isPrimary && ' (Primary)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Standard HOA Documents Ready notification */}
        {formData.hoaProperty && !multiCommunityNotification && (
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

const SubmitterInfoStep = React.memo(({ formData, handleInputChange, hoaProperties }) => {
  // Check if the selected property allows public offering statements
  const selectedProperty = formData.hoaProperty && hoaProperties
    ? hoaProperties.find(prop => prop.name === formData.hoaProperty)
    : null;
  
  const canShowPublicOffering = selectedProperty?.allow_public_offering === true;

  // Check if the selected property is in North Carolina
  const isNorthCarolina = React.useMemo(() => {
    if (!selectedProperty?.location) return false;
    const locationUpper = selectedProperty.location.toUpperCase();
    return locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA');
  }, [selectedProperty]);

  // Debug logging
  React.useEffect(() => {
    if (formData.hoaProperty) {
      // Debug logging removed
    }
  }, [formData.hoaProperty, selectedProperty, canShowPublicOffering]);

  // Clear publicOffering flag if property doesn't allow it
  React.useEffect(() => {
    if (formData.publicOffering && !canShowPublicOffering) {
      handleInputChange('publicOffering', false);
    }
  }, [canShowPublicOffering, formData.publicOffering, handleInputChange]);

  // Clear submitterType if it's not allowed for North Carolina properties
  React.useEffect(() => {
    if (isNorthCarolina && formData.submitterType) {
      const allowedTypes = ['settlement', 'lender_questionnaire'];
      if (!allowedTypes.includes(formData.submitterType)) {
        handleInputChange('submitterType', '');
      }
    }
  }, [isNorthCarolina, formData.submitterType, handleInputChange]);

  return (
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
          I am Requesting: *
        </label>
        <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
          {(() => {
            // All available submitter types
            const allTypes = [
              { value: 'seller', label: 'Property Owner/Seller', icon: User },
              { value: 'realtor', label: 'Licensed Realtor', icon: FileText },
              { value: 'builder', label: 'Builder/Developer', icon: Building2 },
              { value: 'admin', label: 'GMG Staff', icon: CheckCircle },
              { value: 'settlement', label: 'Settlement Agent / Closing Attorney', icon: Briefcase },
              { value: 'lender_questionnaire', label: 'Lender Questionnaire', icon: FileText },
            ];

            // Filter types based on North Carolina selection
            // For NC properties, only show 'settlement' and 'lender_questionnaire'
            const availableTypes = isNorthCarolina
              ? allTypes.filter(type => type.value === 'settlement' || type.value === 'lender_questionnaire')
              : allTypes;

            return availableTypes.map((type) => {
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
            });
          })()}
        </div>
        {formData.submitterType === 'builder' && canShowPublicOffering && (
          <div className='mt-6 p-4 border border-amber-300 rounded-md bg-amber-50'>
            <label className='flex items-start gap-3 cursor-pointer'>
              <input
                type='checkbox'
                checked={!!formData.publicOffering}
                onChange={(e) => handleInputChange('publicOffering', e.target.checked)}
                className='mt-1 h-4 w-4 text-green-600 border-gray-300 rounded'
              />
              <div>
                <div className='font-medium text-amber-900'>Request Public Offering Statement</div>
                <div className='text-sm text-amber-800'>This special request skips other forms and goes straight to payment. Fixed fee: $200.</div>
              </div>
            </label>
          </div>
        )}
        {formData.submitterType === 'builder' && formData.publicOffering && canShowPublicOffering && (
          <div className='mt-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded p-3'>
            Public Offering Statement selected — transaction details will be skipped. You will proceed directly to payment.
          </div>
        )}
        {formData.submitterType === 'lender_questionnaire' && (
          <div className='mt-4 p-4 rounded-lg border bg-blue-50 border-blue-200'>
            <div className='flex items-start'>
              <InfoIcon className='h-5 w-5 mt-0.5 mr-2 text-blue-600' />
              <div className='flex-1'>
                <h4 className='font-medium text-blue-900'>
                  Lender Questionnaire Selected
                </h4>
                <p className='text-sm mt-1 text-blue-700'>
                  You will be able to upload your own questionnaire after payment.
                </p>
              </div>
            </div>
          </div>
        )}
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
    {formData.submitterType === 'settlement' && (
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
    )}
  </div>
  );
});

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
        Buyer Information (Optional)
      </h4>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <input
          type='text'
          placeholder='Buyer Full Name'
          value={formData.buyerName || ''}
          onChange={(e) => handleInputChange('buyerName', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='email'
          placeholder='Buyer Email'
          value={formData.buyerEmail || ''}
          onChange={(e) => handleInputChange('buyerEmail', e.target.value)}
          className='px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
        />
        <input
          type='tel'
          placeholder='Buyer Phone'
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
        Sale Information (Optional)
      </h4>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            Sale Price
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
            Expected Closing Date
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
  setFormData,
  handleInputChange,
  currentStep,
  setCurrentStep,
  applicationId,
  setApplicationId,
  user,
  hoaProperties,
  setShowAuthModal,
  stripePrices,
  applicationType,
  setSnackbarData,
  setShowSnackbar,
  loadApplications,
  isTestMode, // Add test mode prop
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [multiCommunityPricing, setMultiCommunityPricing] = useState(null);
  const [standardMultiCommunityPricing, setStandardMultiCommunityPricing] = useState(null);
  const [rushMultiCommunityPricing, setRushMultiCommunityPricing] = useState(null);
  const [linkedProperties, setLinkedProperties] = useState([]);

  // Check if this is a pending payment application
  const [isPendingPayment, setIsPendingPayment] = React.useState(false);
  
  // Ensure payment method defaults to credit_card when ACH is disabled
  React.useEffect(() => {
    if (!ACH_OPTION_ENABLED && formData.paymentMethod === 'ach') {
      handleInputChange('paymentMethod', 'credit_card');
    }
  }, [ACH_OPTION_ENABLED, formData.paymentMethod, handleInputChange]);
  
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

  // Load multi-community pricing when component mounts or formData changes
  React.useEffect(() => {
    const loadMultiCommunityPricing = async () => {
      if (formData.hoaProperty && hoaProperties) {
        const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
        // Skip multi-community pricing for lender_questionnaire - treat as single application
        if (selectedProperty && selectedProperty.is_multi_community && applicationType !== 'lender_questionnaire') {
          try {
            const { getLinkedProperties, calculateMultiCommunityPricing } = await import('../lib/multiCommunityUtils');
            
            const linked = await getLinkedProperties(selectedProperty.id);
            setLinkedProperties(linked);
            
            // Calculate both standard and rush pricing
            // Use the actual applicationType instead of hardcoding 'standard'
            const [standardPricing, rushPricing] = await Promise.all([
              calculateMultiCommunityPricing(selectedProperty.id, 'standard', applicationType, null, formData.submitterType, formData.publicOffering),
              calculateMultiCommunityPricing(selectedProperty.id, 'rush', applicationType, null, formData.submitterType, formData.publicOffering)
            ]);
            
            setStandardMultiCommunityPricing(standardPricing);
            setRushMultiCommunityPricing(rushPricing);
            
            // Set the current pricing based on selected package type
            const currentPricing = (formData.packageType || 'standard') === 'rush' ? rushPricing : standardPricing;
            setMultiCommunityPricing(currentPricing);
          } catch (error) {
            console.error('Error loading multi-community pricing:', error);
            setMultiCommunityPricing(null);
            setStandardMultiCommunityPricing(null);
            setRushMultiCommunityPricing(null);
            setLinkedProperties([]);
          }
        } else {
          setMultiCommunityPricing(null);
          setStandardMultiCommunityPricing(null);
          setRushMultiCommunityPricing(null);
          setLinkedProperties([]);
        }
      }
    };
    
    loadMultiCommunityPricing();
  }, [formData.hoaProperty, formData.packageType, hoaProperties, applicationType]);


  const handlePayment = async () => {
    if (!formData.packageType || !formData.paymentMethod) {
      setPaymentError('Please select a package and payment method');
      return;
    }

    // Prevent ACH payment if option is disabled
    if (formData.paymentMethod === 'ach' && !ACH_OPTION_ENABLED) {
      setPaymentError('ACH payment option is currently disabled. Please use credit card payment.');
      handleInputChange('paymentMethod', 'credit_card');
      return;
    }

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Calculate total amount for payment bypass check using database pricing
      const totalAmount = await calculateTotalDatabase(formData, hoaProperties, applicationType);
      
      // Check if payment is required (bypass for $0 transactions)
      if (totalAmount === 0) {
        // Skip payment for free transactions (e.g., Virginia settlement standard processing)
        let createdApplicationId;

        // Create or update application
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
            application_type: applicationType,
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
            total_amount: totalAmount,
            status: 'under_review',
            payment_status: 'pending',
            submitted_at: new Date().toISOString(),
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
            application_type: applicationType,
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
            total_amount: totalAmount,
            status: 'under_review',
            payment_status: 'pending',
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

        // Auto-assign application to property owner at submission time (for all applications)
        // This happens for both free and paid applications when they are submitted
        if (createdApplicationId) {
          try {
            // Auto-assigning application at submission time
            const assignResponse = await fetch('/api/auto-assign-application', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });
            
            const assignResult = await assignResponse.json();
            if (assignResult.success) {
              // Application auto-assigned successfully
            } else {
              console.warn(`[Submission] Failed to auto-assign application ${createdApplicationId}:`, assignResult.error);
            }
          } catch (assignError) {
            console.error('[Submission] Error calling auto-assign API:', assignError);
            // Don't fail the submission if auto-assignment fails
          }

          // ALWAYS create notifications, even if auto-assign failed
          // (auto-assign creates notifications, but we want to ensure they're created)
          try {
            // Creating notifications for application
            const notificationResponse = await fetch('/api/notifications/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });

            if (notificationResponse.ok) {
              const notificationResult = await notificationResponse.json();
              // Notifications created successfully
            } else {
              const errorText = await notificationResponse.text();
              console.warn(`[Submission] Failed to create notifications:`, errorText);
            }
          } catch (notificationError) {
            console.error('[Submission] Error creating notifications:', notificationError);
            // Don't fail the submission if notification creation fails
          }
        }

        // Forms are created automatically by the API for free transactions
        // No need to call createPropertyOwnerForms here

        // Send confirmation email
        try {
          const hoaProperty = (hoaProperties || []).find(
            (h) => h.name === formData.hoaProperty
          );
          
          const emailResponse = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailType: 'application_submission',
              applicationId: createdApplicationId,
              customerName: formData.submitterName,
              customerEmail: formData.submitterEmail,
              propertyAddress: formData.propertyAddress,
              packageType: formData.packageType,
              totalAmount: totalAmount,
              hoaName: hoaProperty?.name || 'Unknown HOA',
              submitterType: formData.submitterType,
              applicationType: applicationType,
            }),
          });

          if (!emailResponse.ok) {
            throw new Error('Failed to send confirmation email');
          }
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Don't fail the submission if email fails
        }

        // Show success message and redirect
        setSnackbarData({
          message: 'Application submitted successfully! You will receive a confirmation email shortly.',
          type: 'success'
        });
        setShowSnackbar(true);

        // Reset form and redirect to applications
        setCurrentStep(0);
        await loadApplications();
        setApplicationId(null);
        
        // Reset form data
        setFormData({
          hoaProperty: '',
          propertyAddress: '',
          unitNumber: '',
          submitterType: '',
          publicOffering: false,
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
          closingDate: '',
          packageType: 'standard',
          paymentMethod: '',
        });

        return; // Exit early for free transactions
      }

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
            application_type: applicationType,
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
            total_amount: totalAmount,
            status: 'pending_payment',
            submitted_at: new Date().toISOString(), // Set submitted_at for payment flow
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
          
          // Auto-assign application at submission time (before payment)
          try {
            // Auto-assigning application at payment (credit card - update)
            const assignResponse = await fetch('/api/auto-assign-application', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });
            
            const assignResult = await assignResponse.json();
            if (assignResult.success) {
              // Application auto-assigned successfully
            } else {
              console.warn(`[Payment] Failed to auto-assign application ${createdApplicationId}:`, assignResult.error);
            }
          } catch (assignError) {
            console.error('[Payment] Error calling auto-assign API:', assignError);
            // Don't fail the payment flow if auto-assignment fails
          }

          // ALWAYS create notifications, even if auto-assign failed
          try {
            // Creating notifications for application
            const notificationResponse = await fetch('/api/notifications/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });

            if (notificationResponse.ok) {
              const notificationResult = await notificationResponse.json();
              // Notifications created successfully
            } else {
              const errorText = await notificationResponse.text();
              console.warn(`[Payment] Failed to create notifications:`, errorText);
            }
          } catch (notificationError) {
            console.error('[Payment] Error creating notifications:', notificationError);
            // Don't fail the payment flow if notification creation fails
          }
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
            application_type: applicationType,
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
            total_amount: totalAmount,
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
          
          // Auto-assign application at submission time (before payment)
          try {
            // Auto-assigning application at payment (credit card)
            const assignResponse = await fetch('/api/auto-assign-application', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });
            
            const assignResult = await assignResponse.json();
            if (assignResult.success) {
              // Application auto-assigned successfully
            } else {
              console.warn(`[Payment] Failed to auto-assign application ${createdApplicationId}:`, assignResult.error);
            }
          } catch (assignError) {
            console.error('[Payment] Error calling auto-assign API:', assignError);
            // Don't fail the payment flow if auto-assignment fails
          }

          // ALWAYS create notifications, even if auto-assign failed
          try {
            // Creating notifications for application
            const notificationResponse = await fetch('/api/notifications/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });

            if (notificationResponse.ok) {
              const notificationResult = await notificationResponse.json();
              // Notifications created successfully
            } else {
              const errorText = await notificationResponse.text();
              console.warn(`[Payment] Failed to create notifications:`, errorText);
            }
          } catch (notificationError) {
            console.error('[Payment] Error creating notifications:', notificationError);
            // Don't fail the payment flow if notification creation fails
          }
          
          // Set the application ID for future updates
          setApplicationId(createdApplicationId);
        }

        // Get Stripe instance with enhanced error handling (use test mode if enabled)
        const stripe = await getStripeWithFallback(isTestMode);

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
            amount: Math.round(totalAmount * 100), // Convert to cents
            testMode: isTestMode, // Pass test mode to API
          }),
        });

        // Check if response is OK before parsing JSON
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Checkout session API error:', errorText);
          throw new Error(`Failed to create checkout session: ${response.status} ${response.statusText}`);
        }

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
        // Handle ACH payment (only if enabled)
        if (!ACH_OPTION_ENABLED) {
          setPaymentError('ACH payment option is currently disabled. Please use credit card payment.');
          return;
        }
        // Handle ACH payment (redirect to external processor or show instructions)
        alert('ACH payment processing will be implemented separately. Please contact support for bank transfer instructions.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      
      // Check if it's an ad blocker related error
      if (error.message && (
        error.message.includes('ad blockers') ||
        error.message.includes('browser security settings') ||
        error.message.includes('ERR_BLOCKED_BY_CLIENT')
      )) {
        setShowAdBlockerWarning(true);
        setPaymentError('Payment system blocked. Please check your browser settings.');
      } else {
        setPaymentError(error.message || 'Payment failed. Please try again.');
      }
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

      {/* Multi-Community Notification */}
      {multiCommunityPricing && multiCommunityPricing.associations && multiCommunityPricing.associations.length > 0 && applicationType !== 'lender_questionnaire' && (
        <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6'>
          <div className='flex items-start'>
            <AlertCircle className='h-5 w-5 text-blue-600 mt-0.5 mr-3' />
            <div className='flex-1'>
              <h4 className='font-medium text-blue-900 mb-2'>
                Multi-Community Association Detected
              </h4>
              <p className='text-sm text-blue-700 mb-3'>
                Your selected property is part of multiple community associations. The pricing below includes all required documents and fees for each association.
              </p>
              <div className='text-sm'>
                <div className='font-medium text-blue-900 mb-1'>Included Associations:</div>
                <div className='space-y-1'>
                  {multiCommunityPricing.associations.map((association, index) => (
                    <div key={index} className='flex items-center text-sm text-blue-700'>
                      <div className={`w-2 h-2 rounded-full mr-2 ${
                        association.isPrimary ? 'bg-green-500' : 'bg-blue-500'
                      }`}></div>
                      <span className={association.isPrimary ? 'font-medium' : ''}>
                        {association.name}
                        {association.isPrimary && ' (Primary)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div
          onClick={() => handleInputChange('packageType', 'standard')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            formData.packageType === 'standard'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className='flex items-start justify-between mb-4 gap-4 md:gap-8'>
            <div className='pr-3 md:pr-6 max-w-[70%]'>
              <h4 className='text-lg font-semibold text-gray-900'>
                {formData.submitterType === 'settlement' ? (() => {
                  const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                  const location = selectedProperty?.location?.toUpperCase() || '';
                  if (location.includes('VA') || location.includes('VIRGINIA')) {
                    return 'Dues Request - Escrow Instructions';
                  } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                    return 'Statement of Unpaid Assessments';
                  }
                  return 'Dues Request - Escrow Instructions'; // Default fallback
                })() : 
                 formData.submitterType === 'lender_questionnaire' ? 'Standard' : 'Standard Processing'}
              </h4>
              <p className='text-sm text-gray-600'>
                {formData.submitterType === 'settlement' ? '14 calendar days' : 
                 formData.submitterType === 'lender_questionnaire' ? '10 Calendar Days' : '10-15 business days'}
              </p>
            </div>
            <div className='text-right'>
              <div className='text-2xl font-bold text-green-600'>
                ${(() => {
                  // Use multi-community pricing if available (even if total is 0, like VA settlement standard)
                  if (standardMultiCommunityPricing && standardMultiCommunityPricing.total !== undefined && standardMultiCommunityPricing.total !== null) {
                    const baseTotal = standardMultiCommunityPricing.total;
                    // Only add convenience fee if base total > 0 (for free transactions like VA settlement standard)
                    const convenienceFeeTotal = (formData.paymentMethod === 'credit_card' && baseTotal > 0) ? 
                      standardMultiCommunityPricing.totalConvenienceFee : 0;
                    return (baseTotal + convenienceFeeTotal).toFixed(2);
                  }
                  // Fallback: compute using STANDARD package for display
                  const selectedProperty = hoaProperties?.find(p => p.name === formData.hoaProperty);
                  const isVASettlement = formData.submitterType === 'settlement' && 
                    selectedProperty?.location?.toUpperCase()?.includes('VA');
                  if (isVASettlement) {
                    return '0.00';
                  }
                  const standardFormData = { ...formData, packageType: 'standard' };
                  const total = calculateTotal(standardFormData, stripePrices, hoaProperties);
                  return total.toFixed(2);
                })()}
              </div>
            </div>
          </div>
          <ul className='text-sm text-gray-600 space-y-1 list-disc pl-5'>
            {standardMultiCommunityPricing && standardMultiCommunityPricing.associations && standardMultiCommunityPricing.associations.length > 0 ? (
              // Multi-community breakdown
              <>
                {standardMultiCommunityPricing.associations.map((association, index) => (
                  <li key={index} className='font-medium text-gray-700'>
                    {association.name} {association.isPrimary && '(Primary)'} - ${association.basePrice.toFixed(2)}
                  </li>
                ))}
                {formData.submitterType === 'settlement' ? (
                  <>
                    <li>Standard Processing</li>
                    {(() => {
                      const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                      const location = selectedProperty?.location?.toUpperCase() || '';
                      if (location.includes('VA') || location.includes('VIRGINIA')) {
                        return (
                          <>
                            <li>Current HOA dues verification</li>
                            <li>Settlement statement preparation</li>
                            <li>Direct submission to accounting</li>
                          </>
                        );
                      } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                        return (
                          <>
                            <li>Statement of Unpaid Assessments</li>
                            <li>Current assessment verification</li>
                            <li>Settlement documentation</li>
                            <li>Direct submission to accounting</li>
                            <li>Includes a copy of all property documents</li>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <li>Settlement documentation</li>
                            <li>HOA dues verification</li>
                            <li>Escrow instructions</li>
                            <li>Direct submission to accounting</li>
                          </>
                        );
                      }
                    })()}
                  </>
                ) : (
                  <>
                    <li>Digital & Print Delivery</li>
                    <li>10-15 business days processing</li>
                  </>
                )}
              </>
            ) : formData.submitterType === 'settlement' ? (
              <>
                <li>Standard Processing</li>
                {(() => {
                  const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                  const location = selectedProperty?.location?.toUpperCase() || '';
                  if (location.includes('VA') || location.includes('VIRGINIA')) {
                    return (
                      <>
                        <li>Current HOA dues verification</li>
                        <li>Settlement statement preparation</li>
                        <li>Direct submission to accounting</li>
                      </>
                    );
                  } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                    return (
                      <>
                        <li>Statement of Unpaid Assessments</li>
                        <li>Current assessment verification</li>
                        <li>Settlement documentation</li>
                        <li>Direct submission to accounting</li>
                        <li>Includes a copy of all property documents</li>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <li>Settlement documentation</li>
                        <li>HOA dues verification</li>
                        <li>Escrow instructions</li>
                        <li>Direct submission to accounting</li>
                      </>
                    );
                  }
                })()}
              </>
            ) : (
              <>
                <li>Complete Virginia Resale Certificate</li>
                <li>HOA Documents Package</li>
                <li>Compliance Inspection Report</li>
                <li>Digital & Print Delivery</li>
              </>
            )}
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
          <div className='flex items-start justify-between mb-4 gap-4 md:gap-8'>
            <div className='pr-3 md:pr-6 max-w-[70%]'>
              <h4 className='text-lg font-semibold text-gray-900 flex items-center'>
                {formData.submitterType === 'settlement' ? (() => {
                  const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                  const location = selectedProperty?.location?.toUpperCase() || '';
                  if (location.includes('VA') || location.includes('VIRGINIA')) {
                    return 'Rush Dues Request - Escrow Instructions';
                  } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                    return 'Rush Statement of Unpaid Assessments';
                  }
                  return 'Rush Dues Request - Escrow Instructions'; // Default fallback
                })() : 'Rush Processing'}
                <span className='ml-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded'>
                  PRIORITY
                </span>
              </h4>
              <p className='text-sm text-gray-600'>{formData.submitterType === 'settlement' ? '3 business days' : '5 business days'}</p>
            </div>
            <div className='text-right'>
              <div className='text-lg text-gray-500'>
                {(() => {
                  // Check for forced price first
                  const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                  let basePrice = '317.95';
                  
                  if (selectedProperty) {
                    // Only show forced price if submitterType is 'builder' AND public offering is NOT requested
                    if (shouldApplyForcedPrice(formData.submitterType, formData.publicOffering)) {
                      const forcedPrice = getForcedPriceSync(selectedProperty);
                      if (forcedPrice !== null) {
                        // Show forced price as base (for rush, the +$70.66 will be shown below)
                        return forcedPrice.toFixed(2);
                      }
                    }
                  }
                  
                  // Show base processing fee only (no rush, no credit card fees)
                  if (formData.submitterType === 'lender_questionnaire') {
                    const pricing = getPricing('lender_questionnaire', false);
                    basePrice = (pricing.base / 100).toFixed(2);
                  } else if (formData.submitterType === 'builder' && formData.publicOffering) {
                    basePrice = '200.00';
                  } else if (formData.submitterType === 'settlement') {
                    if (selectedProperty?.location) {
                      const location = selectedProperty.location.toUpperCase();
                      if (location.includes('VA') || location.includes('VIRGINIA')) {
                        basePrice = '0.00';
                      } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                        basePrice = '450.00';
                      }
                    } else {
                      basePrice = '200.00'; // Fallback
                    }
                  } else if (stripePrices && stripePrices.standard && stripePrices.standard.displayAmount) {
                    basePrice = stripePrices.standard.displayAmount.toFixed(2);
                  }
                  return basePrice;
                })()}
              </div>
              {formData.submitterType !== 'lender_questionnaire' && (
                <div className='text-sm text-gray-500'>
                  + ${(() => {
                    // Use settlement rush fee if applicable
                    if (formData.submitterType === 'settlement') {
                      const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                      if (selectedProperty?.location) {
                        const location = selectedProperty.location.toUpperCase();
                        if (location.includes('VA') || location.includes('VIRGINIA')) {
                          const pricing = getPricing('settlement_va', true);
                          return (pricing.rushFee / 100).toFixed(2); // $70.66
                        } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                          const pricing = getPricing('settlement_nc', true);
                          return (pricing.rushFee / 100).toFixed(2); // $100.00
                        }
                      }
                    }
                    // Default rush fee for regular pricing
                    return stripePrices ? stripePrices.rush.rushFeeDisplay.toFixed(2) : '70.66';
                  })()}
                </div>
              )}
              {formData.submitterType === 'lender_questionnaire' && (
                <div className='text-sm text-gray-500'>
                  + ${(() => {
                    const pricing = getPricing('lender_questionnaire', true);
                    return (pricing.rushFee / 100).toFixed(2);
                  })()}
                </div>
              )}
              <div className='text-2xl font-bold text-orange-600'>
                ${(() => {
                  // Use multi-community pricing if available (even if total is 0)
                  if (rushMultiCommunityPricing && rushMultiCommunityPricing.total !== undefined && rushMultiCommunityPricing.total !== null) {
                    // Calculate rush pricing for multi-community
                    const baseTotal = rushMultiCommunityPricing.total;
                    // Only add convenience fee if base total > 0 (for free transactions)
                    const convenienceFeeTotal = (formData.paymentMethod === 'credit_card' && baseTotal > 0) ? 
                      rushMultiCommunityPricing.totalConvenienceFee : 0;
                    return (baseTotal + convenienceFeeTotal).toFixed(2);
                  }
                  const tempFormData = { ...formData, packageType: 'rush' };
                  const rushTotal = calculateTotal(tempFormData, stripePrices, hoaProperties);
                  return rushTotal.toFixed(2);
                })()}
              </div>
            </div>
          </div>
          <ul className='text-sm text-gray-600 space-y-1 list-disc pl-5'>
            {rushMultiCommunityPricing && rushMultiCommunityPricing.associations && rushMultiCommunityPricing.associations.length > 0 ? (
              // Multi-community breakdown with rush fees
              <>
                {rushMultiCommunityPricing.associations.map((association, index) => (
                  <li key={index} className='font-medium text-gray-700'>
                    {association.name} {association.isPrimary && '(Primary)'} - ${association.basePrice.toFixed(2)} + ${association.rushFee.toFixed(2)} rush
                  </li>
                ))}
                {formData.submitterType === 'settlement' ? (
                  <>
                    <li>Rush Processing</li>
                    <li>Priority queue processing</li>
                    <li>Expedited accounting review</li>
                    <li>3-day completion guarantee</li>
                    {(() => {
                      const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                      const location = selectedProperty?.location?.toUpperCase() || '';
                      if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                        return <li>Includes a copy of all property documents</li>;
                      }
                      return null;
                    })()}
                  </>
                ) : (
                  <>
                    <li>Priority queue processing</li>
                    <li>Expedited compliance inspection</li>
                    <li>5-day completion guarantee</li>
                  </>
                )}
              </>
            ) : formData.submitterType === 'settlement' ? (
              <>
                <li>Rush Processing</li>
                <li>Priority queue processing</li>
                <li>Expedited accounting review</li>
                <li>3-day completion guarantee</li>
                {(() => {
                  const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                  const location = selectedProperty?.location?.toUpperCase() || '';
                  if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                    return <li>Includes a copy of all property documents</li>;
                  }
                  return null;
                })()}
              </>
            ) : (
              <>
                <li>Everything in Standard</li>
                <li>Priority queue processing</li>
                <li>Expedited compliance inspection</li>
                <li>5-day completion guarantee</li>
              </>
            )}
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
                  {calculateTotal(formData, stripePrices, hoaProperties) > 0 && (
                    <span className='text-sm text-gray-500'>
                      + ${stripePrices ? stripePrices.convenienceFee.display.toFixed(2) : '9.95'} convenience fee
                    </span>
                  )}
                </div>
                <p className='text-xs text-gray-500'>
                  Secure checkout powered by Stripe
                </p>
              </div>
            </label>


          </div>

          {ACH_OPTION_ENABLED && (
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
          )}
        </div>

        <div className='bg-green-50 p-4 rounded-lg border border-green-200'>
          <h5 className='font-medium text-green-900 mb-2'>Order Summary</h5>
          <div className='space-y-2 text-sm'>
            {multiCommunityPricing && multiCommunityPricing.associations && multiCommunityPricing.associations.length > 0 ? (
              // Multi-community pricing breakdown
              <>
                {multiCommunityPricing.associations.map((association, index) => (
                  <div key={index} className='border-b border-green-200 pb-2 mb-2'>
                    <div className='font-medium text-green-800 mb-1'>
                      {association.name} {association.isPrimary && '(Primary)'}
                    </div>
                    <div className='flex justify-between ml-4'>
                      <span>Processing Fee:</span>
                      <span>${association.basePrice.toFixed(2)}</span>
                    </div>
                    {formData.packageType === 'rush' && (
                      <div className='flex justify-between ml-4'>
                        <span>Rush Processing:</span>
                        <span>+${association.rushFee.toFixed(2)}</span>
                      </div>
                    )}
                    {formData.paymentMethod === 'credit_card' && (association.basePrice + association.rushFee) > 0 && (
                      <div className='flex justify-between ml-4'>
                        <span>Convenience Fee:</span>
                        <span>+${association.convenienceFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className='flex justify-between ml-4 font-medium text-green-800'>
                      <span>Subtotal:</span>
                      <span>${(() => {
                        // Subtotal should include basePrice + rushFee + convenienceFee (if credit card and total > 0)
                        let subtotal = association.basePrice + association.rushFee;
                        if (formData.paymentMethod === 'credit_card' && subtotal > 0) {
                          subtotal += association.convenienceFee;
                        }
                        return subtotal.toFixed(2);
                      })()}</span>
                    </div>
                  </div>
                ))}
                <div className='border-t border-green-200 pt-2 flex justify-between font-semibold text-green-900'>
                  <span>Total:</span>
                  <span>${(() => {
                    const baseTotal = multiCommunityPricing.total;
                    // Only add convenience fee if base total > 0 (for free transactions like VA settlement standard)
                    const convenienceFeeTotal = (formData.paymentMethod === 'credit_card' && baseTotal > 0) ? 
                      multiCommunityPricing.totalConvenienceFee : 0;
                    return (baseTotal + convenienceFeeTotal).toFixed(2);
                  })()}</span>
                </div>
              </>
            ) : (
              // Single property pricing
              <>
                <div className='flex justify-between'>
                  <span>Processing Fee:</span>
                  <span>${(() => {
                    // Check for forced price first
                    const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                    if (selectedProperty) {
                      // Only show forced price if submitterType is 'builder' AND public offering is NOT requested
                      if (shouldApplyForcedPrice(formData.submitterType, formData.publicOffering)) {
                        const forcedPrice = getForcedPriceSync(selectedProperty);
                        if (forcedPrice !== null) {
                          return forcedPrice.toFixed(2);
                        }
                      }
                    }
                    
                    // Calculate base processing fee only (no rush, no credit card fees)
                    if (formData.submitterType === 'lender_questionnaire') {
                      const pricing = getPricing('lender_questionnaire', false);
                      return (pricing.base / 100).toFixed(2); // $400.00
                    }
                    if (formData.submitterType === 'builder' && formData.publicOffering) {
                      return '200.00';
                    }
                    if (formData.submitterType === 'settlement') {
                      if (selectedProperty?.location) {
                        const location = selectedProperty.location.toUpperCase();
                        if (location.includes('VA') || location.includes('VIRGINIA')) {
                          return '0.00';
                        } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                          return '450.00';
                        }
                      }
                      return '200.00'; // Fallback for settlement
                    }
                    // Regular pricing for all other submitter types (seller, realtor, admin)
                    if (stripePrices && stripePrices.standard && stripePrices.standard.displayAmount) {
                      return stripePrices.standard.displayAmount.toFixed(2);
                    }
                    return '317.95'; // Fallback for regular pricing
                  })()}</span>
                </div>
                {formData.packageType === 'rush' && (
                  <div className='flex justify-between'>
                    <span>Rush Processing:</span>
                    <span>+${(() => {
                      // Use lender questionnaire rush fee if applicable
                      if (formData.submitterType === 'lender_questionnaire') {
                        const pricing = getPricing('lender_questionnaire', true);
                        return (pricing.rushFee / 100).toFixed(2); // $100.00
                      }
                      // Use settlement rush fee if applicable
                      if (formData.submitterType === 'settlement') {
                        const selectedProperty = hoaProperties?.find(prop => prop.name === formData.hoaProperty);
                        if (selectedProperty?.location) {
                          const location = selectedProperty.location.toUpperCase();
                          if (location.includes('VA') || location.includes('VIRGINIA')) {
                            const pricing = getPricing('settlement_va', true);
                            return (pricing.rushFee / 100).toFixed(2); // $70.66
                          } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
                            const pricing = getPricing('settlement_nc', true);
                            return (pricing.rushFee / 100).toFixed(2); // $100.00
                          }
                        }
                      }
                      // Default rush fee for regular pricing
                      return stripePrices ? stripePrices.rush.rushFeeDisplay.toFixed(2) : '70.66';
                    })()}</span>
                  </div>
                )}
                {formData.paymentMethod === 'credit_card' && calculateTotal(formData, stripePrices, hoaProperties) > 0 && (
                  <div className='flex justify-between'>
                    <span>Convenience Fee:</span>
                    <span>+${stripePrices ? stripePrices.convenienceFee.display.toFixed(2) : '9.95'}</span>
                  </div>
                )}
                <div className='border-t border-green-200 pt-2 flex justify-between font-semibold text-green-900'>
                  <span>Total:</span>
                  <span>${calculateTotal(formData, stripePrices, hoaProperties).toFixed(2)}</span>
                </div>
              </>
            )}
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
            formData.paymentMethod === 'credit_card' ? 'Continue to Checkout' : `Pay $${(() => {
              if (multiCommunityPricing && multiCommunityPricing.total) {
                const baseTotal = multiCommunityPricing.total;
                const convenienceFeeTotal = formData.paymentMethod === 'credit_card' ? 
                  multiCommunityPricing.totalConvenienceFee : 0;
                return (baseTotal + convenienceFeeTotal).toFixed(2);
              }
              return calculateTotal(formData, stripePrices, hoaProperties).toFixed(2);
            })()}`
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

// Ad Blocker Warning Modal Component
const AdBlockerWarningModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg p-6 max-w-md w-full mx-4'>
        <div className='flex items-center mb-4'>
          <div className='w-12 h-12 rounded-full flex items-center justify-center mr-4 bg-yellow-100'>
            <AlertCircle className='h-6 w-6 text-yellow-600' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-900'>Payment System Blocked</h3>
          </div>
        </div>
        
        <div className='text-gray-600 mb-6 space-y-3'>
          <p>It appears that your browser's security settings or an ad blocker is preventing the payment system from loading properly.</p>
          <p className='font-medium'>To fix this issue:</p>
          <ul className='list-disc list-inside space-y-1 text-sm'>
            <li>Disable ad blockers for this site</li>
            <li>Check your browser's security settings</li>
            <li>Try refreshing the page</li>
            <li>Use a different browser if the issue persists</li>
          </ul>
        </div>
        
        <div className='flex justify-end space-x-3'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors'
          >
            Close
          </button>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className='px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors'
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  );
};

// Authentication Modal Component
const AuthModal = ({ authMode, setAuthMode, setShowAuthModal, handleAuth, resetPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');

  // Clear error when switching modes or closing
  const handleModeSwitch = (newMode) => {
    setAuthError('');
    setResetMessage('');
    setAuthMode(newMode);
  };

  const handleClose = () => {
    setAuthError('');
    setResetMessage('');
    setShowAuthModal(false);
  };

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg p-8 max-w-md w-full mx-4'>
        <div className='flex justify-between items-center mb-6'>
          <h2 className='text-2xl font-bold text-green-800'>
            {showForgotPassword ? 'Reset Password' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <button 
            onClick={handleClose}
            disabled={isAuthenticating || isResetting}
            className={isAuthenticating || isResetting ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <X className='h-6 w-6 text-gray-400' />
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setAuthError('');
            
            if (showForgotPassword) {
              setIsResetting(true);
              setResetMessage('');
              try {
                const result = await resetPassword(email);
                if (result.success) {
                  setResetMessage('Check your email for password reset instructions.');
                } else {
                  setResetMessage(result.error || 'Failed to send reset email. Please try again.');
                }
              } catch (error) {
                setResetMessage('Failed to send reset email. Please try again.');
              } finally {
                setIsResetting(false);
              }
            } else {
              setIsAuthenticating(true);
              setAuthError('');
              try {
                const result = await handleAuth(email, password, {
                  first_name: firstName,
                  last_name: lastName,
                });
                
                // If handleAuth returns an error result
                if (result && !result.success) {
                  setAuthError(result.error || 'Authentication failed. Please try again.');
                  setIsAuthenticating(false);
                } else if (result && result.success) {
                  // Success - modal will be closed by handleAuth
                  setIsAuthenticating(false);
                  // Reset form fields
                  setEmail('');
                  setPassword('');
                  setFirstName('');
                  setLastName('');
                  setAuthError('');
                } else {
                  // No result returned, assume success (backward compatibility)
                  setIsAuthenticating(false);
                }
              } catch (error) {
                setAuthError(error.message || 'An unexpected error occurred. Please try again.');
                setIsAuthenticating(false);
              }
            }
          }}
        >
          {showForgotPassword ? (
            <div className='space-y-4'>
              <p className='text-gray-600 text-sm'>
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <input
                type='email'
                placeholder='Email Address'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isResetting}
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isResetting ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                required
              />
              {resetMessage && (
                <div className={`text-sm p-3 rounded-lg ${
                  resetMessage.includes('Check') || resetMessage.includes('success')
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'bg-red-100 text-red-700 border border-red-200'
                }`}>
                  {resetMessage}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Error message display */}
              {authError && (
                <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <p className='text-sm text-red-700'>{authError}</p>
                </div>
              )}

              {authMode === 'signup' && (
                <div className='grid grid-cols-2 gap-4 mb-4'>
                  <input
                    type='text'
                    placeholder='First Name'
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isAuthenticating}
                    className={`px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                      isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    required
                  />
                  <input
                    type='text'
                    placeholder='Last Name'
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isAuthenticating}
                    className={`px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                      isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
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
                  disabled={isAuthenticating}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  required
                />
                <input
                  type='password'
                  placeholder='Password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isAuthenticating}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  required
                />
              </div>
            </>
          )}

          <button
            type='submit'
            disabled={(showForgotPassword && isResetting) || (!showForgotPassword && isAuthenticating)}
            className={`w-full mt-6 px-6 py-3 rounded-lg transition-colors flex items-center justify-center ${
              (showForgotPassword && isResetting) || (!showForgotPassword && isAuthenticating)
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-700 hover:bg-green-800'
            } text-white`}
          >
            {showForgotPassword && isResetting ? (
              <>
                <svg className='animate-spin -ml-1 mr-3 h-5 w-5 text-white' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                  <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                  <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                </svg>
                Sending...
              </>
            ) : !showForgotPassword && isAuthenticating ? (
              <>
                <svg className='animate-spin -ml-1 mr-3 h-5 w-5 text-white' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                  <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                  <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                </svg>
                {authMode === 'signin' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              showForgotPassword ? 'Send Reset Email' : authMode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className='mt-4 text-center space-y-2'>
          {showForgotPassword ? (
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setResetMessage('');
                setAuthError('');
              }}
              disabled={isAuthenticating || isResetting}
              className='text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              Back to Sign In
            </button>
          ) : (
            <>
              {authMode === 'signin' && (
                <button
                  onClick={() => {
                    setShowForgotPassword(true);
                    setAuthError('');
                  }}
                  disabled={isAuthenticating}
                  className='text-green-600 hover:text-green-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  Forgot your password?
                </button>
              )}
              <div>
                <button
                  onClick={() => handleModeSwitch(authMode === 'signin' ? 'signup' : 'signin')}
                  disabled={isAuthenticating}
                  className='text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {authMode === 'signin'
                    ? 'Need an account? Sign up'
                    : 'Already have an account? Sign in'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const LenderQuestionnaireUploadStep = ({ formData, applicationId, setCurrentStep, setSnackbarData, setShowSnackbar, loadApplications }) => {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isConverting, setIsConverting] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);
  const [needsConversion, setNeedsConversion] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const dropZoneRef = React.useRef(null);
  
  // Get user from auth store to check authentication status
  const { user } = useApplicantAuthStore();

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file) => {
    // Validate file type - only PDF, DOC, DOCX for lender questionnaire
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      setSnackbarData({
        message: 'Invalid file type. Please upload PDF, DOC, or DOCX files only.',
        type: 'error'
      });
      setShowSnackbar(true);
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setSnackbarData({
        message: 'File size exceeds 10MB limit.',
        type: 'error'
      });
      setShowSnackbar(true);
      return;
    }

    // Check if file needs conversion (non-PDF files)
    const needsConversionCheck = fileExt !== '.pdf';
    setNeedsConversion(needsConversionCheck);
    setSelectedFile(file);
    setUploadSuccess(false);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !applicationId) {
      setSnackbarData({
        message: 'Please select a file to upload.',
        type: 'error'
      });
      setShowSnackbar(true);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setIsConverting(false);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('applicationId', applicationId);

      // Check if file needs conversion
      const fileExt = '.' + selectedFile.name.split('.').pop().toLowerCase();
      const willConvert = fileExt !== '.pdf';

      // Simulate upload progress (faster for PDF, slower for conversion)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          // If converting, slow down progress to show conversion phase
          if (willConvert && prev >= 40 && prev < 80) {
            // Slow progress during conversion phase
            return prev + 2;
          }
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + (willConvert ? 5 : 10);
        });
      }, 200);

      // Show converting status when progress reaches conversion phase
      if (willConvert) {
        setTimeout(() => {
          setIsConverting(true);
        }, 1000);
      }

      const response = await fetch('/api/upload-lender-questionnaire', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setIsConverting(false);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload file');
      }

      const data = await response.json();

      // Show success indicator
      setUploadSuccess(true);
      setIsUploading(false);

      // Show success message
      const successMessage = data.wasConverted
        ? 'File uploaded and converted to PDF successfully! Your request has been submitted.'
        : 'Lender questionnaire uploaded successfully! Your request has been submitted.';
      
      setSnackbarData({
        message: successMessage,
        type: 'success'
      });
      setShowSnackbar(true);

      // Wait a bit to show success indicator before redirecting
      setTimeout(async () => {
        try {
          // Check auth state from the store
          const authStore = useApplicantAuthStore.getState();
          
          // Verify user is still authenticated
          if (!authStore.user || !authStore.isAuthenticated()) {
            console.error('User session lost during upload');
            setSnackbarData({
              message: 'Upload successful! However, your session expired. Please refresh the page and log in again to view your applications.',
              type: 'warning'
            });
            setShowSnackbar(true);
            // Don't redirect if not authenticated
            return;
          }

          // Try to reload applications - if this fails due to auth, we'll catch it
          try {
            await loadApplications();
          } catch (loadError) {
            console.error('Error loading applications:', loadError);
            // If it's an auth error, don't redirect
            if (loadError.message?.includes('auth') || loadError.message?.includes('session') || loadError.message?.includes('unauthorized') || loadError.message?.includes('401')) {
              setSnackbarData({
                message: 'Upload successful! However, your session expired. Please refresh the page and log in again.',
                type: 'warning'
              });
              setShowSnackbar(true);
              return;
            }
            // For other errors, continue - applications might still be loaded from cache
          }
          
          // Final auth check before redirect
          const finalAuthCheck = useApplicantAuthStore.getState();
          if (finalAuthCheck.user && finalAuthCheck.isAuthenticated()) {
            // User is still authenticated, safe to redirect
            setCurrentStep(0);
          } else {
            console.warn('Auth state lost after loading applications');
            setSnackbarData({
              message: 'Upload successful! Please refresh the page to see your updated applications.',
              type: 'success'
            });
            setShowSnackbar(true);
          }
        } catch (error) {
          console.error('Error during post-upload redirect:', error);
          // Don't redirect on error - user can manually navigate or refresh
          setSnackbarData({
            message: 'Upload successful! Please refresh the page to see your updated applications.',
            type: 'success'
          });
          setShowSnackbar(true);
        }
      }, 2000); // 2 second delay to show success indicator
    } catch (error) {
      console.error('Error uploading lender questionnaire:', error);
      setIsConverting(false);
      setUploadSuccess(false);
      setSnackbarData({
        message: error.message || 'Failed to upload lender questionnaire. Please try again.',
        type: 'error'
      });
      setShowSnackbar(true);
    } finally {
      setIsUploading(false);
      // Don't reset progress immediately on success - let user see it
      if (!uploadSuccess) {
        setUploadProgress(0);
      }
    }
  };

  return (
    <div className='space-y-6'>
      <div className='text-center mb-8'>
        <h3 className='text-2xl font-bold text-green-900 mb-2'>
          Upload Lender Questionnaire
        </h3>
        <p className='text-gray-600'>
          Please upload your lender's questionnaire form. Our staff will complete it and return it once processed.
        </p>
      </div>

      <div className='bg-white p-6 rounded-lg border border-green-200'>
        <div
          ref={dropZoneRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-green-500 bg-green-50'
              : selectedFile
              ? 'border-green-300 bg-green-50'
              : 'border-gray-300 hover:border-green-400'
          }`}
        >
          <Upload className='h-12 w-12 mx-auto mb-4 text-gray-400' />
          {!selectedFile ? (
            <>
              <p className='text-lg font-medium text-gray-700 mb-2'>
                Drag and drop your lender's questionnaire form here
              </p>
              <p className='text-sm text-gray-500 mb-4'>
                or
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className='px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors'
              >
                Browse Files
              </button>
              <p className='text-xs text-gray-500 mt-4'>
                Accepted formats: PDF, DOC, DOCX (Max 10MB)
              </p>
            </>
          ) : (
            <div className='space-y-4'>
              <FileText className='h-12 w-12 mx-auto text-green-600' />
              <p className='text-lg font-medium text-gray-700'>
                {selectedFile.name}
              </p>
              <p className='text-sm text-gray-500'>
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {needsConversion && (
                <div className='p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                  <div className='flex items-center gap-2 text-blue-700'>
                    <InfoIcon className='h-4 w-4' />
                    <p className='text-sm font-medium'>
                      This file will be converted to PDF automatically
                    </p>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setNeedsConversion(false);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className='text-sm text-red-600 hover:text-red-700'
              >
                Remove File
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type='file'
            accept='.pdf,.doc,.docx'
            onChange={handleFileInputChange}
            className='hidden'
          />
        </div>

        {isUploading && (
          <div className='mt-4 space-y-2'>
            <div className='w-full bg-gray-200 rounded-full h-2.5'>
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  isConverting ? 'bg-blue-600' : 'bg-green-600'
                }`}
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className='flex items-center justify-center gap-2'>
              {isConverting ? (
                <>
                  <Clock className='h-4 w-4 text-blue-600 animate-spin' />
                  <p className='text-sm text-blue-600 font-medium'>
                    Converting to PDF... {uploadProgress}%
                  </p>
                </>
              ) : (
                <p className='text-sm text-gray-600'>
                  Uploading... {uploadProgress}%
                </p>
              )}
            </div>
          </div>
        )}

        {uploadSuccess && (
          <div className='mt-4 p-4 bg-green-50 border border-green-200 rounded-lg'>
            <div className='flex items-center justify-center gap-2 text-green-700'>
              <CheckCircle className='h-5 w-5' />
              <p className='text-sm font-medium'>
                File uploaded successfully! Redirecting to dashboard...
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedFile || isUploading || uploadSuccess}
          className='mt-6 w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2'
        >
          {uploadSuccess ? (
            <>
              <CheckCircle className='h-5 w-5' />
              Upload Complete
            </>
          ) : isUploading ? (
            <>
              {isConverting ? (
                <>
                  <Clock className='h-5 w-5 animate-spin' />
                  Converting...
                </>
              ) : (
                'Uploading...'
              )}
            </>
          ) : (
            'Submit Request'
          )}
        </button>
      </div>
    </div>
  );
};

const ReviewSubmitStep = ({ formData, stripePrices, applicationId, hoaProperties }) => {
  // Check if user just returned from payment
  const [showPaymentSuccess, setShowPaymentSuccess] = React.useState(false);
  const [multiCommunityInfo, setMultiCommunityInfo] = React.useState(null);
  const [multiCommunityPricing, setMultiCommunityPricing] = React.useState(null);
  const [applicationType, setApplicationType] = React.useState(null);
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentSuccess = urlParams.get('payment_success');
      if (paymentSuccess === 'true') {
        setShowPaymentSuccess(true);
      }
    }
  }, []);

  // Determine application type
  React.useEffect(() => {
    const determineAppType = async () => {
      if (formData.hoaProperty && hoaProperties) {
        const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
        if (selectedProperty) {
          try {
            const { determineApplicationType } = await import('../lib/applicationTypes');
            const appType = determineApplicationType(
              formData.submitterType,
              selectedProperty,
              formData.publicOffering
            );
            setApplicationType(appType);
          } catch (error) {
            console.error('Error determining application type:', error);
          }
        }
      }
    };
    determineAppType();
  }, [formData.hoaProperty, formData.submitterType, formData.publicOffering, hoaProperties]);

  // Load multi-community information and pricing
  React.useEffect(() => {
    const loadMultiCommunityInfo = async () => {
      if (formData.hoaProperty && hoaProperties) {
        const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
        if (selectedProperty && selectedProperty.is_multi_community) {
          try {
            const { getLinkedProperties, calculateMultiCommunityPricing } = await import('../lib/multiCommunityUtils');
            const linkedProperties = await getLinkedProperties(selectedProperty.id);
            setMultiCommunityInfo({
              primaryProperty: selectedProperty,
              linkedProperties: linkedProperties
            });
            
            // Calculate pricing for the selected package type
            if (applicationType) {
              const pricing = await calculateMultiCommunityPricing(
                selectedProperty.id,
                formData.packageType || 'standard',
                applicationType,
                null,
                formData.submitterType,
                formData.publicOffering
              );
              setMultiCommunityPricing(pricing);
            }
          } catch (error) {
            console.error('Error loading multi-community info:', error);
          }
        }
      }
    };
    
    loadMultiCommunityInfo();
  }, [formData.hoaProperty, formData.packageType, formData.submitterType, formData.publicOffering, hoaProperties, applicationType]);

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

      {/* Multi-Community Information */}
      {multiCommunityInfo && (
        <div className='bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6'>
          <div className='flex items-start'>
            <Building2 className='h-6 w-6 text-blue-600 mr-3 mt-0.5' />
            <div className='flex-1'>
              <h4 className='text-lg font-semibold text-blue-900 mb-2'>
                Multi-Community Association Detected
              </h4>
              <p className='text-sm text-blue-700 mb-3'>
                Your property is part of multiple community associations. Additional documents and fees have been included for the following associations:
              </p>
              <div className='space-y-2'>
                <div className='flex items-center text-sm'>
                  <span className='w-2 h-2 bg-blue-600 rounded-full mr-2'></span>
                  <span className='font-medium text-blue-900'>{multiCommunityInfo.primaryProperty.name}</span>
                  <span className='ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs'>Primary</span>
                </div>
                {multiCommunityInfo.linkedProperties.map((property, index) => (
                  <div key={index} className='flex items-center text-sm'>
                    <span className='w-2 h-2 bg-blue-400 rounded-full mr-2'></span>
                    <span className='text-blue-800'>{property.property_name}</span>
                  </div>
                ))}
              </div>
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
            {formData.propertyAddress}{formData.unitNumber ? ` ${formData.unitNumber}` : ''}
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

      {formData.submitterType !== 'settlement' && (
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
      )}

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
            <span className='font-medium'>Total:</span> ${(() => {
              // Use multi-community pricing if available (for accurate settlement pricing)
              if (multiCommunityPricing && multiCommunityPricing.total !== undefined && multiCommunityPricing.total !== null) {
                const baseTotal = multiCommunityPricing.total;
                // Only add convenience fee if base total > 0 (for free transactions like VA settlement standard)
                const convenienceFeeTotal = (formData.paymentMethod === 'credit_card' && baseTotal > 0) ? 
                  multiCommunityPricing.totalConvenienceFee : 0;
                return (baseTotal + convenienceFeeTotal).toFixed(2);
              }
              // Fallback to calculateTotal for non-multi-community or when pricing not loaded yet
              return calculateTotal(formData, stripePrices, hoaProperties).toFixed(2);
            })()}
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
  
  // Detect test mode from URL parameter (defaults to LIVE mode)
  const [isTestMode, setIsTestMode] = useState(false);
  
  useEffect(() => {
    // Check URL for test mode parameter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const testCode = params.get('test');
      
      if (testCode) {
        // Test code is present - validate it via API (server-side validation)
        // This is needed because TEST_MODE_CODE is not available on client-side
        fetch(`/api/validate-test-mode?test=${encodeURIComponent(testCode)}`)
          .then(res => res.json())
          .then(data => {
            if (data.valid) {
              // Valid test code - enable test mode and store in session cookie
              setIsTestMode(true);
              setTestModeCookie(true);
              // Test mode enabled via URL parameter
            } else {
              // Invalid test code - use LIVE mode and clear any test mode cookie
              setIsTestMode(false);
              setTestModeCookie(false);
              // Invalid test code, using LIVE mode
            }
          })
          .catch(error => {
            console.error('[Stripe] Error validating test code:', error);
            // On error, default to LIVE mode
            setIsTestMode(false);
            setTestModeCookie(false);
          });
      } else {
        // No test code in URL - check session cookie for persistence
        const cookieTestMode = getTestModeFromCookie();
        setIsTestMode(cookieTestMode);
        
        if (cookieTestMode) {
          // Test mode persisted from session cookie
        } else {
          // Using LIVE mode (default)
        }
      }
    }
  }, []);
  
  // Handle Stripe analytics errors (commonly blocked by ad blockers)
  useEffect(() => {
    const handleStripeErrors = (event) => {
      if (event.message && event.message.includes('r.stripe.com')) {
        // Suppress Stripe analytics errors that are commonly blocked by ad blockers
        event.preventDefault();
        console.warn('Stripe analytics request blocked (likely by ad blocker) - this is normal and does not affect payment functionality');
        return false;
      }
    };

    // Add error listener for unhandled promise rejections
    window.addEventListener('unhandledrejection', handleStripeErrors);
    
    // Cleanup
    return () => {
      window.removeEventListener('unhandledrejection', handleStripeErrors);
    };
  }, []);
  
  // Get auth data from context
  const { 
    user, 
    isAuthenticated, 
    isLoading: authLoading
  } = useApplicantAuth();
  
  // Get auth methods from store
  const { 
    signIn, 
    signUp, 
    signOut, 
    resetPassword,
    profile 
  } = useApplicantAuthStore();
  
  // Get userRole from profile
  const userRole = profile?.role;
  
  // Get router for navigation
  const router = useRouter();
  
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
  const [showAdBlockerWarning, setShowAdBlockerWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    hoaProperty: '',
    propertyAddress: '',
    unitNumber: '',
    submitterType: '',
    publicOffering: false,
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
    closingDate: '', // Optional field - starts empty
    packageType: 'standard',
    paymentMethod: '',
    totalAmount: 317.95,
  });

  // Application type state
  const [applicationType, setApplicationType] = useState('standard');
  const [fieldRequirements, setFieldRequirements] = useState(null);
  const [customMessaging, setCustomMessaging] = useState(null);
  const [formSteps, setFormSteps] = useState([]);

  // Load applications for the current user
  const loadApplications = React.useCallback(async () => {
    if (!user) {
      console.warn('Cannot load applications: user not available');
      return;
    }

    try {
      // Loading applications for user
      let query = supabase
        .from('applications')
        .select('*, hoa_properties(name), application_property_groups(*)')
        .is('deleted_at', null) // Only get non-deleted applications
        .order('created_at', { ascending: false });

      if (userRole !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading applications:', error);
        // If it's an auth/session error, re-throw it so caller can handle it
        if (error.message?.includes('auth') || error.message?.includes('session') || error.message?.includes('JWT') || error.code === 'PGRST301' || error.message?.includes('401')) {
          throw error;
        }
        return;
      }

      // Applications loaded
      setApplications(data || []);
    } catch (error) {
      console.error('Error in loadApplications:', error);
      // Re-throw auth errors so caller can handle them appropriately
      if (error.message?.includes('auth') || error.message?.includes('session') || error.message?.includes('JWT') || error.code === 'PGRST301' || error.message?.includes('401')) {
        throw error;
      }
    }
  }, [user, userRole, supabase]);

  // Load existing draft application
  const loadDraftApplication = React.useCallback(async (appId) => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, hoa_properties(name), application_property_groups(*)')
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
        publicOffering: data.application_type === 'public_offering',
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

      // Update application type from database
      if (data.application_type) {
        const newApplicationType = data.application_type;
        setApplicationType(newApplicationType);
        setFieldRequirements(getFieldRequirements(newApplicationType));
        setCustomMessaging(getApplicationTypeMessaging(newApplicationType));
        setFormSteps(getFormSteps(newApplicationType));
      } else if (data.submitter_type) {
        // Fallback: determine application type from submitter type
        const selectedProperty = hoaProperties?.find(prop => prop.name === data.hoa_properties?.name);
        const newApplicationType = determineApplicationType(data.submitter_type, selectedProperty, data.application_type === 'public_offering');
        setApplicationType(newApplicationType);
        setFieldRequirements(getFieldRequirements(newApplicationType));
        setCustomMessaging(getApplicationTypeMessaging(newApplicationType));
        setFormSteps(getFormSteps(newApplicationType));
      }

      // Return the application data so caller can use it
      return data;
    } catch (error) {
      console.error('Error loading draft:', error);
      alert('Error loading application draft: ' + error.message);
      return null;
    }
  }, [hoaProperties]);

  // Handle payment success redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const paymentSuccess = urlParams.get('payment_success');
    const sessionId = urlParams.get('session_id');
    const appId = urlParams.get('app_id');
    const paymentCancelled = urlParams.get('payment_cancelled');

    // Clean up URL parameters FIRST to prevent navigation errors
    // Only clean if we have payment-related parameters
    if (paymentSuccess || paymentCancelled || sessionId || appId) {
      // Use replaceState to clean URL without triggering navigation
      const cleanUrl = window.location.pathname;
      if (window.location.href !== cleanUrl) {
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    if (paymentSuccess === 'true' && sessionId && appId) {
      // Load the application and check if it's a lender questionnaire
      loadDraftApplication(appId).then((applicationData) => {
        if (!applicationData) {
          console.error('No application data returned from loadDraftApplication');
          return;
        }
        
        // Payment success - processing application
        
        // Check if this is a lender questionnaire application
        // Check both application_type from database and submitter_type as fallback
        const isLenderQuestionnaire = 
          applicationData.application_type === 'lender_questionnaire' ||
          applicationData.submitter_type === 'lender_questionnaire';
        
        if (isLenderQuestionnaire) {
          setCurrentStep(6); // Go to lender questionnaire upload step
        } else {
          setCurrentStep(5); // Go to review step
        }
      }).catch((error) => {
        console.error('Error in payment success handler:', error);
      });
    }

    if (paymentCancelled === 'true' && appId) {
      // Load the application and go back to payment step
      loadDraftApplication(appId).then(() => {
        setCurrentStep(4); // Go back to payment step
      }).catch((error) => {
        console.error('Error loading application after payment cancellation:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount, not on every loadDraftApplication change

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

      // Determine application type if not already set
      let appType = applicationType;
      if (!appType && formData.submitterType && hoaProperty) {
        appType = determineApplicationType(formData.submitterType, hoaProperty, formData.publicOffering);
      }

      const draftData = {
        user_id: user.id,
        hoa_property_id: hoaProperty?.id,
        property_address: formData.propertyAddress,
        unit_number: formData.unitNumber,
        submitter_type: formData.submitterType,
        application_type: appType || 'single_property',
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
        total_amount: calculateTotal(formData, stripePrices, hoaProperties),
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
  }, [user, currentStep, hoaProperties, formData, stripePrices, applicationId, applicationType]);

  // Update application type when submitter type or property changes
  React.useEffect(() => {
    if (formData.submitterType && formData.hoaProperty && hoaProperties) {
      const selectedProperty = hoaProperties.find(prop => prop.name === formData.hoaProperty);
      if (selectedProperty) {
        let newApplicationType = determineApplicationType(formData.submitterType, selectedProperty, formData.publicOffering);
        if (newApplicationType !== applicationType) {
          setApplicationType(newApplicationType);
          setFieldRequirements(getFieldRequirements(newApplicationType));
          setCustomMessaging(getApplicationTypeMessaging(newApplicationType));
          setFormSteps(getFormSteps(newApplicationType));
          
          // Update pricing when application type changes
          updatePricingForApplicationType(newApplicationType);
        }
      }
    }
  }, [formData.submitterType, formData.hoaProperty, formData.publicOffering, hoaProperties, applicationType]);

  // Update pricing based on application type
  const updatePricingForApplicationType = React.useCallback(async (appType) => {
    try {
      const newTotal = await calculateTotalAmount(appType, formData.packageType, formData.paymentMethod);
      setFormData(prev => ({
        ...prev,
        totalAmount: newTotal
      }));
    } catch (error) {
      console.error('Error updating pricing:', error);
    }
  }, [formData.packageType, formData.paymentMethod]);

  // Memoize other handlers
  const nextStep = React.useCallback(async () => {
    if (currentStep < 5) {
      // Save draft before moving to next step
      await saveDraftApplication();
      
      // Skip Transaction Details only for Public Offering Statement flow
      if (currentStep === 2 && formData.submitterType === 'builder' && formData.publicOffering) {
        // Skip Transaction Details for Public Offering Statement flow
        setCurrentStep(4);
      } else {
        setCurrentStep(currentStep + 1);
      }
    }
  }, [currentStep, saveDraftApplication, formData.submitterType, formData.publicOffering]);

  const prevStep = React.useCallback(() => {
    if (currentStep > 1) {
      // Skip Transaction Details only when going back for Public Offering Statement flow
      if (currentStep === 4 && formData.submitterType === 'builder' && formData.publicOffering) {
        setCurrentStep(2);
      } else {
        setCurrentStep(currentStep - 1);
      }
    }
  }, [currentStep, formData.submitterType, formData.publicOffering]);

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
          // Attempting to delete application

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

          // Application deleted successfully, reloading list
          
          // Reload applications to refresh the list
          await loadApplications();
          // Applications reloaded successfully
          
          // Force a small delay to ensure UI updates
          setTimeout(() => {
            // UI should be updated now
          }, 100);
          
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
      if (profile) {
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
        autoFillData = {
          submitterName: fullName || '',
          submitterEmail: profile.email || user.email || '',
        };
      } else {
        autoFillData.submitterEmail = user.email || '';
      }
    }
    
    // Reset form data with auto-populated user info
    setFormData({
      hoaProperty: '',
      propertyAddress: '',
      unitNumber: '',
      submitterType: '',
      publicOffering: false,
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
      closingDate: '', // Optional field - starts empty
      packageType: 'standard',
      paymentMethod: '',
      totalAmount: 317.95,
    });
    
    // Navigate to first step
    setCurrentStep(1);
  }, [user, profile]);

  // Load applications when user or role changes
  useEffect(() => {
    if (user) {
      // Loading applications for user
      loadApplications();
    }
  }, [user, userRole, loadApplications]);
  
  // Debug: log applications count
  useEffect(() => {
    // Applications state updated
  }, [applications]);

  // Add this function to your application submission process
  // This should be called after an application is successfully created

  const createPropertyOwnerForms = async (applicationId, applicationData) => {
    try {
      // Creating property owner forms for application

      // Get application type to determine required forms
        const applicationTypeToUse = applicationData.application_type || applicationType || 'single_property';
      
      // Import the getApplicationTypeData function
      const { getApplicationTypeData } = await import('../lib/applicationTypes');
      
      // Get application type data to determine required forms
      const appTypeData = await getApplicationTypeData(applicationTypeToUse);
      const requiredForms = appTypeData.required_forms || [];

      // Creating forms for application type

      // Determine recipient email (property owner email, or fallback to submitter)
      const recipientEmail =
        applicationData.hoa_properties?.property_owner_email ||
        applicationData.submitter_email ||
        'admin@gmgva.com';

      // Create forms based on application type requirements
      const formsToCreate = requiredForms.map(formType => ({
        application_id: applicationId,
        form_type: formType,
        status: 'not_started',
        access_token: crypto.randomUUID(),
        recipient_email: recipientEmail,
        expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(), // 30 days from now
        created_at: new Date().toISOString()
      }));

      if (formsToCreate.length === 0) {
        // No forms required for this application type
        return [];
      }

      const { data, error } = await supabase
        .from('property_owner_forms')
        .insert(formsToCreate)
        .select();

      if (error) {
        console.error('❌ Error creating forms:', error);
        throw error;
      }

      // Successfully created forms for application
      return data;
    } catch (error) {
      console.error('❌ Failed to create property owner forms:', error);
      // Don't throw error to prevent breaking the application flow
      console.warn('Continuing without creating forms due to error');
      return [];
    }
  };

  const handleAuth = React.useCallback(
    async (email, password, userData = {}) => {
      try {
        if (authMode === 'signin') {
          const result = await signIn(email, password);
          if (result.success) {
            setShowAuthModal(false);
            // Clear form fields on successful sign in
            return { success: true };
          } else {
            // Return error result for modal to display
            const errorMessage = result.error || 'Sign in failed. Please check your credentials and try again.';
            return { success: false, error: errorMessage };
          }
        } else {
          const result = await signUp(email, password, userData);
          if (result.success) {
            setShowAuthModal(false);
            // Show success message
            setSnackbarData({
              message: 'Account created successfully! Please check your email to verify your account.',
              type: 'success'
            });
            setShowSnackbar(true);
            return { success: true };
          } else {
            // Return error result for modal to display
            let errorMessage = result.error || 'Sign up failed. Please try again.';
            // Improve error messages
            if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
              errorMessage = 'This email is already registered. Please sign in instead.';
            } else if (errorMessage.includes('invalid email')) {
              errorMessage = 'Please enter a valid email address.';
            } else if (errorMessage.includes('password')) {
              errorMessage = 'Password must be at least 6 characters long.';
            }
            return { success: false, error: errorMessage };
          }
        }
      } catch (error) {
        console.error('🔐 Auth error:', error);
        let errorMessage = error.message || 'An unexpected error occurred. Please try again.';
        // Improve error messages
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
        return { success: false, error: errorMessage };
      }
    },
    [authMode, signIn, signUp, setSnackbarData, setShowSnackbar]
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
    
    // Force a hard reload to ensure all state is cleared and show non-logged-in view
    window.location.reload();
  }, [signOut]);



  const handleSubmit = async () => {
    // Prevent double submission
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // First, try to find existing application by applicationId or by matching pending payment application
      let existingApplicationId = applicationId;
      
      if (!existingApplicationId) {
        // Try to find a pending payment application for this user with matching details
        const { data: pendingApps, error: searchError } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending_payment')
          .eq('submitter_email', formData.submitterEmail)
          .eq('property_address', formData.propertyAddress)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (searchError) {
          throw new Error('Failed to search for existing application. Please try again.');
        }
          
        if (pendingApps && pendingApps.length > 0) {
          existingApplicationId = pendingApps[0].id;
          setApplicationId(existingApplicationId); // Update state for future use
        }
      }

      if (existingApplicationId) {
        // Update existing application to under_review status
        const { data, error } = await supabase
          .from('applications')
          .update({
            status: 'under_review',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', existingApplicationId)
          .select()
          .single();

        if (error) {
          throw new Error('Failed to update application. Please try again.');
        }

        // CREATE THE PROPERTY OWNER FORMS if not already created
        try {
          await createPropertyOwnerForms(data.id, data);
        } catch (formsError) {
          console.error('Error creating property owner forms:', formsError);
          // Continue even if forms creation fails
        }

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
              applicationType: data.application_type,
            }),
          });

          if (!emailResponse.ok) {
            console.warn('Failed to send confirmation email, but application was submitted successfully');
          }
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Don't fail the submission if email fails
        }

        // Create notifications for property owner and staff/admin
        try {
          // Creating notifications for application
          const notificationResponse = await fetch('/api/notifications/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ applicationId: data.id }),
          });

          if (notificationResponse.ok) {
            const notificationResult = await notificationResponse.json();
            // Notifications created successfully
          } else {
            const errorText = await notificationResponse.text();
            console.warn(`[Submit] Failed to create notifications:`, errorText);
          }
        } catch (notificationError) {
          console.error('[Submit] Error creating notifications:', notificationError);
          // Don't fail the submission if notification creation fails
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

        if (!hoaProperty) {
          throw new Error('Please select a valid HOA property.');
        }

        const applicationData = {
          user_id: user.id,
          hoa_property_id: hoaProperty.id,
          property_address: formData.propertyAddress,
          unit_number: formData.unitNumber,
          submitter_type: formData.submitterType,
          application_type: applicationType,
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
          total_amount: calculateTotal(formData, stripePrices, hoaProperties),
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('applications')
          .insert([applicationData])
          .select();

        if (error) {
          let errorMessage = 'Failed to submit application. ';
          if (error.message.includes('duplicate') || error.message.includes('unique')) {
            errorMessage += 'An application with these details already exists.';
          } else if (error.message.includes('foreign key')) {
            errorMessage += 'Invalid property selected. Please try again.';
          } else {
            errorMessage += 'Please check your information and try again.';
          }
          throw new Error(errorMessage);
        }

        // CREATE THE PROPERTY OWNER FORMS
        try {
          await createPropertyOwnerForms(data[0].id, data[0]);
        } catch (formsError) {
          console.error('Error creating property owner forms:', formsError);
          // Continue even if forms creation fails
        }

        // Create notifications for property owner and staff/admin
        try {
          // Creating notifications for new application
          const notificationResponse = await fetch('/api/notifications/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ applicationId: data[0].id }),
          });

          if (notificationResponse.ok) {
            const notificationResult = await notificationResponse.json();
            // Notifications created successfully
          } else {
            const errorText = await notificationResponse.text();
            console.warn(`[Submit] Failed to create notifications:`, errorText);
          }
        } catch (notificationError) {
          console.error('[Submit] Error creating notifications:', notificationError);
          // Don't fail the submission if notification creation fails
        }

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
              applicationType: data[0].application_type,
            }),
          });

          if (!emailResponse.ok) {
            console.warn('Failed to send confirmation email, but application was submitted successfully');
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

      // Reset form and navigation
      setCurrentStep(0);
      await loadApplications();
      setApplicationId(null);

      // Reset form
      setFormData({
        hoaProperty: '',
        propertyAddress: '',
        unitNumber: '',
        submitterType: '',
        publicOffering: false,
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
        closingDate: '', // Optional field - starts empty
        packageType: 'standard',
        paymentMethod: '',
        totalAmount: 317.95,
      });
    } catch (error) {
      console.error('Error submitting application:', error);
      // Show user-friendly error message
      let errorMessage = error.message || 'An unexpected error occurred while submitting your application.';
      
      // Improve error messages
      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      }
      
      setSnackbarData({
        message: errorMessage,
        type: 'error'
      });
      setShowSnackbar(true);
    } finally {
      setIsSubmitting(false);
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
      compliance_completed: {
        color: 'bg-blue-100 text-blue-800',
        icon: Clock,
        label: 'Under Review',
      },
      approved: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Completed',
      },
      completed: {
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
      const [filterStatus, setFilterStatus] = useState('all');
      const [filterType, setFilterType] = useState('all');
      const [expandedAppId, setExpandedAppId] = useState(null);
      const [openTypeDropdown, setOpenTypeDropdown] = useState(false);
      const [openStatusDropdown, setOpenStatusDropdown] = useState(false);
      
      // Custom Dropdown Component
      const CustomDropdown = ({ value, onChange, options, placeholder, icon: Icon, width = 'w-48', isOpen, setIsOpen }) => {
        const dropdownRef = React.useRef(null);
        
        React.useEffect(() => {
          const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
              setIsOpen(false);
            }
          };
          
          if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
          }
        }, [isOpen, setIsOpen]);
        
        const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;
        
        return (
          <div className={`relative ${width}`} ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className='relative w-full pl-10 pr-10 py-2.5 text-sm font-normal text-left border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm bg-white hover:border-gray-400 transition-all cursor-pointer min-h-[40px] flex items-center'
            >
              <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10'>
                <Icon className='h-4 w-4 text-gray-400' />
              </div>
              <span className='block truncate'>{selectedLabel}</span>
              <div className='absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none z-10'>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            
            {isOpen && (
              <div className='absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-auto'>
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-normal leading-normal transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      value === option.value
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      };

      // Filter applications: Show all active apps, but hide completed ones older than 10 days
      const visibleApplications = applications.filter(app => {
        // 1. Filter by Status
        if (filterStatus !== 'all') {
          // Handle special "active" status or map UI status to DB status if needed
          if (filterStatus === 'active' && (app.status === 'completed' || app.status === 'approved' || app.status === 'rejected')) return false;
          if (filterStatus === 'completed' && app.status !== 'completed' && app.status !== 'approved') return false;
          if (filterStatus !== 'active' && filterStatus !== 'completed' && app.status !== filterStatus) return false;
        }

        // 2. Filter by Application Type
        if (filterType !== 'all') {
          // Map friendly names if needed, or use raw values
          if (app.application_type !== filterType && app.submitter_type !== filterType) return false;
        }

        // 3. Auto-cleanup for completed apps (10 days) - Only applies if showing "All" or "Completed"
        if (app.status === 'approved' || app.status === 'completed') {
           const tenDaysAgo = new Date();
           tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
           const actionDate = app.updated_at ? new Date(app.updated_at) : new Date(app.submitted_at || app.created_at);
           // If specifically filtering for completed, maybe show them all? The requirement said "remove themselves", so let's keep it.
           if (actionDate < tenDaysAgo) return false;
        }
        
        return true;
      });

      // Get unique application types for filter dropdown
      const applicationTypes = [...new Set(applications.map(app => app.application_type || app.submitter_type))].filter(Boolean);
      
      // Helper function to format application type names
      const formatApplicationType = (type) => {
        if (!type) return '';
        
        const typeLower = type.toLowerCase();
        
        // Handle settlement types
        if (typeLower.includes('settlement')) {
          if (typeLower.includes('nc') || typeLower.includes('north_carolina') || typeLower.includes('north carolina')) {
            return 'Settlement - North Carolina';
          }
          // Default to Virginia for settlement types
          return 'Settlement - Virginia';
        }
        
        // Handle other types - normalize first
        const formatted = type
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .trim();
        
        const formattedLower = formatted.toLowerCase();
        
        // Filter out "standard"
        if (formattedLower === 'standard') {
          return null;
        }
        
        // Map specific types to exact format
        if (formattedLower === 'single property' || formattedLower === 'single_property') {
          return 'Single Property';
        }
        if (formattedLower === 'multi community' || formattedLower === 'multi_community') {
          return 'Multi Community';
        }
        if (formattedLower === 'lender questionnaire' || formattedLower === 'lender_questionnaire') {
          return 'Lender Questionnaire';
        }
        if (formattedLower === 'public offering' || formattedLower === 'public_offering') {
          return 'Public Offering';
        }
        
        return formatted;
      };
      
      // Filter and format application types
      const formattedApplicationTypes = applicationTypes
        .map(type => ({ value: type, label: formatApplicationType(type) }))
        .filter(item => item.label !== null && item.label !== '')
        .sort((a, b) => {
          // Define sort order
          const order = [
            'Single Property',
            'Multi Community',
            'Settlement - Virginia',
            'Settlement - North Carolina',
            'Lender Questionnaire',
            'Public Offering'
          ];
          const indexA = order.indexOf(a.label);
          const indexB = order.indexOf(b.label);
          // If both are in the order, sort by order; otherwise keep original order
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.label.localeCompare(b.label);
        });

      return (
        <div className='space-y-0 bg-white'>
          {/* Hero Section - First Fold */}
          <div className='relative bg-white overflow-hidden min-h-[90vh] flex flex-col justify-center items-center'>
            <div className='absolute inset-0'>
              <div className='absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-green-50/50 to-transparent opacity-60'></div>
              <div className='absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-white to-transparent'></div>
            </div>

            <div className='relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10 flex flex-col justify-center flex-grow'>
              <div className='flex justify-center mb-12 animate-fadeIn'>
                <div className='p-10 bg-white rounded-[2.5rem] shadow-xl border border-gray-100 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1'>
                  <Image src={companyLogo} alt='GMG Logo' width={220} height={220} className='object-contain' />
                </div>
              </div>
              <h1 className='text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-8 leading-tight animate-slideUp'>
                Welcome to <br/>
                <span className='text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600 drop-shadow-sm'>GMG ResaleFlow</span>
              </h1>
              <p className='mt-6 max-w-3xl mx-auto text-xl md:text-2xl text-gray-600 leading-relaxed animate-slideUp delay-100 font-light'>
                The professional solution for Virginia HOA resale certificates.
                <span className='block mt-2 font-normal text-gray-800'>Fast, compliant, and efficient document processing.</span>
              </p>
              
              <div className='mt-16 flex justify-center gap-6 animate-slideUp delay-200 pb-16'>
                {isAuthenticated ? (
                  <button
                    onClick={startNewApplication}
                    className='group relative inline-flex items-center justify-center px-10 py-5 text-xl font-bold text-white transition-all duration-300 bg-green-600 font-pj rounded-2xl focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-green-600 hover:bg-green-700 shadow-xl hover:shadow-2xl hover:-translate-y-1'
                  >
                    <div className='absolute -inset-3 rounded-2xl bg-green-400 opacity-20 group-hover:opacity-40 blur transition duration-200'></div>
                    <FileText className='w-7 h-7 mr-3' />
                    Start New Application
                  </button>
                ) : (
                  <div className='flex flex-col sm:flex-row gap-5'>
                    <button
                      onClick={() => {
                        setAuthMode('signup');
                        setShowAuthModal(true);
                      }}
                      className='inline-flex items-center px-10 py-5 text-xl font-bold text-white transition-all duration-300 bg-green-600 rounded-2xl hover:bg-green-700 shadow-xl hover:shadow-2xl hover:-translate-y-1'
                    >
                      <UserPlus className='w-7 h-7 mr-3' />
                      Create Account
                    </button>
                    <button
                      onClick={() => {
                        setAuthMode('signin');
                        setShowAuthModal(true);
                      }}
                      className='inline-flex items-center px-10 py-5 text-xl font-bold text-green-700 transition-all duration-300 bg-green-50 border-2 border-green-100 rounded-2xl hover:bg-green-100 hover:border-green-300'
                    >
                      Sign In
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Scroll Indicator */}
            <div className='absolute bottom-8 w-full flex justify-center animate-bounce z-10'>
              <div className='flex flex-col items-center text-gray-400'>
                <span className='text-sm font-medium mb-2'>Scroll to learn more</span>
                <ChevronDown className='h-6 w-6' />
              </div>
            </div>
          </div>

          {/* Recent Applications - Only show if user has any */}
          {isAuthenticated && applications.length > 0 && (
             <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
                <div className='bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-100 transition-all duration-200 overflow-visible'>
                  {/* ... Recent Applications content ... */}
                  {/* Keep existing Recent Applications logic here, wrapped in cleaner container */}
                  <div className='p-6 border-b border-gray-200 bg-white/50 backdrop-blur-sm relative z-10 overflow-visible rounded-t-xl'>
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                      <div className='flex items-center gap-3'>
                        <div className='p-2.5 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md'>
                          <FileText className='h-6 w-6 text-white' />
                        </div>
                        <div>
                          <h3 className='text-xl font-bold text-gray-900'>
                            Recent Applications
                          </h3>
                          <p className='text-sm text-gray-500 mt-0.5 hidden md:block'>
                            Track and manage your resale certificates
                          </p>
                        </div>
                      </div>
                      
                      {/* Filters */}
                      <div className='flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center'>
                        <CustomDropdown
                          value={filterType}
                          onChange={setFilterType}
                          options={[
                            { value: 'all', label: 'All Types' },
                            ...formattedApplicationTypes
                          ]}
                          placeholder='All Types'
                          icon={FileText}
                          width='w-full sm:w-48'
                          isOpen={openTypeDropdown}
                          setIsOpen={setOpenTypeDropdown}
                        />
                        
                        <CustomDropdown
                          value={filterStatus}
                          onChange={setFilterStatus}
                          options={[
                            { value: 'all', label: 'All Statuses' },
                            { value: 'active', label: 'Active' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'draft', label: 'Drafts' }
                          ]}
                          placeholder='All Statuses'
                          icon={Filter}
                          width='w-full sm:w-40'
                          isOpen={openStatusDropdown}
                          setIsOpen={setOpenStatusDropdown}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className='p-6 bg-gray-50/50 overflow-hidden rounded-b-xl'>
                    <div className='space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar'>
                    {visibleApplications.length > 0 ? (
                      visibleApplications.map((app) => {
                      // Fix for premature "Completed" status when PDF is not generated
                      let displayStatus = app.status;
                      const propertyGroups = app.application_property_groups || [];
                      const isMultiCommunity = app.application_type === 'multi_community' || 
                                                (app.application_type?.startsWith('settlement') && propertyGroups.length > 1) ||
                                                propertyGroups.length > 1;
                      const isSettlementApp = app.submitter_type === 'settlement' || 
                                             app.application_type?.startsWith('settlement');
                      
                      // For multi-community applications, accurately check completion status
                      if (isMultiCommunity && propertyGroups.length > 0) {
                        let allPropertiesCompleted = true;
                        
                        // Check each property group for complete workflow
                        for (const group of propertyGroups) {
                          let propertyCompleted = false;
                          
                          if (isSettlementApp) {
                            // Settlement multi-community: check settlement form, PDF, and email
                            const settlementForm = app.property_owner_forms?.find(
                              form => form.form_type === 'settlement_form' && form.property_group_id === group.id
                            );
                            const formCompleted = settlementForm?.status === 'completed';
                            const pdfCompleted = group.pdf_status === 'completed' || !!group.pdf_url;
                            const emailCompleted = group.email_status === 'completed' || !!group.email_completed_at;
                            
                            propertyCompleted = formCompleted && pdfCompleted && emailCompleted;
                          } else {
                            // Standard multi-community: check inspection form, resale form, PDF, and email
                            const inspectionStatus = group.inspection_status ?? 'not_started';
                            const resaleStatus = group.status === 'completed';
                            const formsCompleted = inspectionStatus === 'completed' && resaleStatus;
                            const pdfCompleted = group.pdf_status === 'completed' || !!group.pdf_url;
                            const emailCompleted = group.email_status === 'completed' || !!group.email_completed_at;
                            
                            propertyCompleted = formsCompleted && pdfCompleted && emailCompleted;
                          }
                          
                          if (!propertyCompleted) {
                            allPropertiesCompleted = false;
                            break;
                          }
                        }
                        
                        if (allPropertiesCompleted) {
                          displayStatus = 'completed';
                        } else {
                          // If not all are completed, show as under_review (or keep current status if it's already in progress)
                          if (displayStatus !== 'draft' && displayStatus !== 'pending_payment' && displayStatus !== 'submitted') {
                            displayStatus = 'under_review';
                          }
                        }
                      } else if (app.status === 'completed' || app.status === 'approved' || app.status === 'compliance_completed') {
                        // For single property applications, check if PDF exists
                        const isSettlement = app.submitter_type === 'settlement' || app.application_type?.startsWith('settlement');
                        const hasPdf = isSettlement ? (app.settlement_pdf_url || app.pdf_url) : app.pdf_url;
                        
                        if (!hasPdf) {
                          displayStatus = 'under_review';
                        }
                      }

                      const StatusIcon = statusConfig[displayStatus]?.icon || Clock;
                      const statusConfigItem = statusConfig[displayStatus];
                      // Extract colors for custom styling if needed, or use classes
                      // Use a cleaner pill design
                      let statusClasses = 'bg-gray-100 text-gray-700 border-gray-200';
                      
                      if (displayStatus === 'approved' || displayStatus === 'completed') {
                        statusClasses = 'bg-green-50 text-green-700 border-green-200';
                      } else if (displayStatus === 'under_review') {
                        statusClasses = 'bg-blue-50 text-blue-700 border-blue-200';
                      } else if (displayStatus === 'draft') {
                        statusClasses = 'bg-gray-50 text-gray-600 border-gray-200';
                      } else if (displayStatus === 'pending_payment') {
                        statusClasses = 'bg-amber-50 text-amber-700 border-amber-200';
                      }

                      // Check if application can be deleted (draft or pending_payment)
                      const canDelete = app.status === 'draft' || app.status === 'pending_payment';
                      const isCompleted = displayStatus === 'completed' || displayStatus === 'approved';
                      const isExpanded = expandedAppId === app.id;

                      return (
                        <div 
                          key={app.id} 
                          className={`group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 relative overflow-hidden ${isExpanded ? 'ring-2 ring-green-500 ring-opacity-50' : ''}`}
                        >
                          {/* Status bar accent on left */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                            displayStatus === 'approved' || displayStatus === 'completed' ? 'bg-green-500' :
                            displayStatus === 'pending_payment' ? 'bg-amber-500' :
                            displayStatus === 'draft' ? 'bg-gray-300' :
                            'bg-blue-500'
                          }`} />

                          <div className='p-5 pl-7'>
                            <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                              <div className='flex-1 min-w-0'>
                                <div className='flex items-center gap-2 mb-1'>
                                  <h4 className='text-base font-bold text-gray-900 truncate'>
                                    {app.hoa_properties?.name}
                                  </h4>
                                  <span className='text-gray-300'>|</span>
                                  <p className='text-sm text-gray-600 truncate'>
                                    {app.property_address}
                                  </p>
                                </div>
                                
                                <div className='flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-gray-500'>
                                  <div className='flex items-center gap-1.5'>
                                    <Calendar className='h-4 w-4 text-gray-400' />
                                    <span>
                                      {app.submitted_at
                                        ? `Submitted: ${new Date(app.submitted_at).toLocaleDateString()}`
                                        : `Created: ${new Date(app.created_at).toLocaleDateString()}`}
                                    </span>
                                  </div>
                                  
                                  {isCompleted && (
                                    <div className='flex items-center gap-1.5 text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-md'>
                                      <CheckCircle className='h-3.5 w-3.5' />
                                      <span>Completed: {new Date(app.updated_at).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                  
                                  {app.status === 'pending_payment' && app.total_amount > 0 && (
                                    <div className='flex items-center gap-1.5 font-medium text-gray-700 bg-gray-50 px-2 py-0.5 rounded-md'>
                                      <DollarSign className='h-3.5 w-3.5 text-gray-400' />
                                      <span>${app.total_amount}</span>
                                    </div>
                                  )}

                                  {isMultiCommunity && (
                                    <div className='flex items-center gap-1.5 font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md'>
                                      <Building2 className='h-3.5 w-3.5 text-blue-500' />
                                      <span>{propertyGroups.length} Properties</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className='flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-0 border-gray-100 pt-4 md:pt-0'>
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusClasses} shadow-sm`}
                                >
                                  <StatusIcon className='h-3.5 w-3.5 mr-1.5' />
                                  {statusConfig[displayStatus]?.label || displayStatus}
                                </span>
                                
                                <div className='flex items-center gap-2'>
                                  {(app.status === 'draft' || app.status === 'pending_payment') && (
                                    <button
                                      onClick={() => {
                                        loadDraftApplication(app.id).then(() => {
                                          setCurrentStep(app.status === 'pending_payment' ? 4 : 1);
                                        });
                                      }}
                                      className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm hover:shadow'
                                      title='Resume Application'
                                    >
                                      <FileText className='h-4 w-4' />
                                      Resume
                                    </button>
                                  )}
                                  
                                  {canDelete && (
                                    <button
                                      onClick={() => deleteUnpaidApplication(app.id, app.status)}
                                      className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors'
                                      title={`Delete ${app.status === 'draft' ? 'Draft' : 'Application'}`}
                                    >
                                      <Trash2 className='h-4 w-4' />
                                      Delete
                                    </button>
                                  )}
                                  
                                  {/* Accordion Toggle - Only for Multi-Community */}
                                  {isMultiCommunity && (
                                    <button 
                                      onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                                      className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                                    >
                                      {isExpanded ? <ChevronUp className='h-5 w-5' /> : <ChevronDown className='h-5 w-5' />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content for Multi-Community */}
                          {isMultiCommunity && isExpanded && (
                            <div className='border-t border-gray-200 bg-gray-50 p-5 animate-fadeIn'>
                              <h5 className='text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2'>
                                <Building2 className='h-4 w-4 text-gray-500' />
                                Property Details
                              </h5>
                              <div className='space-y-3'>
                                {[...propertyGroups]
                                  .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
                                  .map((prop, idx) => {
                                  // Determine status for individual property
                                  let propStatus = 'In Progress';
                                  let propStatusColor = 'bg-blue-100 text-blue-800';
                                  let PropIcon = Clock;

                                  if (prop.pdf_url) {
                                    propStatus = 'Completed';
                                    propStatusColor = 'bg-green-100 text-green-800';
                                    PropIcon = CheckCircle;
                                  } else if (prop.form_data) {
                                    propStatus = 'Under Review';
                                    PropIcon = FileText;
                                  }

                                  return (
                                    <div key={prop.id || idx} className='bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between'>
                                      <div className='flex items-center gap-3'>
                                        <div className='h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600'>
                                          {idx + 1}
                                        </div>
                                        <div>
                                          <p className='text-sm font-medium text-gray-900'>{prop.property_name}</p>
                                          <p className='text-xs text-gray-500'>{prop.property_location || 'Virginia'}</p>
                                        </div>
                                      </div>
                                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${propStatusColor}`}>
                                        <PropIcon className='h-3 w-3 mr-1' />
                                        {propStatus}
                                      </span>
                                    </div>
                                  );
                                })}
                                {propertyGroups.length === 0 && (
                                  <p className='text-sm text-gray-500 italic'>No properties found for this group.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className='flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-xl border border-dashed border-gray-300'>
                      <div className='p-4 bg-gray-50 rounded-full mb-3'>
                        <Filter className='h-8 w-8 text-gray-400' />
                      </div>
                      <h3 className='text-lg font-medium text-gray-900'>No applications found</h3>
                      <p className='text-gray-500 mt-1 max-w-sm'>
                        We couldn't find any applications matching your current filters. Try adjusting your search criteria.
                      </p>
                      <button 
                        onClick={() => { setFilterStatus('all'); setFilterType('all'); }}
                        className='mt-4 text-sm text-green-600 font-medium hover:text-green-700 hover:underline'
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                  </div>
                  </div>
                </div>
              </div>
          )}
          
          {isAuthenticated && applications.length === 0 && (
             <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
                <div className='relative bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 p-12 text-center overflow-hidden'>
                  <div className='absolute inset-0 bg-grid-slate-50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]'></div>
                  <div className='relative z-10'>
                    <div className='w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-sm'>
                      <FileText className='h-10 w-10 text-green-600' />
                    </div>
                    <h3 className='text-2xl font-bold text-gray-900 mb-3'>No applications yet</h3>
                    <p className='text-gray-500 max-w-md mx-auto text-lg mb-8'>
                      Get started by creating your first resale certificate application. We'll guide you through the process.
                    </p>
                    <button
                      onClick={startNewApplication}
                      className='text-green-600 font-semibold hover:text-green-700 flex items-center justify-center gap-2 mx-auto hover:underline'
                    >
                      Start your first application <ArrowRight className='w-4 h-4'/>
                    </button>
                  </div>
                </div>
             </div>
          )}

          {/* Second Fold: How It Works */}
          <div className='bg-slate-50 py-24 border-t border-gray-200'>
            <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
              <div className='text-center mb-16'>
                <span className='text-green-600 font-semibold tracking-wider uppercase text-sm'>Process</span>
                <h3 className='text-4xl font-extrabold text-gray-900 mt-2'>How It Works</h3>
                <p className='mt-4 text-xl text-gray-600 max-w-2xl mx-auto'>Three simple steps to get your documents processed quickly and accurately.</p>
              </div>
              
              <div className='grid grid-cols-1 md:grid-cols-3 gap-12 relative'>
                {/* Connector Line (Desktop) */}
                <div className='hidden md:block absolute top-12 left-[16%] right-[16%] h-1 bg-gradient-to-r from-blue-200 via-yellow-200 to-green-200 -z-10 rounded-full'></div>

                {/* Step 1 */}
                <div className='bg-white p-10 rounded-3xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 relative group'>
                  <div className='absolute -top-6 left-1/2 transform -translate-x-1/2'>
                     <div className='w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md ring-4 ring-white'>1</div>
                  </div>
                  <div className='w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner group-hover:scale-110 transition-transform duration-300'>
                    <FileText className='h-10 w-10 text-blue-600' />
                  </div>
                  <h4 className='text-2xl font-bold text-gray-900 mb-4 text-center'>Submit Application</h4>
                  <p className='text-gray-600 text-center leading-relaxed'>
                    Enter property details and select your processing speed. Our smart form guides you through requirements.
                  </p>
                </div>

                {/* Step 2 */}
                <div className='bg-white p-10 rounded-3xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 relative group'>
                  <div className='absolute -top-6 left-1/2 transform -translate-x-1/2'>
                     <div className='w-12 h-12 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md ring-4 ring-white'>2</div>
                  </div>
                  <div className='w-20 h-20 bg-yellow-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner group-hover:scale-110 transition-transform duration-300'>
                    <Clock className='h-10 w-10 text-yellow-600' />
                  </div>
                  <h4 className='text-2xl font-bold text-gray-900 mb-4 text-center'>Processing</h4>
                  <p className='text-gray-600 text-center leading-relaxed'>
                    We perform compliance inspections and gather all necessary HOA documents and financials.
                  </p>
                </div>

                {/* Step 3 */}
                <div className='bg-white p-10 rounded-3xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 relative group'>
                  <div className='absolute -top-6 left-1/2 transform -translate-x-1/2'>
                     <div className='w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md ring-4 ring-white'>3</div>
                  </div>
                  <div className='w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner group-hover:scale-110 transition-transform duration-300'>
                    <CheckCircle className='h-10 w-10 text-green-600' />
                  </div>
                  <h4 className='text-2xl font-bold text-gray-900 mb-4 text-center'>Delivery</h4>
                  <p className='text-gray-600 text-center leading-relaxed'>
                    Receive your complete, compliant resale certificate package digitally and securely.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Last Fold: Pricing Options */}
          <div className='bg-white py-24'>
            <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
              <div className='text-center mb-16'>
                 <span className='text-green-600 font-semibold tracking-wider uppercase text-sm'>Pricing</span>
                <h3 className='text-4xl font-extrabold text-gray-900 mt-2'>Transparent Pricing</h3>
                <p className='mt-4 text-xl text-gray-600'>Choose the turnaround time that fits your needs.</p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto'>
                {/* Standard */}
                <div className='bg-white p-10 rounded-3xl shadow-xl border border-gray-100 hover:border-gray-300 transition-all duration-300 flex flex-col transform hover:-translate-y-1'>
                  <div className='mb-6'>
                    <span className='inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase bg-gray-100 text-gray-600'>
                      Standard
                    </span>
                  </div>
                  <h4 className='text-3xl font-bold text-gray-900 mb-2'>
                    {formData.submitterType === 'lender_questionnaire' ? 'Standard' : 'Standard Processing'}
                  </h4>
                  <div className='flex items-baseline mb-2'>
                    <span className='text-5xl font-extrabold text-gray-900'>
                      {(() => {
                        if (formData.submitterType === 'lender_questionnaire') {
                          const pricing = getPricing('lender_questionnaire', false);
                          return `$${(pricing.base / 100).toFixed(2)}`;
                        }
                        return '$317.95';
                      })()}
                    </span>
                  </div>
                  <p className='text-gray-500 mb-8 text-lg font-medium'>
                    {formData.submitterType === 'lender_questionnaire' ? '10 Calendar Days' : '10-15 business days turnaround'}
                  </p>
                  <div className='flex-1 border-t border-gray-100 pt-8 mb-8'>
                    <ul className='space-y-5'>
                      {[
                        'Complete Virginia Resale Certificate',
                        'HOA Documents Package',
                        'Compliance Inspection Report',
                        'Digital Delivery'
                      ].map((item, i) => (
                        <li key={i} className='flex items-start'>
                          <div className='flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center mt-0.5'>
                             <CheckCircle className='h-4 w-4 text-green-600' />
                          </div>
                          <span className='ml-3 text-gray-700 text-base'>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button 
                    onClick={() => {
                        // Scroll to top if authenticated, or show sign up
                        if (isAuthenticated) {
                           window.scrollTo({ top: 0, behavior: 'smooth' });
                           startNewApplication();
                        } else {
                           setAuthMode('signup');
                           setShowAuthModal(true);
                        }
                    }}
                    className='w-full py-4 px-6 bg-gray-50 hover:bg-gray-100 text-gray-900 font-bold text-lg rounded-2xl transition-colors border border-gray-200'
                  >
                    Select Standard
                  </button>
                </div>

                {/* Rush */}
                <div className='bg-white p-10 rounded-3xl shadow-2xl border-2 border-orange-400 relative flex flex-col transform hover:-translate-y-1 transition-transform duration-300 overflow-hidden'>
                  <div className='absolute top-0 right-0'>
                     <div className='bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-2xl uppercase tracking-wide'>
                        Recommended
                     </div>
                  </div>
                  <div className='mb-6'>
                    <span className='inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase bg-orange-100 text-orange-700'>
                      Rush
                    </span>
                  </div>
                  <h4 className='text-3xl font-bold text-gray-900 mb-2'>
                    {formData.submitterType === 'lender_questionnaire' ? 'Rush' : 'Rush Processing'}
                  </h4>
                  <div className='flex items-baseline mb-2'>
                    <span className='text-5xl font-extrabold text-gray-900'>
                      {(() => {
                        if (formData.submitterType === 'lender_questionnaire') {
                          const pricing = getPricing('lender_questionnaire', true);
                          return `$${(pricing.total / 100).toFixed(2)}`;
                        }
                        return '$388.61';
                      })()}
                    </span>
                  </div>
                  <p className='text-gray-500 mb-8 text-lg font-medium'>
                    {formData.submitterType === 'lender_questionnaire' ? '3 Business Days' : '5 business days guaranteed'}
                  </p>
                  <div className='flex-1 border-t border-orange-100 pt-8 mb-8'>
                    <ul className='space-y-5'>
                      {[
                        'Everything in Standard',
                        'Priority Queue Processing',
                        'Expedited Compliance Inspection',
                        '5-Day Completion Guarantee'
                      ].map((item, i) => (
                        <li key={i} className='flex items-start'>
                          <div className='flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center mt-0.5'>
                             <CheckCircle className='h-4 w-4 text-orange-500' />
                          </div>
                          <span className='ml-3 text-gray-700 text-base'>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button 
                    onClick={() => {
                        if (isAuthenticated) {
                           window.scrollTo({ top: 0, behavior: 'smooth' });
                           startNewApplication();
                        } else {
                           setAuthMode('signup');
                           setShowAuthModal(true);
                        }
                    }}
                    className='w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-lg rounded-2xl transition-all shadow-md hover:shadow-lg'
                  >
                    Select Rush
                  </button>
                </div>
              </div>
            </div>
          </div>
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
                          ? formatDate(app.submitted_at)
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

  // Form Step Components - dynamically adjust based on application type
  const steps = React.useMemo(() => {
    if (applicationType === 'lender_questionnaire') {
      return [
        { number: 1, title: 'HOA Selection', icon: Building2 },
        { number: 2, title: 'Submitter Info', icon: User },
        { number: 3, title: 'Transaction Details', icon: Users },
        { number: 4, title: 'Package & Payment', icon: CreditCard },
        { number: 5, title: 'Review & Submit', icon: CheckCircle },
        { number: 6, title: 'Upload Lender Form', icon: Upload },
      ];
    }
    return [
      { number: 1, title: 'HOA Selection', icon: Building2 },
      { number: 2, title: 'Submitter Info', icon: User },
      { number: 3, title: 'Transaction Details', icon: Users },
      { number: 4, title: 'Package & Payment', icon: CreditCard },
      { number: 5, title: 'Review & Submit', icon: CheckCircle },
    ];
  }, [applicationType]);

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
            hoaProperties={hoaProperties}
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
            setFormData={setFormData}
            handleInputChange={handleInputChange}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            applicationId={applicationId}
            setApplicationId={setApplicationId}
            user={user}
            hoaProperties={hoaProperties}
            setShowAuthModal={setShowAuthModal}
            stripePrices={stripePrices}
            applicationType={applicationType}
            setSnackbarData={setSnackbarData}
            setShowSnackbar={setShowSnackbar}
            loadApplications={loadApplications}
            isTestMode={isTestMode}
          />
        );
      case 5:
        return (
          <ReviewSubmitStep
            formData={formData}
            stripePrices={stripePrices}
            applicationId={applicationId}
            hoaProperties={hoaProperties}
          />
        );
      case 6:
        // Lender Questionnaire Upload Step
        return (
          <LenderQuestionnaireUploadStep
            formData={formData}
            applicationId={applicationId}
            setCurrentStep={setCurrentStep}
            setSnackbarData={setSnackbarData}
            setShowSnackbar={setShowSnackbar}
            loadApplications={loadApplications}
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
                  <Image src={companyLogo} alt='GMG Logo' width={50} height={50} className='object-contain' />
                  <div>
                    <p className='text-lg font-semibold text-gray-700'>
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
            resetPassword={resetPassword}
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

        {/* Ad Blocker Warning Modal */}
        <AdBlockerWarningModal
          isOpen={showAdBlockerWarning}
          onClose={() => setShowAdBlockerWarning(false)}
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
                <Image src={companyLogo} alt='GMG Logo' width={50} height={50} className='object-contain' />
                <div>
                  <p className='text-lg font-semibold text-gray-700'>
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
                    !formData.submitterEmail ||
                    (formData.submitterType === 'settlement' && !formData.closingDate))) ||
                (currentStep === 3 &&
                  (!formData.sellerName ||
                    !formData.sellerEmail ||
                    !formData.sellerPhone))
              }
              className='px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
            >
              Continue
              <FileText className='h-4 w-4' />
            </button>
          ) : currentStep === 5 ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`px-8 py-3 bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 ${
                isSubmitting 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-green-800'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className='animate-spin h-5 w-5 text-white' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className='h-5 w-5' />
                  {applicationId ? 'Submit Application' : `Submit Application & Pay $${calculateTotal(formData, stripePrices, hoaProperties).toFixed(2)}`}
                </>
              )}
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
          resetPassword={resetPassword}
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