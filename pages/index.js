import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { loadStripe } from '@stripe/stripe-js';
import { getStripeWithFallback, getFriendlyPaymentErrorMessage } from '../lib/stripe';
import { getTestModeFromRequest, setTestModeCookie, getTestModeFromCookie } from '../lib/stripeMode';
import { useAppContext } from '../lib/AppContext';
import { useApplicantAuth } from '../providers/ApplicantAuthProvider';
import useApplicantAuthStore from '../stores/applicantAuthStore';
import useImpersonationStore from '../stores/impersonationStore';
import { fetchWithImpersonation } from '../lib/apiWithImpersonation';
import ImpersonationBanner from '../components/ImpersonationBanner';
import useRequireVerifiedEmail from '../hooks/useRequireVerifiedEmail';
import MultiEmailInput from '../components/common/MultiEmailInput';
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
import { parseEmails, formatEmailsForStorage, validateEmails } from '../lib/emailUtils';
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
  Info,
  Link,
  AlertTriangle,
  Trash2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Filter,
  Edit,
  RefreshCw,
  Calendar,
  Plus,
  ArrowRight,
  Mail,
  Loader2,
  Eye,
  EyeOff,
  Hash,
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

// Helper function to clean property name (remove "Property" suffix)
const cleanPropertyName = (name) => {
  if (!name) return name;
  return name.replace(/\s+Property$/i, '').trim();
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
          
          // Generate notification with actual property name
          const notification = generateMultiCommunityNotification(hoa.id, linked, pricing, hoa.name);
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
              const notification = generateMultiCommunityNotification(selectedHOA.id, linked, pricing, selectedHOA.name);
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
      <div className='space-y-4 sm:space-y-6'>
        <div className='text-center mb-4 sm:mb-6 md:mb-8'>
          <h3 className='text-xl sm:text-2xl font-bold text-green-900 mb-2'>
            Select HOA Property
          </h3>
          <p className='text-sm sm:text-base text-gray-600 px-2'>
            Choose the HOA community for your resale certificate application
          </p>
        </div>

        <div className='bg-white p-4 sm:p-6 rounded-lg border border-green-200'>
          <label className='block text-sm font-medium text-gray-700 mb-2 sm:mb-3'>
            HOA Community *
          </label>
          <div className='relative' ref={inputRef}>
            <Search className='absolute left-3 top-3.5 sm:top-3 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none' />
            <input
              type='text'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(e.target.value.length > 0);
                handleInputChange('hoaProperty', '');
              }}
              placeholder='Select an HOA Community'
              className='w-full pl-9 sm:pl-10 pr-4 py-3 sm:py-3 text-base sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
              autoComplete='off'
            />
            {showDropdown && filteredHOAs.length > 0 && (
              <ul className='absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg'>
                {filteredHOAs.map((hoa) => (
                  <li
                    key={hoa.id}
                    className='px-4 py-3 sm:py-2 cursor-pointer hover:bg-green-100 active:bg-green-200 text-sm sm:text-base touch-manipulation'
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
              <div className='absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 px-4 py-3 sm:py-2 text-gray-500 text-sm sm:text-base'>
                No HOA found
              </div>
            )}
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6'>
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
              className='w-full px-4 py-3 text-base sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
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
              className='w-full px-4 py-3 text-base sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'
              placeholder='4B'
            />
          </div>
        </div>

        {/* Multi-Community Notification (no pricing on this step) */}
        {(multiCommunityNotification || (() => {
          // First try exact match, then try cleaned name match
          const selectedHOA = (hoaProperties || []).find(hoa => {
            // Exact match first (most reliable)
            if (hoa.name === formData.hoaProperty) return true;
            // Fallback to cleaned name match
            const hoaName = cleanPropertyName(hoa.name);
            const formPropName = cleanPropertyName(formData.hoaProperty);
            return hoaName === formPropName && hoaName !== '' && formPropName !== '';
          });
          // Only show disclosure if property found AND has a non-empty comment
          if (!selectedHOA) return false;
          const comment = selectedHOA.multi_community_comment?.trim();
          return comment && comment.length > 0;
        })()) && (
          <div className="bg-white border-l-4 border-blue-600 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500 mb-6">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                  <Info className="w-5 h-5 text-blue-600" />
                </div>
                
                <div className="flex-1 text-left">
                  <h4 className="text-base font-bold text-gray-900">
                    {multiCommunityNotification ? 'Important: Multi-Community Association' : 'Important Property Information'}
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {multiCommunityNotification 
                      ? 'Your resale package will automatically include documents from the following related associations:' 
                      : 'Please review the following information regarding this property:'
                    }
                  </p>
                  
                  {multiCommunityNotification && multiCommunityNotification.details && multiCommunityNotification.details.associations && (
                    <div className="mt-4 space-y-3">
                      {multiCommunityNotification.details.associations.map((association, index) => {
                        const linkedProp = linkedProperties.find(lp => {
                          // Match by exact name or cleaned name
                          const lpName = cleanPropertyName(lp.property_name);
                          const assocName = cleanPropertyName(association.name);
                          return lp.property_name === association.name || lpName === assocName;
                        });
                        
                        // For primary property, find the selected HOA by matching formData.hoaProperty
                        // Try both exact match and cleaned name match
                        const selectedHOA = (hoaProperties || []).find(hoa => {
                          const hoaName = cleanPropertyName(hoa.name);
                          const formPropName = cleanPropertyName(formData.hoaProperty);
                          return hoa.name === formData.hoaProperty || hoaName === formPropName;
                        });
                        
                        const primaryComment = association.isPrimary && selectedHOA?.multi_community_comment?.trim();
                        const hasComment = linkedProp?.relationship_comment?.trim();
                        const displayComment = association.isPrimary ? primaryComment : hasComment;
                        
                        return (
                          <div key={index} className={`flex flex-col ${index !== multiCommunityNotification.details.associations.length - 1 ? 'border-b border-gray-100 pb-3' : ''}`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${association.isPrimary ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                              <span className="text-sm font-bold text-gray-900">
                                {cleanPropertyName(association.name)}
                                {association.isPrimary && <span className="ml-2 text-[9px] tracking-widest text-green-700 bg-green-100 px-2 py-0.5 rounded-md uppercase font-black border border-green-200">Primary</span>}
                              </span>
                            </div>
                            {displayComment && (
                              <div className="ml-4 mt-1.5 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></div>
                                <p className="text-[13px] text-gray-700 font-medium leading-relaxed">
                                  {displayComment}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* For Single Property with Comment */}
                  {!multiCommunityNotification && (
                    <div className="mt-4 space-y-3">
                      {(() => {
                        // First try exact match, then try cleaned name match
                        const selectedHOA = (hoaProperties || []).find(hoa => {
                          // Exact match first (most reliable)
                          if (hoa.name === formData.hoaProperty) return true;
                          // Fallback to cleaned name match
                          const hoaName = cleanPropertyName(hoa.name);
                          const formPropName = cleanPropertyName(formData.hoaProperty);
                          return hoaName === formPropName && hoaName !== '' && formPropName !== '';
                        });
                        
                        // Only display if we found the exact property and it has a non-empty comment
                        if (!selectedHOA) return null;
                        
                        const displayComment = selectedHOA.multi_community_comment?.trim();
                        // Strict check: must be a non-empty string after trimming
                        if (!displayComment || displayComment.length === 0) return null;

                        return (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                              <span className="text-sm font-bold text-gray-900">
                                {cleanPropertyName(selectedHOA.name)}
                              </span>
                            </div>
                            <div className="ml-4 mt-1.5 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                              <div className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></div>
                              <p className="text-[13px] text-gray-700 font-medium leading-relaxed">
                                {displayComment}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Standard HOA Documents Ready notification (Only show if NO comment exists) */}
        {formData.hoaProperty && !multiCommunityNotification && !(() => {
          const selectedHOA = (hoaProperties || []).find(hoa => {
            const hoaName = cleanPropertyName(hoa.name);
            const formPropName = cleanPropertyName(formData.hoaProperty);
            return hoa.name === formData.hoaProperty || hoaName === formPropName;
          });
          return selectedHOA && selectedHOA.multi_community_comment?.trim();
        })() && (
          <div className='bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200'>
            <div className='flex items-start'>
              <CheckCircle className='h-4 w-4 sm:h-5 sm:w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0' />
              <div className='flex-1 min-w-0'>
                <h4 className='text-sm sm:text-base font-medium text-green-900'>
                  HOA Documents Ready
                </h4>
                <p className='text-xs sm:text-sm text-green-700 mt-1'>
                  All required HOA documents for <span className='font-medium'>{formData.hoaProperty}</span> will be
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
    <div className='space-y-4 sm:space-y-6'>
      <div className='text-center mb-4 sm:mb-6 md:mb-8'>
        <h3 className='text-xl sm:text-2xl font-bold text-green-900 mb-2'>
          Who is Submitting?
        </h3>
        <p className='text-sm sm:text-base text-gray-600 px-2'>
          Tell us about yourself and your role in this transaction
        </p>
      </div>

      <div className='bg-white p-4 sm:p-6 rounded-lg border border-green-200'>
        <label className='block text-sm font-medium text-gray-700 mb-3'>
          I am Requesting: *
        </label>
        <div className='grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4'>
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
                className={`p-3 sm:p-4 rounded-lg border-2 transition-all touch-manipulation ${
                  formData.submitterType === type.value
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-200 hover:border-green-300 active:border-green-400'
                }`}
              >
                <Icon className='h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-1.5 sm:mb-2' />
                <div className='text-xs sm:text-sm font-medium leading-tight'>{type.label}</div>
              </button>
            );
            });
          })()}
        </div>
        {formData.submitterType === 'builder' && canShowPublicOffering && (
          <div className='mt-4 sm:mt-6 p-3 sm:p-4 border border-amber-300 rounded-md bg-amber-50'>
            <label className='flex items-start gap-2 sm:gap-3 cursor-pointer'>
              <input
                type='checkbox'
                checked={!!formData.publicOffering}
                onChange={(e) => handleInputChange('publicOffering', e.target.checked)}
                className='mt-1 h-4 w-4 sm:h-5 sm:w-5 text-green-600 border-gray-300 rounded flex-shrink-0'
              />
              <div className='min-w-0'>
                <div className='text-sm sm:text-base font-medium text-amber-900'>Request Public Offering Statement</div>
                <div className='text-xs sm:text-sm text-amber-800 mt-1'>This special request skips other forms and goes straight to payment. Fixed fee: $200.</div>
              </div>
            </label>
          </div>
        )}
        {formData.submitterType === 'builder' && formData.publicOffering && canShowPublicOffering && (
          <div className='mt-2 text-xs sm:text-sm text-green-800 bg-green-50 border border-green-200 rounded p-3'>
            Public Offering Statement selected — transaction details will be skipped. You will proceed directly to payment.
          </div>
        )}
        {formData.submitterType === 'lender_questionnaire' && (
          <div className='mt-4 p-3 sm:p-4 rounded-lg border bg-blue-50 border-blue-200'>
            <div className='flex items-start'>
              <InfoIcon className='h-4 w-4 sm:h-5 sm:w-5 mt-0.5 mr-2 text-blue-600 flex-shrink-0' />
              <div className='flex-1 min-w-0'>
                <h4 className='text-sm sm:text-base font-medium text-blue-900'>
                  Lender Questionnaire Selected
                </h4>
                <p className='text-xs sm:text-sm mt-1 text-blue-700'>
                  You will be able to upload your own questionnaire after payment.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

    <div className='grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6'>
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
          className={`w-full px-4 py-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
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
          className={`w-full px-4 py-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
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
          className='w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
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
          className='w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
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
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
        <input
          type='text'
          placeholder='Buyer Full Name'
          value={formData.buyerName || ''}
          onChange={(e) => handleInputChange('buyerName', e.target.value)}
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
      <div className='mt-4'>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Buyer Email (Optional)
        </label>
        <MultiEmailInput
          value={Array.isArray(formData.buyerEmails) ? formData.buyerEmails : (formData.buyerEmail ? [formData.buyerEmail] : [])}
          onChange={(emails) => {
            // Update both buyerEmails array and buyerEmail (first email for backward compatibility)
            handleInputChange('buyerEmails', emails);
            handleInputChange('buyerEmail', emails.length > 0 ? emails[0] : '');
          }}
          placeholder='Enter buyer email address'
          className='w-full'
          enableAutocomplete={false}
        />
        <p className='mt-2 text-xs text-gray-600 flex items-center gap-1'>
          <InfoIcon className='h-3 w-3' />
          <span>Buyer email(s) will also receive final property documents once the application is complete.</span>
        </p>
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
  testModeCode, // Add test mode code for API calls
  isImpersonating, // When true, payment uses test mode; Stripe.js must use test key
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [multiCommunityPricing, setMultiCommunityPricing] = useState(null);
  const [standardMultiCommunityPricing, setStandardMultiCommunityPricing] = useState(null);
  const [rushMultiCommunityPricing, setRushMultiCommunityPricing] = useState(null);
  const [linkedProperties, setLinkedProperties] = useState([]);

  // Check if this is a pending payment application
  const [isPendingPayment, setIsPendingPayment] = React.useState(false);
  const [isPaymentCompleted, setIsPaymentCompleted] = React.useState(false);
  
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
            .select('status, payment_completed_at, payment_status')
            .eq('id', applicationId)
            .single();
          
          if (!error && data) {
            if (data.status === 'pending_payment') {
              setIsPendingPayment(true);
            }
            
            // Check if payment is already completed
            const paymentCompleted = data.payment_completed_at || 
                                   data.status === 'payment_completed' ||
                                   data.payment_status === 'completed';
            
            if (paymentCompleted) {
              setIsPaymentCompleted(true);
              setIsPendingPayment(false);
            }
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
    // Check if payment is already completed - if so, redirect to next step
    if (isPaymentCompleted && applicationId) {
      // Payment already completed - redirect to next step
      const isLenderQuestionnaire = applicationType === 'lender_questionnaire' || 
                                     formData.submitterType === 'lender_questionnaire';
      
      if (isLenderQuestionnaire) {
        setCurrentStep(5); // Go to upload step
      } else {
        setCurrentStep(5); // Go to review step
      }
      return;
    }
    
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
            buyer_email: Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0 
              ? formData.buyerEmails.join(',') 
              : (formData.buyerEmail || ''),
            buyer_phone: formData.buyerPhone,
            seller_name: formData.sellerName,
            seller_email: formData.sellerEmail,
            seller_phone: formData.sellerPhone,
            sale_price: parseFloat(formData.salePrice),
            closing_date: formData.closingDate || null,
            package_type: formData.packageType,
            payment_method: formData.paymentMethod,
            total_amount: totalAmount,
            status: 'pending_payment', // Will be finalized in Review step
            payment_status: 'not_required', // Free transaction
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
            buyer_email: Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0 
              ? formData.buyerEmails.join(',') 
              : (formData.buyerEmail || ''),
            buyer_phone: formData.buyerPhone,
            seller_name: formData.sellerName,
            seller_email: formData.sellerEmail,
            seller_phone: formData.sellerPhone,
            sale_price: parseFloat(formData.salePrice),
            closing_date: formData.closingDate || null,
            package_type: formData.packageType,
            payment_method: formData.paymentMethod,
            total_amount: totalAmount,
            status: 'pending_payment', // Will be finalized in Review step
            payment_status: 'not_required', // Free transaction
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
            // Note: auto-assign also creates notifications, so we don't need to create them separately
            const assignResponse = await fetch('/api/auto-assign-application', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: createdApplicationId }),
            });
            
            const assignResult = await assignResponse.json();
            if (assignResult.success) {
              // Application auto-assigned successfully (notifications created by auto-assign)
              console.log(`[Submission] Application ${createdApplicationId} auto-assigned and notifications created`);
            } else {
              console.warn(`[Submission] Failed to auto-assign application ${createdApplicationId}:`, assignResult.error);
              
              // If auto-assign failed, try to create notifications manually as fallback
              try {
                const notificationResponse = await fetch('/api/notifications/create', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ applicationId: createdApplicationId }),
                });

                if (notificationResponse.ok) {
                  console.log(`[Submission] Fallback: Notifications created manually after auto-assign failure`);
                } else {
                  console.warn(`[Submission] Fallback: Failed to create notifications manually`);
                }
              } catch (notificationError) {
                console.error('[Submission] Fallback: Error creating notifications manually:', notificationError);
              }
            }
          } catch (assignError) {
            console.error('[Submission] Error calling auto-assign API:', assignError);
            
            // If auto-assign API call failed entirely, try to create notifications manually as fallback
            try {
              const notificationResponse = await fetch('/api/notifications/create', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ applicationId: createdApplicationId }),
              });

              if (notificationResponse.ok) {
                console.log(`[Submission] Fallback: Notifications created manually after auto-assign error`);
              } else {
                console.warn(`[Submission] Fallback: Failed to create notifications manually`);
              }
            } catch (notificationError) {
              console.error('[Submission] Fallback: Error creating notifications manually:', notificationError);
            }
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

        // For free transactions, advance to Review step instead of immediately submitting
        // Application is already created with status 'pending_payment' and payment_status 'not_required'
        // User will review and finalize submission on Review step
        
        // Advance to Review step for free transactions
        setCurrentStep(5);
        setIsProcessing(false);
        
        return; // Exit early for free transactions - user will review and submit on step 5
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
            buyer_email: Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0 
              ? formData.buyerEmails.join(',') 
              : (formData.buyerEmail || ''),
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
            buyer_email: Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0 
              ? formData.buyerEmails.join(',') 
              : (formData.buyerEmail || ''),
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

        // Get Stripe instance: use test key when ?test= is set or when impersonating (backend forces test session)
        const stripe = await getStripeWithFallback(isTestMode || !!isImpersonating);

        // Build API URL with test mode query parameter if enabled
        const apiUrl = isTestMode && testModeCode
          ? `/api/create-checkout-session?test=${encodeURIComponent(testModeCode)}`
          : '/api/create-checkout-session';

        // Create checkout session
        const response = await fetchWithImpersonation(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            packageType: formData.packageType,
            paymentMethod: formData.paymentMethod,
            applicationId: createdApplicationId,
            formData: formData,
            amount: Math.round(totalAmount * 100), // Convert to cents
            // Note: testMode removed - now passed via query parameter for security
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
      const friendlyMessage = getFriendlyPaymentErrorMessage(error);
      if (error.message && (
        error.message.includes('ad blockers') ||
        error.message.includes('browser security settings') ||
        error.message.includes('ERR_BLOCKED_BY_CLIENT')
      )) {
        setShowAdBlockerWarning(true);
        setPaymentError('Payment system blocked. Please check your browser settings.');
      } else {
        setPaymentError(friendlyMessage);
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

      {/* Multi-Community / Property Disclosure */}
      {((multiCommunityPricing && multiCommunityPricing.associations && multiCommunityPricing.associations.length > 0 && applicationType !== 'lender_questionnaire') || (() => {
        // First try exact match, then try cleaned name match
        const selectedHOA = (hoaProperties || []).find(hoa => {
          // Exact match first (most reliable)
          if (hoa.name === formData.hoaProperty) return true;
          // Fallback to cleaned name match
          const hoaName = cleanPropertyName(hoa.name);
          const formPropName = cleanPropertyName(formData.hoaProperty);
          return hoaName === formPropName && hoaName !== '' && formPropName !== '';
        });
        // Only show disclosure if property found AND has a non-empty comment
        if (!selectedHOA) return false;
        const comment = selectedHOA.multi_community_comment?.trim();
        return comment && comment.length > 0;
      })()) && (
        <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-1 bg-blue-600"></div>
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-4">
            <div className="p-2.5 bg-blue-50 rounded-xl flex-shrink-0">
              <Info className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <h4 className="text-lg font-bold text-gray-900 leading-tight">
                {multiCommunityPricing?.associations?.length > 0 ? 'Multi-Community Structure' : 'Important Property Information'}
              </h4>
              <p className="text-sm text-gray-600 mt-1 font-medium">
                {multiCommunityPricing?.associations?.length > 0 
                  ? 'Pricing includes all mandatory documents for this tiered property structure.' 
                  : 'Please review the following information regarding this property:'
                }
              </p>
              
              <div className="mt-5 space-y-4">
                {/* For Multi-Community */}
                {multiCommunityPricing?.associations?.length > 0 && multiCommunityPricing.associations.map((association, index) => {
                  const linkedProp = linkedProperties.find(lp => {
                    const lpName = cleanPropertyName(lp.property_name);
                    const assocName = cleanPropertyName(association.name);
                    return lp.property_name === association.name || lpName === assocName;
                  });
                  
                  const selectedHOA = (hoaProperties || []).find(hoa => {
                    const hoaName = cleanPropertyName(hoa.name);
                    const formPropName = cleanPropertyName(formData.hoaProperty);
                    return hoa.name === formData.hoaProperty || hoaName === formPropName;
                  });
                  
                  const primaryComment = association.isPrimary && selectedHOA?.multi_community_comment?.trim();
                  const hasComment = linkedProp?.relationship_comment?.trim();
                  const displayComment = association.isPrimary ? primaryComment : hasComment;
                  
                  return (
                    <div key={index} className={`flex flex-col ${index !== multiCommunityPricing.associations.length - 1 ? 'border-b border-gray-100 pb-3' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${association.isPrimary ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                        <span className="text-sm font-bold text-gray-900">
                          {cleanPropertyName(association.name)}
                          {association.isPrimary && <span className="ml-2 text-[9px] tracking-widest text-green-700 bg-green-100 px-2 py-0.5 rounded-md uppercase font-black border border-green-200">Primary</span>}
                        </span>
                      </div>
                      {displayComment && (
                        <div className="ml-4 mt-1.5 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                          <div className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></div>
                          <p className="text-[13px] text-gray-700 font-medium leading-relaxed">
                            {displayComment}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* For Single Property with Comment */}
                {(!multiCommunityPricing || !multiCommunityPricing.associations || multiCommunityPricing.associations.length === 0) && (() => {
                  // First try exact match, then try cleaned name match
                  const selectedHOA = (hoaProperties || []).find(hoa => {
                    // Exact match first (most reliable)
                    if (hoa.name === formData.hoaProperty) return true;
                    // Fallback to cleaned name match
                    const hoaName = cleanPropertyName(hoa.name);
                    const formPropName = cleanPropertyName(formData.hoaProperty);
                    return hoaName === formPropName && hoaName !== '' && formPropName !== '';
                  });
                  if (!selectedHOA) return null;
                  const displayComment = selectedHOA.multi_community_comment?.trim();
                  // Strict check: must be a non-empty string after trimming
                  if (!displayComment || displayComment.length === 0) return null;

                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        <span className="text-sm font-bold text-gray-900">
                          {cleanPropertyName(selectedHOA.name)}
                        </span>
                      </div>
                      <div className="ml-4 mt-1.5 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></div>
                        <p className="text-[13px] text-gray-700 font-medium leading-relaxed">
                          {displayComment}
                        </p>
                      </div>
                    </div>
                  );
                })()}
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
                 formData.submitterType === 'lender_questionnaire' ? '10 Calendar Days' : '15 calendar days'}
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
                    {cleanPropertyName(association.name)} {association.isPrimary && '(Primary)'} - ${association.basePrice.toFixed(2)}
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
                    <li>15 calendar days processing</li>
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
              <p className='text-sm text-gray-600'>5 business days</p>
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
                    {cleanPropertyName(association.name)} {association.isPrimary && '(Primary)'} - ${association.basePrice.toFixed(2)} + ${association.rushFee.toFixed(2)} rush
                  </li>
                ))}
                {formData.submitterType === 'settlement' ? (
                  <>
                    <li>Rush Processing</li>
                    <li>Priority queue processing</li>
                    <li>Expedited accounting review</li>
                    <li>5-day completion guarantee</li>
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
                <li>5-day completion guarantee</li>
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
                      {cleanPropertyName(association.name)} {association.isPrimary && '(Primary)'}
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
        
        {isPaymentCompleted ? (
          <button
            onClick={handlePayment}
            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
          >
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </button>
        ) : (
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
        )}
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
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  
  // Validation errors
  const [validationErrors, setValidationErrors] = useState({});
  
  // New: verification waiting state
  const [showVerificationWaiting, setShowVerificationWaiting] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState(null);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('waiting'); // 'waiting', 'verified', 'error'

  // Cleanup function for Realtime subscription
  const channelRef = React.useRef(null);
  const timeoutRef = React.useRef(null);

  // Validation function
  const validateForm = () => {
    const errors = {};
    
    if (authMode === 'signup') {
      // First Name validation
      if (!firstName.trim()) {
        errors.firstName = 'First name is required';
      }
      
      // Last Name validation
      if (!lastName.trim()) {
        errors.lastName = 'Last name is required';
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.trim()) {
        errors.email = 'Email is required';
      } else if (!emailRegex.test(email)) {
        errors.email = 'Please enter a valid email address';
      }
      
      // Password validation
      if (!password) {
        errors.password = 'Password is required';
      } else if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters long';
      }
      
      // Repeat Password validation
      if (!repeatPassword) {
        errors.repeatPassword = 'Please confirm your password';
      } else if (password !== repeatPassword) {
        errors.repeatPassword = 'Passwords do not match';
      }
    } else {
      // Sign in validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.trim()) {
        errors.email = 'Email is required';
      } else if (!emailRegex.test(email)) {
        errors.email = 'Please enter a valid email address';
      }
      
      if (!password) {
        errors.password = 'Password is required';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Clear error when switching modes or closing
  const handleModeSwitch = (newMode) => {
    setAuthError('');
    setResetMessage('');
    setValidationErrors({});
    setPassword('');
    setRepeatPassword('');
    setShowPassword(false);
    setShowRepeatPassword(false);
    setAuthMode(newMode);
  };

  const handleClose = () => {
    // Cleanup Realtime subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setAuthError('');
    setResetMessage('');
    setValidationErrors({});
    setEmail('');
    setPassword('');
    setRepeatPassword('');
    setFirstName('');
    setLastName('');
    setShowPassword(false);
    setShowRepeatPassword(false);
    setShowVerificationWaiting(false);
    setRegisteredUserId(null);
    setRegisteredEmail('');
    setVerificationStatus('waiting');
    setShowAuthModal(false);
  };

  // Setup Realtime subscription for email verification
  React.useEffect(() => {
    if (!showVerificationWaiting || !registeredUserId) return;

    console.log('[AuthModal] Setting up Realtime subscription for user:', registeredUserId);

    // Subscribe to profile changes
    const channel = supabase
      .channel(`profile-verification-${registeredUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${registeredUserId}`,
        },
        async (payload) => {
          console.log('[AuthModal] Profile updated:', payload);
          
          // Check if email was confirmed
          if (payload.new.email_confirmed_at) {
            console.log('[AuthModal] Email verified! Creating session on this device...');
            setVerificationStatus('verified');
            
            // Give user a moment to see the success message
            setTimeout(async () => {
              try {
                // Call create-session endpoint to check verification status
                const response = await fetch('/api/auth/create-session', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ userId: registeredUserId }),
                });

                const data = await response.json();

                if (response.ok && data.success) {
                  console.log('[AuthModal] Email verified! Auto-logging in...', data);
                  
                  // Show success message briefly
                  setVerificationStatus('verified');
                  
                  // Wait a moment to show success, then redirect to auto-login
                  setTimeout(() => {
                    if (data.autoLoginUrl) {
                      console.log('[AuthModal] Redirecting to auto-login endpoint...');
                      window.location.href = data.autoLoginUrl;
                    } else {
                      // Fallback: just reload the page
                      window.location.reload();
                    }
                  }, 1500);
                } else {
                  console.error('[AuthModal] Verification check failed:', data);
                  setVerificationStatus('error');
                }
              } catch (error) {
                console.error('[AuthModal] Error during session creation:', error);
                setVerificationStatus('error');
              }
            }, 2000);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Auto-cleanup after 5 minutes
    timeoutRef.current = setTimeout(() => {
      console.log('[AuthModal] Realtime subscription timeout (5 minutes)');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    }, 5 * 60 * 1000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [showVerificationWaiting, registeredUserId, supabase]);

  // Show verification waiting screen if user just signed up
  if (showVerificationWaiting) {
    return (
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
        <div className='bg-white rounded-lg p-8 max-w-md w-full mx-4'>
          <div className='flex justify-between items-center mb-6'>
            <h2 className='text-2xl font-bold text-green-800'>
              {verificationStatus === 'verified' ? 'Email Verified!' : 'Verify Your Email'}
            </h2>
            <button 
              onClick={handleClose}
              className='text-gray-400 hover:text-gray-600'
            >
              <X className='h-6 w-6' />
            </button>
          </div>

          <div className='text-center space-y-6'>
            {verificationStatus === 'waiting' && (
              <>
                {/* Email icon animation */}
                <div className='flex justify-center'>
                  <div className='relative'>
                    <Mail className='h-20 w-20 text-green-600' />
                    <div className='absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-pulse'>
                      <CheckCircle className='h-4 w-4 text-white' />
                    </div>
                  </div>
                </div>

                <div className='space-y-3'>
                  <h3 className='text-xl font-semibold text-gray-900'>
                    Account created!
                  </h3>
                  <p className='text-gray-600'>
                    We've sent a verification email to:
                  </p>
                  <p className='text-lg font-semibold text-green-700 bg-green-50 py-2 px-4 rounded-lg inline-block'>
                    {registeredEmail}
                  </p>
                  <p className='text-gray-600'>
                    Click the link in the email to activate your account.
                  </p>
                  <p className='text-sm text-gray-500'>
                    You can verify on this device or any other device.
                  </p>
                </div>

                {/* Waiting indicator */}
                <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
                  <div className='flex items-center justify-center gap-2 text-blue-700'>
                    <Loader2 className='h-5 w-5 animate-spin' />
                    <span className='text-sm font-medium'>Waiting for verification...</span>
                  </div>
                  <p className='text-xs text-blue-600 mt-2'>
                    We'll automatically log you in once you verify your email
                  </p>
                </div>

                {/* Actions */}
                <div className='space-y-2 pt-4'>
                  <button
                    onClick={() => {
                      // Redirect to the verification pending page
                      handleClose();
                      window.location.href = '/auth/verification-pending';
                    }}
                    className='w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium'
                  >
                    Check Your Email
                  </button>
                  <button
                    onClick={() => {
                      setShowVerificationWaiting(false);
                      setAuthMode('signin');
                    }}
                    className='w-full py-2 px-4 text-green-600 hover:text-green-800 text-sm font-medium'
                  >
                    Already verified? Sign in
                  </button>
                </div>
              </>
            )}

            {verificationStatus === 'verified' && (
              <>
                {/* Success state */}
                <div className='flex justify-center'>
                  <div className='w-20 h-20 bg-green-100 rounded-full flex items-center justify-center'>
                    <CheckCircle className='h-12 w-12 text-green-600' />
                  </div>
                </div>
                <div className='space-y-3'>
                  <h3 className='text-xl font-semibold text-green-900'>
                    Email verified successfully!
                  </h3>
                  <p className='text-gray-600'>
                    Logging you in...
                  </p>
                  <Loader2 className='h-6 w-6 animate-spin text-green-600 mx-auto' />
                </div>
              </>
            )}

            {verificationStatus === 'error' && (
              <>
                {/* Error state */}
                <div className='flex justify-center'>
                  <div className='w-20 h-20 bg-red-100 rounded-full flex items-center justify-center'>
                    <AlertCircle className='h-12 w-12 text-red-600' />
                  </div>
                </div>
                <div className='space-y-3'>
                  <h3 className='text-xl font-semibold text-red-900'>
                    Something went wrong
                  </h3>
                  <p className='text-gray-600'>
                    Please try signing in manually.
                  </p>
                  <button
                    onClick={() => {
                      setShowVerificationWaiting(false);
                      setAuthMode('signin');
                      setVerificationStatus('waiting');
                    }}
                    className='w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium'
                  >
                    Go to Sign In
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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
            setValidationErrors({});
            
            // Validate form before submission
            if (!validateForm()) {
              return;
            }
            
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
                  setIsAuthenticating(false);
                  
                  console.log('[Registration] Auth result:', { 
                    authMode, 
                    userId: result.userId, 
                    requiresEmailVerification: result.requiresEmailVerification,
                    fullResult: result 
                  });
                  
                  // Check if this was a signup (has userId and requiresEmailVerification)
                  if (authMode === 'signup' && result.userId && result.requiresEmailVerification) {
                    // Close modal
                    handleClose();
                    // Reset form fields
                    setEmail('');
                    setPassword('');
                    setRepeatPassword('');
                    setFirstName('');
                    setLastName('');
                    setAuthError('');
                    
                    console.log('[Registration] Redirecting to verification-pending page...');
                    
                    // Use window.location for reliable navigation (avoids auth provider interference)
                    setTimeout(() => {
                      window.location.href = '/auth/verification-pending';
                    }, 100);
                  } else {
                    // Sign in success - close modal
                    handleClose();
                    // Reset form fields
                    setEmail('');
                    setPassword('');
                    setRepeatPassword('');
                    setFirstName('');
                    setLastName('');
                    setAuthError('');
                  }
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
                  <div>
                    <input
                      type='text'
                      placeholder='First Name'
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (validationErrors.firstName) {
                          setValidationErrors({ ...validationErrors, firstName: '' });
                        }
                      }}
                      disabled={isAuthenticating}
                      className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${
                        validationErrors.firstName
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-green-500'
                      } ${
                        isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      required
                    />
                    {validationErrors.firstName && (
                      <p className='text-red-500 text-xs mt-1'>{validationErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type='text'
                      placeholder='Last Name'
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (validationErrors.lastName) {
                          setValidationErrors({ ...validationErrors, lastName: '' });
                        }
                      }}
                      disabled={isAuthenticating}
                      className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${
                        validationErrors.lastName
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-green-500'
                      } ${
                        isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      required
                    />
                    {validationErrors.lastName && (
                      <p className='text-red-500 text-xs mt-1'>{validationErrors.lastName}</p>
                    )}
                  </div>
                </div>
              )}

              <div className='space-y-4'>
                <div>
                  <input
                    type='email'
                    placeholder='Email Address'
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (validationErrors.email) {
                        setValidationErrors({ ...validationErrors, email: '' });
                      }
                    }}
                    disabled={isAuthenticating}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${
                      validationErrors.email
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-green-500'
                    } ${
                      isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    required
                  />
                  {validationErrors.email && (
                    <p className='text-red-500 text-xs mt-1'>{validationErrors.email}</p>
                  )}
                </div>
                <div>
                  <div className='relative'>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder='Password'
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (validationErrors.password) {
                          setValidationErrors({ ...validationErrors, password: '' });
                        }
                        // Clear repeat password error if passwords now match
                        if (validationErrors.repeatPassword && e.target.value === repeatPassword) {
                          setValidationErrors({ ...validationErrors, repeatPassword: '' });
                        }
                      }}
                      disabled={isAuthenticating}
                      className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 ${
                        validationErrors.password
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-green-500'
                      } ${
                        isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      required
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword(!showPassword)}
                      className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none'
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className='h-5 w-5' />
                      ) : (
                        <Eye className='h-5 w-5' />
                      )}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className='text-red-500 text-xs mt-1'>{validationErrors.password}</p>
                  )}
                </div>
                {authMode === 'signup' && (
                  <div>
                    <div className='relative'>
                      <input
                        type={showRepeatPassword ? 'text' : 'password'}
                        placeholder='Repeat Password'
                        value={repeatPassword}
                        onChange={(e) => {
                          setRepeatPassword(e.target.value);
                          if (validationErrors.repeatPassword) {
                            setValidationErrors({ ...validationErrors, repeatPassword: '' });
                          }
                        }}
                        disabled={isAuthenticating}
                        className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 ${
                          validationErrors.repeatPassword
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:ring-green-500'
                        } ${
                          isAuthenticating ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                        required
                      />
                      <button
                        type='button'
                        onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none'
                        tabIndex={-1}
                      >
                        {showRepeatPassword ? (
                          <EyeOff className='h-5 w-5' />
                        ) : (
                          <Eye className='h-5 w-5' />
                        )}
                      </button>
                    </div>
                    {validationErrors.repeatPassword && (
                      <p className='text-red-500 text-xs mt-1'>{validationErrors.repeatPassword}</p>
                    )}
                  </div>
                )}
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
            // User is still authenticated, redirect to Review & Submit step (step 6)
            setCurrentStep(6);
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

const ReviewSubmitStep = ({ formData, handleInputChange, stripePrices, applicationId, hoaProperties, handleSubmit, isSubmitting, setSnackbarData, setShowSnackbar }) => {
  // Check if user just returned from payment
  const [showPaymentSuccess, setShowPaymentSuccess] = React.useState(false);
  const [multiCommunityInfo, setMultiCommunityInfo] = React.useState(null);
  const [multiCommunityPricing, setMultiCommunityPricing] = React.useState(null);
  const [applicationType, setApplicationType] = React.useState(null);
  const [isEditingDetails, setIsEditingDetails] = React.useState(false);
  const [editedDetails, setEditedDetails] = React.useState({
    submitter_name: '',
    property_address: '',
    submitter_email: '',
    submitter_phone: '',
    buyer_name: '',
    buyer_email: [],
    seller_email: '',
    sale_price: '',
    closing_date: '',
  });
  const [savingDetails, setSavingDetails] = React.useState(false);
  
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

  // Initialize edit details when entering edit mode
  const handleStartEditDetails = () => {
    // Buyer info is optional - only initialize if it exists
    const buyerEmails = Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0
      ? formData.buyerEmails.filter(e => e && e.trim())
      : (formData.buyerEmail && formData.buyerEmail.trim() ? [formData.buyerEmail] : []);
    
    // Format closing_date from date string to YYYY-MM-DD format for input
    let closingDateFormatted = '';
    if (formData.closingDate) {
      const date = new Date(formData.closingDate);
      if (!isNaN(date.getTime())) {
        closingDateFormatted = date.toISOString().split('T')[0];
      }
    }
    
    setEditedDetails({
      submitter_name: formData.submitterName || '',
      property_address: formData.propertyAddress || '',
      submitter_email: formData.submitterEmail || '',
      submitter_phone: formData.submitterPhone || '',
      buyer_name: formData.buyerName || '',
      buyer_email: buyerEmails.length > 0 ? buyerEmails : [], // Empty array for optional field
      seller_email: formData.sellerEmail || '',
      sale_price: formData.salePrice || '',
      closing_date: closingDateFormatted,
    });
    setIsEditingDetails(true);
  };

  // Handle canceling edit mode
  const handleCancelEditDetails = () => {
    setIsEditingDetails(false);
    setEditedDetails({
      submitter_name: '',
      property_address: '',
      submitter_email: '',
      submitter_phone: '',
      buyer_name: '',
      buyer_email: [],
      seller_email: '',
      sale_price: '',
      closing_date: '',
    });
  };

  // Handle saving application details
  const handleSaveDetails = async () => {
    setSavingDetails(true);
    try {
      // Update formData first
      handleInputChange('submitterName', editedDetails.submitter_name);
      handleInputChange('propertyAddress', editedDetails.property_address);
      handleInputChange('submitterEmail', editedDetails.submitter_email);
      handleInputChange('submitterPhone', editedDetails.submitter_phone);
      handleInputChange('buyerName', editedDetails.buyer_name);
      handleInputChange('sellerEmail', editedDetails.seller_email);
      handleInputChange('salePrice', editedDetails.sale_price);
      handleInputChange('closingDate', editedDetails.closing_date);
      
      // Update buyer emails (optional - can be empty)
      const buyerEmailsFiltered = editedDetails.buyer_email.filter(e => e && e.trim());
      handleInputChange('buyerEmails', buyerEmailsFiltered);
      handleInputChange('buyerEmail', buyerEmailsFiltered.length > 0 ? buyerEmailsFiltered[0] : '');

      // If applicationId exists, also update via API
      if (applicationId) {
        const response = await fetchWithImpersonation('/api/update-application-details', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            applicationId: applicationId,
            submitter_name: editedDetails.submitter_name,
            property_address: editedDetails.property_address,
            submitter_email: editedDetails.submitter_email,
            submitter_phone: editedDetails.submitter_phone,
            buyer_name: editedDetails.buyer_name || null, // Optional
            buyer_email: buyerEmailsFiltered.length > 0 ? buyerEmailsFiltered : null, // Optional - send null if empty
            seller_email: editedDetails.seller_email || null,
            sale_price: editedDetails.sale_price || null,
            closing_date: editedDetails.closing_date || null,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update application details');
        }
      }

      setIsEditingDetails(false);
      
      // Show success message
      if (setSnackbarData && setShowSnackbar) {
        setSnackbarData({
          message: 'Application details updated successfully',
          type: 'success'
        });
        setShowSnackbar(true);
      } else {
        // Fallback to alert if snackbar not available
        alert('Application details updated successfully');
      }
    } catch (error) {
      console.error('Error updating application details:', error);
      if (setSnackbarData && setShowSnackbar) {
        setSnackbarData({
          message: 'Failed to update application details: ' + error.message,
          type: 'error'
        });
        setShowSnackbar(true);
      } else {
        alert('Failed to update application details: ' + error.message);
      }
    } finally {
      setSavingDetails(false);
    }
  };

  // Handle adding a new email to buyer_email array
  const handleAddBuyerEmail = () => {
    setEditedDetails({
      ...editedDetails,
      buyer_email: [...editedDetails.buyer_email, ''],
    });
  };

  // Handle removing an email from buyer_email array
  const handleRemoveBuyerEmail = (index) => {
    // Allow removing all emails (buyer info is optional)
    const newBuyerEmails = editedDetails.buyer_email.filter((_, i) => i !== index);
    setEditedDetails({
      ...editedDetails,
      buyer_email: newBuyerEmails,
    });
  };

  // Handle updating buyer email at specific index
  const handleUpdateBuyerEmail = (index, value) => {
    // Ensure we have at least one element in the array
    let newBuyerEmails = editedDetails.buyer_email.length > 0 
      ? [...editedDetails.buyer_email] 
      : [''];
    
    // Update the value at the index
    newBuyerEmails[index] = value;
    
    setEditedDetails({
      ...editedDetails,
      buyer_email: newBuyerEmails,
    });
  };

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

      {/* Save/Cancel Buttons when editing - Show at top */}
      {isEditingDetails && (
        <div className='flex justify-center gap-2 mb-6'>
          <button
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className='px-4 py-2 bg-green-50 border border-green-300 rounded-lg text-green-700 hover:bg-green-100 font-semibold transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {savingDetails ? (
              <>
                <RefreshCw className='w-4 h-4 animate-spin' />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className='w-4 h-4' />
                Save
              </>
            )}
          </button>
          <button
            onClick={handleCancelEditDetails}
            disabled={savingDetails}
            className='px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <X className='w-4 h-4' />
            Cancel
          </button>
        </div>
      )}

      {/* Submit Button - Show at top when payment has been completed */}
      {applicationId && handleSubmit && (
        <div className='flex justify-center mb-6'>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full md:w-auto px-4 sm:px-8 py-3 bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-medium ${
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
                <span className='hidden sm:inline'>Submitting...</span>
                <span className='sm:hidden'>Submitting...</span>
              </>
            ) : (
              <>
                <CheckCircle className='h-5 w-5' />
                <span>Submit Application</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Important Information - Moved to top, below Submit button */}
      <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6'>
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

    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
      <div className='bg-white p-6 rounded-lg border border-gray-200 relative'>
        <div className='flex items-center justify-between mb-4'>
          <h4 className='font-semibold text-gray-900 flex items-center'>
            <Building2 className='h-5 w-5 mr-2 text-green-600' />
            Property Information
          </h4>
          {!isEditingDetails && (
            <button
              onClick={handleStartEditDetails}
              className='p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors'
              title='Edit details'
            >
              <Edit className='w-4 h-4' />
            </button>
          )}
        </div>
        <div className='space-y-2 text-sm'>
          <div className="flex items-center gap-1">
            <span className='font-medium'>HOA:</span> 
            <span>{formData.hoaProperty}</span>
            {multiCommunityInfo && multiCommunityInfo.linkedProperties && multiCommunityInfo.linkedProperties.length > 0 && (
              <span className="relative group inline-flex items-center">
                <span className="ml-1 px-2 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-md border border-blue-200 cursor-help">
                  Multi-Community
                </span>
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl">
                  <div className="font-semibold mb-2 text-green-400">Included Properties:</div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1 flex-shrink-0"></div>
                      <div>
                        <div className="font-medium">{cleanPropertyName(multiCommunityInfo.primaryProperty.name)}</div>
                        <div className="text-gray-400 text-[10px]">Primary Property</div>
                      </div>
                    </div>
                    {multiCommunityInfo.linkedProperties.map((prop, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 flex-shrink-0"></div>
                        <div className="font-medium">{cleanPropertyName(prop.property_name)}</div>
                      </div>
                    ))}
                  </div>
                  {/* Arrow */}
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                </div>
              </span>
            )}
          </div>
          <div>
            <span className='font-medium'>Address:</span>{' '}
            {isEditingDetails ? (
              <input
                type='text'
                value={editedDetails.property_address}
                onChange={(e) => setEditedDetails({ ...editedDetails, property_address: e.target.value })}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                placeholder='Enter property address'
              />
            ) : (
              <span>{formData.propertyAddress}{formData.unitNumber ? ` ${formData.unitNumber}` : ''}</span>
            )}
          </div>
          <div>
            <span className='font-medium'>Sale Price:</span>{' '}
            {isEditingDetails ? (
              <div className='relative mt-1'>
                <span className='absolute left-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500'>$</span>
                <input
                  type='number'
                  step='0.01'
                  min='0'
                  value={editedDetails.sale_price}
                  onChange={(e) => setEditedDetails({ ...editedDetails, sale_price: e.target.value })}
                  className='w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  placeholder='0.00'
                />
              </div>
            ) : (
              <span>${formData.salePrice
                ? Number(formData.salePrice).toLocaleString()
                : 'N/A'}</span>
            )}
          </div>
          <div>
            <span className='font-medium'>Closing Date:</span>{' '}
            {isEditingDetails ? (
              <input
                type='date'
                value={editedDetails.closing_date}
                onChange={(e) => setEditedDetails({ ...editedDetails, closing_date: e.target.value })}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
              />
            ) : (
              <span>{formData.closingDate || 'Not set'}</span>
            )}
          </div>
        </div>
      </div>

      <div className='bg-white p-6 rounded-lg border border-gray-200 relative'>
        <div className='flex items-center justify-between mb-4'>
          <h4 className='font-semibold text-gray-900 flex items-center'>
            <User className='h-5 w-5 mr-2 text-green-600' />
            Submitter Information
          </h4>
          {!isEditingDetails && (
            <button
              onClick={handleStartEditDetails}
              className='p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors'
              title='Edit details'
            >
              <Edit className='w-4 h-4' />
            </button>
          )}
        </div>
        <div className='space-y-2 text-sm'>
          <div>
            <span className='font-medium'>Role:</span> {formData.submitterType}
          </div>
          <div>
            <span className='font-medium'>Name:</span>{' '}
            {isEditingDetails ? (
              <input
                type='text'
                value={editedDetails.submitter_name}
                onChange={(e) => setEditedDetails({ ...editedDetails, submitter_name: e.target.value })}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                placeholder='Enter submitter name'
              />
            ) : (
              <span>{formData.submitterName}</span>
            )}
          </div>
          <div>
            <span className='font-medium'>Email:</span>{' '}
            {isEditingDetails ? (
              <input
                type='email'
                value={editedDetails.submitter_email}
                onChange={(e) => setEditedDetails({ ...editedDetails, submitter_email: e.target.value })}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                placeholder='Enter submitter email'
              />
            ) : (
              <span>{formData.submitterEmail}</span>
            )}
          </div>
          <div>
            <span className='font-medium'>Phone:</span>{' '}
            {isEditingDetails ? (
              <input
                type='tel'
                value={editedDetails.submitter_phone}
                onChange={(e) => setEditedDetails({ ...editedDetails, submitter_phone: e.target.value })}
                className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                placeholder='Enter phone number'
              />
            ) : (
              <span>{formData.submitterPhone || 'Not provided'}</span>
            )}
          </div>
        </div>
      </div>

      {formData.submitterType !== 'settlement' && (
        <div className='bg-white p-6 rounded-lg border border-gray-200 relative'>
          <div className='flex items-center justify-between mb-4'>
            <h4 className='font-semibold text-gray-900 flex items-center'>
              <Users className='h-5 w-5 mr-2 text-green-600' />
              Transaction Parties
            </h4>
            {!isEditingDetails && (
              <button
                onClick={handleStartEditDetails}
                className='p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors'
                title='Edit details'
              >
                <Edit className='w-4 h-4' />
              </button>
            )}
          </div>
          <div className='space-y-2 text-sm'>
            <div>
              <span className='font-medium'>Buyer:</span>{' '}
              {isEditingDetails ? (
                <input
                  type='text'
                  value={editedDetails.buyer_name}
                  onChange={(e) => setEditedDetails({ ...editedDetails, buyer_name: e.target.value })}
                  className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  placeholder='Enter buyer name'
                />
              ) : (
                <span>{formData.buyerName}</span>
              )}
            </div>
            <div>
              <span className='font-medium'>Buyer Email:</span>{' '}
              {isEditingDetails ? (
                <div className='mt-1 space-y-2'>
                  {(editedDetails.buyer_email.length > 0 ? editedDetails.buyer_email : ['']).map((email, index) => (
                    <div key={index} className='flex items-center gap-2'>
                      <input
                        type='email'
                        value={email}
                        onChange={(e) => handleUpdateBuyerEmail(index, e.target.value)}
                        className='flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                        placeholder='Enter buyer email (optional)'
                      />
                      {editedDetails.buyer_email.length > 1 && (
                        <button
                          type='button'
                          onClick={() => handleRemoveBuyerEmail(index)}
                          className='p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors'
                          title='Remove email'
                        >
                          <X className='w-4 h-4' />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type='button'
                    onClick={handleAddBuyerEmail}
                    className='text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1'
                  >
                    <span>+</span> Add Email
                  </button>
                </div>
              ) : (
                <span>
                  {Array.isArray(formData.buyerEmails) && formData.buyerEmails.length > 0
                    ? formData.buyerEmails.join(', ')
                    : (formData.buyerEmail || 'Not provided')}
                </span>
              )}
            </div>
            <div>
              <span className='font-medium'>Seller:</span> {formData.sellerName}
            </div>
            <div>
              <span className='font-medium'>Seller Email:</span>{' '}
              {isEditingDetails ? (
                <input
                  type='email'
                  value={editedDetails.seller_email}
                  onChange={(e) => setEditedDetails({ ...editedDetails, seller_email: e.target.value })}
                  className='mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  placeholder='Enter seller email (optional)'
                />
              ) : (
                <span>{formData.sellerEmail || 'Not provided'}</span>
              )}
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
            {(() => {
              // Calculate total to determine if it's free
              let total = 0;
              if (multiCommunityPricing && multiCommunityPricing.total !== undefined && multiCommunityPricing.total !== null) {
                const baseTotal = multiCommunityPricing.total;
                const convenienceFeeTotal = (formData.paymentMethod === 'credit_card' && baseTotal > 0) ? 
                  multiCommunityPricing.totalConvenienceFee : 0;
                total = baseTotal + convenienceFeeTotal;
              } else {
                total = calculateTotal(formData, stripePrices, hoaProperties);
              }
              
              // Show N/A for free transactions
              if (total === 0) {
                return 'N/A';
              }
              
              return formData.paymentMethod === 'credit_card'
                ? 'Credit Card'
                : 'Bank Transfer';
            })()}
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
  </div>
  );
};

export default function GMGResaleFlow() {
  // Get static data from context
  const { hoaProperties, stripePrices, isDataLoaded } = useAppContext();
  
  // Detect test mode from URL parameter (defaults to LIVE mode)
  const [isTestMode, setIsTestMode] = useState(false);
  const [testModeCode, setTestModeCode] = useState(null); // Store test code for API calls
  
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
              // Valid test code - enable test mode and store in session
              setIsTestMode(true);
              setTestModeCode(testCode); // Store the actual code for API calls
              setTestModeCookie(true);
              // Store test code in sessionStorage for persistence
              sessionStorage.setItem('test_mode_code', testCode);
              // Test mode enabled via URL parameter
            } else {
              // Invalid test code - use LIVE mode and clear any test mode cookie
              setIsTestMode(false);
              setTestModeCode(null);
              setTestModeCookie(false);
              sessionStorage.removeItem('test_mode_code');
              // Invalid test code, using LIVE mode
            }
          })
          .catch(error => {
            console.error('[Stripe] Error validating test code:', error);
            // On error, default to LIVE mode
            setIsTestMode(false);
            setTestModeCode(null);
            setTestModeCookie(false);
            sessionStorage.removeItem('test_mode_code');
          });
      } else {
        // No test code in URL - check session storage and cookie for persistence
        const storedCode = sessionStorage.getItem('test_mode_code');
        const cookieTestMode = getTestModeFromCookie();
        
        if (storedCode && cookieTestMode) {
          // Both code and cookie present - use test mode
          setIsTestMode(true);
          setTestModeCode(storedCode);
          // Test mode persisted from session
        } else {
          // Clear everything if incomplete
          setIsTestMode(false);
          setTestModeCode(null);
          sessionStorage.removeItem('test_mode_code');
          setTestModeCookie(false);
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
    initialize,
    setProfile,
    profile,
    isLoading: profileLoading 
  } = useApplicantAuthStore();
  
  // Get email verification checker
  const { checkVerification } = useRequireVerifiedEmail();
  
  // Get userRole from profile
  const userRole = profile?.role;
  
  // Get router for navigation
  const router = useRouter();

  const { isImpersonating, impersonatedUser, initialize: initImpersonation } = useImpersonationStore();
  React.useEffect(() => {
    initImpersonation();
  }, [initImpersonation]);
  
  // Create Supabase client for Realtime subscriptions
  const supabase = React.useMemo(() => createClientComponentClient(), []);
  
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(() => {
    // Check if returning from payment to prevent homepage flash
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentSuccess = urlParams.get('payment_success');
      const paymentCancelled = urlParams.get('payment_cancelled');
      const sessionId = urlParams.get('session_id');
      const appId = urlParams.get('app_id');
      
      // If returning from payment (success or cancelled), start in loading state (-1)
      if ((paymentSuccess === 'true' || paymentCancelled === 'true') && appId) {
        return -1;
      }
    }
    return 0;
  });
  const [applicationId, setApplicationId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [isPendingPayment, setIsPendingPayment] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isStartingApplication, setIsStartingApplication] = useState(false);
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
    buyerEmails: [],
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

  // Setup Realtime subscription for profile changes (email verification)
  useEffect(() => {
    if (!user || !profile) return;
    
    // Only subscribe if user is unverified
    if (profile.email_confirmed_at) return;
    
    const channel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // Check if email was verified
          if (payload.new.email_confirmed_at && !payload.old.email_confirmed_at) {
            // Directly update the profile in the store with the new data
            setProfile(payload.new);
            
            // Show success message
            setSnackbarData({
              message: 'Email verified successfully! You can now create applications.',
              type: 'success'
            });
            setShowSnackbar(true);
          }
        }
      )
      .subscribe();
    
    // Cleanup on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile, setProfile, supabase]);

  // Handle URL query parameters for actions like opening auth modal
  useEffect(() => {
    if (router.isReady) {
      const { openLogin, emailConfirmed, emailJustVerified } = router.query;
      
      // Handle email just verified - refresh profile
      if (emailJustVerified === 'true') {
        // Force refresh the profile to get updated email_confirmed_at (wait for it to complete)
        initialize().then(() => {
          // Show success message after profile is loaded
          setSnackbarData({
            message: 'Email verified successfully! You can now create applications.',
            type: 'success'
          });
          setShowSnackbar(true);
        });
        
        // Clean up URL parameter
        const newQuery = { ...router.query };
        delete newQuery.emailJustVerified;
        router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
        return;
      }
      
      if (openLogin === 'true' || emailConfirmed === 'true') {
        setShowAuthModal(true);
        setAuthMode('signin');
        
        if (emailConfirmed === 'true') {
          setSnackbarData({
            message: 'Email confirmed successfully! Please sign in.',
            type: 'success'
          });
          setShowSnackbar(true);
        }
        
        // Clean up URL parameters without refreshing
        const newQuery = { ...router.query };
        delete newQuery.openLogin;
        delete newQuery.emailConfirmed;
        router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
      }
    }
  }, [router.isReady, router.query, initialize]);

  // Load applications for the current user (or impersonated user)
  const loadApplications = React.useCallback(async () => {
    if (isImpersonating && impersonatedUser?.id) {
      try {
        const response = await fetchWithImpersonation('/api/my-applications', { credentials: 'include' });
        if (!response.ok) {
          if (response.status === 401) throw new Error('Unauthorized');
          return;
        }
        const data = await response.json();
        setApplications(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error loading applications (impersonation):', error);
      }
      return;
    }

    // On applicant portal, admin is only here when impersonating. Never show all applications.
    // If impersonation store hasn't hydrated yet, show nothing until it does (then we'll use API above).
    if (userRole === 'admin') {
      setApplications([]);
      return;
    }

    if (!user) {
      console.warn('Cannot load applications: user not available');
      return;
    }

    try {
      // Loading applications for requester (always scoped to this user)
      const query = supabase
        .from('applications')
        .select('*, hoa_properties(name, is_multi_community), application_property_groups(*)')
        .is('deleted_at', null) // Only get non-deleted applications
        .order('created_at', { ascending: false })
        .eq('user_id', user.id);

      const { data, error } = await query;

      if (error) {
        console.error('Error loading applications:', error);
        // If it's an auth/session error, re-throw it so caller can handle it
        if (error.message?.includes('auth') || error.message?.includes('session') || error.message?.includes('JWT') || error.code === 'PGRST301' || error.message?.includes('401')) {
          throw error;
        }
        return;
      }

      // For multi-community applications without property groups, fetch linked properties count
      // Property groups are only created after payment, so we need to show linked properties count before payment
      const applicationsWithCounts = await Promise.all(
        (data || []).map(async (app) => {
          // If it's a multi-community app and has no property groups yet, fetch linked properties count
          if (app.hoa_properties?.is_multi_community && 
              (!app.application_property_groups || app.application_property_groups.length === 0) &&
              app.hoa_property_id) {
            try {
              const { data: linkedProps, error: linkedError } = await supabase
                .rpc('get_linked_properties', { property_id: app.hoa_property_id });
              
              if (!linkedError && linkedProps) {
                // Count = 1 (primary) + linked properties count
                app._linked_properties_count = 1 + (linkedProps.length || 0);
              }
            } catch (err) {
              console.warn(`Failed to fetch linked properties count for app ${app.id}:`, err);
            }
          }
          return app;
        })
      );

      // Applications loaded
      setApplications(applicationsWithCounts);
    } catch (error) {
      console.error('Error in loadApplications:', error);
      // Re-throw auth errors so caller can handle them appropriately
      if (error.message?.includes('auth') || error.message?.includes('session') || error.message?.includes('JWT') || error.code === 'PGRST301' || error.message?.includes('401')) {
        throw error;
      }
    }
  }, [user, userRole, supabase, isImpersonating, impersonatedUser]);

  // Load existing draft application
  const loadDraftApplication = React.useCallback(async (appId) => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, hoa_properties(name, is_multi_community), application_property_groups(*)')
        .eq('id', appId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        alert('Application not found. It may have been deleted or you don’t have access to it.');
        return null;
      }

      // Set application ID first to prevent user profile from overriding data
      setApplicationId(appId);

      // Parse buyer emails from comma-separated string or single email
      const parseBuyerEmails = (buyerEmail) => {
        if (!buyerEmail) return [];
        // Check if it's already a comma-separated string
        if (buyerEmail.includes(',')) {
          return buyerEmail.split(',').map(email => email.trim()).filter(email => email);
        }
        return [buyerEmail.trim()].filter(email => email);
      };

      // Populate form with existing data
      const buyerEmailsArray = parseBuyerEmails(data.buyer_email);
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
        buyerEmail: buyerEmailsArray.length > 0 ? buyerEmailsArray[0] : '',
        buyerEmails: buyerEmailsArray,
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
      const message = error?.message?.includes('coerce') || error?.message?.includes('single')
        ? 'Application not found or you don’t have access to it.'
        : (error?.message || 'Error loading application draft.');
      alert(message);
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
          setCurrentStep(5); // Go to lender questionnaire upload step (step 5)
        } else {
          setCurrentStep(5); // Go to review step (step 5 for non-lender questionnaire)
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
  }, [currentStep, formData.submitterType, formData.publicOffering, applicationType]);

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
    setIsStartingApplication(true);
    
    try {
      // First, refresh profile to ensure we have latest data
      await initialize();
      
      // Get the fresh profile data
      const freshProfile = useApplicantAuthStore.getState().profile;
      
      // Now check if email is verified
      const isVerified = freshProfile?.email_confirmed_at !== null && freshProfile?.email_confirmed_at !== undefined;
      
      if (!isVerified) {
        router.push('/auth/verification-pending');
        return;
      }
    
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
    } finally {
      setIsStartingApplication(false);
    }
  }, [user, profile, initialize, router]);

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
            // Return success with user ID for verification flow
            return { 
              success: true, 
              userId: result.userId,
              requiresEmailVerification: result.requiresEmailVerification 
            };
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
        // Try to find a pending payment or payment_completed application for this user with matching details
        const { data: pendingApps, error: searchError } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', user.id)
          .in('status', ['pending_payment', 'payment_completed'])
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
        // This works for both pending_payment and payment_completed statuses
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
      payment_completed: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Payment Completed',
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

    // Dashboard search & filters (used in admin/view-all branch)
    const [dashboardSearch, setDashboardSearch] = useState('');
    const [dashboardFilterPackage, setDashboardFilterPackage] = useState('all');
    const [dashboardFilterStatus, setDashboardFilterStatus] = useState('all');
    const [dashboardFilterSubmitted, setDashboardFilterSubmitted] = useState('all');

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
                The professional solution for Virginia and North Carolina HOA resale certificates.
                <span className='block mt-2 font-normal text-gray-800'>Fast, compliant, and efficient document processing.</span>
              </p>
              
              <div className='mt-16 flex justify-center gap-6 animate-slideUp delay-200 pb-16'>
                {isAuthenticated ? (
                  <button
                    onClick={startNewApplication}
                    disabled={isStartingApplication}
                    className='group relative inline-flex items-center justify-center px-10 py-5 text-xl font-bold text-white transition-all duration-300 bg-green-600 font-pj rounded-2xl focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-green-600 hover:bg-green-700 shadow-xl hover:shadow-2xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0'
                  >
                    <div className='absolute -inset-3 rounded-2xl bg-green-400 opacity-20 group-hover:opacity-40 blur transition duration-200'></div>
                    {isStartingApplication ? (
                      <>
                        <Loader2 className='w-7 h-7 mr-3 animate-spin' />
                        Loading...
                      </>
                    ) : (
                      <>
                        <FileText className='w-7 h-7 mr-3' />
                        Start New Application
                      </>
                    )}
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
                      // Check if payment was actually completed (verify from database)
                      const paymentCompleted = app.payment_completed_at || 
                                              app.status === 'payment_completed' ||
                                              app.payment_status === 'completed';
                      
                      // Fix for premature "Completed" status when PDF is not generated
                      let displayStatus = app.status;
                      
                      // Override status if payment was completed but status still shows pending_payment
                      if (paymentCompleted && displayStatus === 'pending_payment') {
                        displayStatus = 'payment_completed';
                      }
                      
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
                          if (displayStatus !== 'draft' && displayStatus !== 'pending_payment' && displayStatus !== 'payment_completed' && displayStatus !== 'submitted') {
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
                      } else if (displayStatus === 'payment_completed') {
                        statusClasses = 'bg-green-50 text-green-700 border-green-200';
                      }

                      // Check if application can be deleted (draft or pending_payment, but not if payment is completed)
                      const canDelete = (app.status === 'draft' || app.status === 'pending_payment') && !paymentCompleted;
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
                            displayStatus === 'payment_completed' ? 'bg-green-500' :
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

                                  <div className='flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md'>
                                    <Hash className='h-3.5 w-3.5 text-gray-400' />
                                    <span>App #{app.id}</span>
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
                                      <span>
                                        {propertyGroups.length > 0 
                                          ? `${propertyGroups.length} Properties`
                                          : app._linked_properties_count 
                                            ? `${app._linked_properties_count} Properties`
                                            : '0 Properties'}
                                      </span>
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
                                  {(app.status === 'draft' || app.status === 'pending_payment' || app.status === 'payment_completed') && (
                                    <button
                                      onClick={() => {
                                        loadDraftApplication(app.id).then((applicationData) => {
                                          // Check if payment was completed
                                          const paymentCompleted = applicationData?.payment_completed_at || 
                                                                    applicationData?.status === 'payment_completed' ||
                                                                    applicationData?.payment_status === 'completed';
                                          
                                          // Check if this is a lender questionnaire application
                                          const isLenderQuestionnaire = 
                                            applicationData?.application_type === 'lender_questionnaire' ||
                                            applicationData?.submitter_type === 'lender_questionnaire';
                                          
                                          if (paymentCompleted) {
                                            if (isLenderQuestionnaire) {
                                              // For lender questionnaire: check if file was uploaded
                                              const hasUploadedFile = !!applicationData?.lender_questionnaire_file_path;
                                              if (hasUploadedFile) {
                                                // File uploaded - go to review step (step 6)
                                                setCurrentStep(6);
                                              } else {
                                                // Payment completed but no upload - go to upload step (step 5)
                                                setCurrentStep(5);
                                              }
                                            } else {
                                              // Non-lender questionnaire: go to review step (step 5)
                                              setCurrentStep(5);
                                            }
                                          } else if (app.status === 'pending_payment') {
                                            // Payment pending - go to payment step
                                            setCurrentStep(4);
                                          } else {
                                            // Draft - go to first step
                                            setCurrentStep(1);
                                          }
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
                                          <p className='text-sm font-medium text-gray-900'>{cleanPropertyName(prop.property_name)}</p>
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
                    {formData.submitterType === 'lender_questionnaire' ? '10 Calendar Days' : '15 calendar days turnaround'}
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
                    5 business days guaranteed
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

    // Dashboard table view – search, filters, compact table
    const searchLower = (dashboardSearch || '').trim().toLowerCase();
    const filteredApplications = applications.filter((app) => {
      if (searchLower) {
        const property = (app.hoa_properties?.name || '') + ' ' + (app.property_address || '');
        const submitter = (app.submitter_name || '') + ' ' + (app.submitter_type || '') + ' ' + (app.application_type || '');
        const id = (app.id || '');
        const combined = (property + ' ' + submitter + ' ' + id).toLowerCase();
        if (!combined.includes(searchLower)) return false;
      }
      if (dashboardFilterPackage !== 'all' && (app.package_type || '') !== dashboardFilterPackage) return false;
      if (dashboardFilterStatus !== 'all' && app.status !== dashboardFilterStatus) return false;
      if (dashboardFilterSubmitted !== 'all') {
        if (!app.submitted_at) return false;
        const submitted = new Date(app.submitted_at).getTime();
        const now = Date.now();
        if (dashboardFilterSubmitted === '7d' && now - submitted > 7 * 24 * 60 * 60 * 1000) return false;
        if (dashboardFilterSubmitted === '30d' && now - submitted > 30 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });

    const handleResume = (app) => {
      loadDraftApplication(app.id).then((applicationData) => {
        const paymentCompleted = applicationData?.payment_completed_at ||
          applicationData?.status === 'payment_completed' ||
          applicationData?.payment_status === 'completed';
        if (paymentCompleted) setCurrentStep(5);
        else if (app.status === 'pending_payment') setCurrentStep(4);
        else setCurrentStep(1);
      });
    };

    return (
      <div className='space-y-4 sm:space-y-6'>
        {/* Header – stack on mobile, row on sm+ */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <h1 className='text-xl font-bold text-gray-900 sm:text-2xl'>
            Resale Applications Dashboard
          </h1>
          <button
            type="button"
            disabled
            className='w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-300 text-gray-500 px-5 py-3 rounded-xl font-medium cursor-not-allowed transition-colors shadow-sm min-h-[44px]'
          >
            <FileText className='h-5 w-5 flex-shrink-0' />
            New Application
            <span className='ml-1.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200'>
              Coming Soon
            </span>
          </button>
        </div>

        {/* Applications – search, filters, card on mobile, table on md+ */}
        <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
          <div className='px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 bg-gray-50/80'>
            <div className='flex flex-col gap-3 sm:gap-4'>
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3'>
                <div className='relative flex-1 min-w-0'>
                  <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none' />
                  <input
                    type='search'
                    placeholder='Search by property, name, type, or ID…'
                    value={dashboardSearch}
                    onChange={(e) => setDashboardSearch(e.target.value)}
                    className='w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white'
                  />
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <select
                    value={dashboardFilterPackage}
                    onChange={(e) => setDashboardFilterPackage(e.target.value)}
                    className='text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white min-w-0'
                  >
                    <option value='all'>All packages</option>
                    <option value='standard'>Standard</option>
                    <option value='rush'>Rush</option>
                  </select>
                  <select
                    value={dashboardFilterStatus}
                    onChange={(e) => setDashboardFilterStatus(e.target.value)}
                    className='text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white min-w-0'
                  >
                    <option value='all'>All statuses</option>
                    <option value='draft'>Draft</option>
                    <option value='pending_payment'>Pending Payment</option>
                    <option value='payment_completed'>Payment Completed</option>
                    <option value='submitted'>Submitted</option>
                    <option value='under_review'>Under Review</option>
                    <option value='approved'>Completed</option>
                    <option value='completed'>Completed</option>
                    <option value='rejected'>Rejected</option>
                  </select>
                  <select
                    value={dashboardFilterSubmitted}
                    onChange={(e) => setDashboardFilterSubmitted(e.target.value)}
                    className='text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white min-w-0'
                  >
                    <option value='all'>Any time</option>
                    <option value='7d'>Last 7 days</option>
                    <option value='30d'>Last 30 days</option>
                  </select>
                </div>
              </div>
              <h2 className='text-base font-semibold text-gray-900 sm:text-lg'>
                All Applications {filteredApplications.length !== applications.length && (
                  <span className='text-gray-500 font-normal'>({filteredApplications.length} of {applications.length})</span>
                )}
              </h2>
            </div>
          </div>

          {filteredApplications.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 px-4 text-center'>
              <div className='w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-4'>
                <FileText className='h-7 w-7 text-gray-400' />
              </div>
              <p className='text-gray-600 font-medium'>
                {applications.length === 0 ? 'No applications yet' : 'No applications match your filters'}
              </p>
              <p className='text-sm text-gray-500 mt-1 max-w-sm'>
                {applications.length === 0 ? 'Create your first resale application to see it here.' : 'Try adjusting search or filters.'}
              </p>
              {applications.length === 0 && (
                <button
                  type="button"
                  disabled
                  className='mt-4 inline-flex items-center gap-2 bg-gray-300 text-gray-500 px-4 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed transition-colors'
                >
                  <FileText className='h-4 w-4' /> New Application
                  <span className='ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200'>
                    Coming Soon
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className='block md:hidden divide-y divide-gray-100'>
                {filteredApplications.map((app) => {
                  const StatusIcon = statusConfig[app.status]?.icon || Clock;
                  const statusStyle = statusConfig[app.status]?.color || 'bg-gray-100 text-gray-800';
                  const statusLabel = statusConfig[app.status]?.label || app.status;
                  const canResume = app.status === 'draft' || app.status === 'pending_payment' || app.status === 'payment_completed';
                  return (
                    <div key={app.id} className='p-4'>
                      <div className='flex flex-col gap-2'>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <span className='text-xs font-mono text-gray-500' title={app.id}>{String(app.id).slice(0, 8)}</span>
                          <span className='text-xs text-gray-400'>·</span>
                          <p className='text-sm font-medium text-gray-900 truncate flex-1 min-w-0'>
                            {app.hoa_properties?.name} — {app.property_address}
                          </p>
                        </div>
                        <p className='text-xs text-gray-500 capitalize'>{(app.application_type || app.submitter_type || '—').replace(/_/g, ' ')}</p>
                        <div className='flex flex-wrap items-center gap-2 mt-1'>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${app.package_type === 'rush' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                            {app.package_type === 'rush' ? 'Rush (5 days)' : 'Standard'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                            <StatusIcon className='h-3 w-3' /> {statusLabel}
                          </span>
                        </div>
                        <div className='flex items-center justify-between mt-2 pt-2 border-t border-gray-100'>
                          <div>
                            <span className='text-xs text-gray-500'>{app.submitted_at ? formatDateTime(app.submitted_at) : 'Draft'}</span>
                            <span className='ml-2 text-sm font-semibold text-gray-900'>${Number(app.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                          {canResume && (
                            <div className='flex gap-2'>
                              <button
                                onClick={() => handleResume(app)}
                                className='min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100'
                              >
                                <FileText className='h-4 w-4' /> Resume
                              </button>
                              <button
                                onClick={() => deleteUnpaidApplication(app.id, app.status)}
                                className='min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100'
                              >
                                <Trash2 className='h-4 w-4' /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: compact table – minimal horizontal scroll */}
              <div className='hidden md:block overflow-x-auto'>
                <table className='w-full divide-y divide-gray-200 table-fixed'>
                  <thead className='bg-gray-50/80 sticky top-0'>
                    <tr>
                      <th className='w-20 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>ID</th>
                      <th className='min-w-0 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>Property</th>
                      <th className='w-28 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>Type</th>
                      <th className='w-24 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>Package</th>
                      <th className='w-28 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>Status</th>
                      <th className='w-36 px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider'>Submitted</th>
                      <th className='w-20 px-2 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider'>Total</th>
                      <th className='w-28 px-2 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider'>Actions</th>
                    </tr>
                  </thead>
                  <tbody className='bg-white divide-y divide-gray-100'>
                    {filteredApplications.map((app) => {
                      const StatusIcon = statusConfig[app.status]?.icon || Clock;
                      const statusStyle = statusConfig[app.status]?.color || 'bg-gray-100 text-gray-800';
                      const statusLabel = statusConfig[app.status]?.label || app.status;
                      const canResume = app.status === 'draft' || app.status === 'pending_payment' || app.status === 'payment_completed';
                      const appType = (app.application_type || app.submitter_type || '—').replace(/_/g, ' ');
                      return (
                        <tr key={app.id} className='hover:bg-gray-50/50 transition-colors'>
                          <td className='px-2 py-2 text-xs font-mono text-gray-500 truncate' title={app.id}>{String(app.id).slice(0, 8)}</td>
                          <td className='px-2 py-2 text-sm text-gray-900 min-w-0'>
                            <span className='truncate block'>{app.hoa_properties?.name} — {app.property_address}</span>
                          </td>
                          <td className='px-2 py-2 text-xs text-gray-700 capitalize'>{appType}</td>
                          <td className='px-2 py-2'>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${app.package_type === 'rush' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                              {app.package_type === 'rush' ? 'Rush' : 'Standard'}
                            </span>
                          </td>
                          <td className='px-2 py-2'>
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
                              <StatusIcon className='h-3 w-3 flex-shrink-0' /> <span className='truncate'>{statusLabel}</span>
                            </span>
                          </td>
                          <td className='px-2 py-2 text-xs text-gray-500 whitespace-nowrap'>{app.submitted_at ? formatDateTime(app.submitted_at) : 'Draft'}</td>
                          <td className='px-2 py-2 text-sm font-semibold text-gray-900 text-right tabular-nums'>
                            ${Number(app.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className='px-2 py-2 text-right'>
                            {canResume ? (
                              <div className='flex items-center justify-end gap-2'>
                                <button
                                  onClick={() => handleResume(app)}
                                  className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 min-h-[36px]'
                                >
                                  <FileText className='h-4 w-4' /> Resume
                                </button>
                                <button
                                  onClick={() => deleteUnpaidApplication(app.id, app.status)}
                                  className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 min-h-[36px]'
                                >
                                  <Trash2 className='h-4 w-4' /> Delete
                                </button>
                              </div>
                            ) : (
                              <span className='text-gray-400 text-sm'>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
        { number: 5, title: 'Upload Lender Form', icon: Upload },
        { number: 6, title: 'Review & Submit', icon: CheckCircle },
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
            testModeCode={testModeCode}
            isImpersonating={isImpersonating}
          />
        );
      case 5:
        // For lender questionnaire: Upload step comes before Review
        // Check if this is a lender questionnaire application
        const isLenderQuestionnaire = applicationType === 'lender_questionnaire' || 
                                       formData.submitterType === 'lender_questionnaire';
        
        if (isLenderQuestionnaire) {
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
        } else {
          // Review & Submit Step (for non-lender questionnaire)
          return (
            <ReviewSubmitStep
              formData={formData}
              handleInputChange={handleInputChange}
              stripePrices={stripePrices}
              applicationId={applicationId}
              hoaProperties={hoaProperties}
              handleSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              setSnackbarData={setSnackbarData}
              setShowSnackbar={setShowSnackbar}
            />
          );
        }
      case 6:
        // Review & Submit Step (always the last step)
        // For lender questionnaire, this comes after upload
        // For other types, this is step 5 (handled above)
        return (
          <ReviewSubmitStep
            formData={formData}
            handleInputChange={handleInputChange}
            stripePrices={stripePrices}
            applicationId={applicationId}
            hoaProperties={hoaProperties}
            handleSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            setSnackbarData={setSnackbarData}
            setShowSnackbar={setShowSnackbar}
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

  // Payment processing state - prevents homepage flash after payment
  if (currentStep === -1) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col'>
        <ImpersonationBanner />
        <div className='flex-1 flex items-center justify-center'>
        <div className='text-center'>
          <div className='w-16 h-16 bg-green-700 rounded-lg flex items-center justify-center mx-auto mb-4 animate-pulse'>
            <Loader2 className='h-8 w-8 text-white animate-spin' />
          </div>
          <h2 className='text-xl font-semibold text-gray-900'>
            Processing...
          </h2>
          <p className='text-sm text-gray-600 mt-2'>
            Loading your application...
          </p>
        </div>
        </div>
      </div>
    );
  }

  // Main application render - Dashboard view
  if (currentStep === 0) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col'>
        <ImpersonationBanner />
        {/* Header */}
        <div className='bg-white shadow-sm border-b flex-shrink-0'>
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
                    {!isImpersonating && (
                      <span className='text-sm text-gray-600'>
                        Welcome, {profile?.first_name || user?.email}!
                      </span>
                    )}
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

        <main className='flex-1 flex flex-col'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full'>
            <Dashboard />
          </div>
        </main>

        {/* Footer – sticks to bottom of viewport when content is short */}
        <footer className='bg-green-900 text-white py-8 mt-auto flex-shrink-0'>
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
        </footer>

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
    <div className='min-h-screen bg-gray-50 pb-20 md:pb-8'>
      <ImpersonationBanner />
      {/* Header */}
      <div className='bg-white shadow-sm border-b sticky top-0 z-50'>
        <div className='max-w-7xl mx-auto px-3 sm:px-4 lg:px-8'>
          <div className='flex justify-between items-center py-3 md:py-4'>
            <div className='flex items-center space-x-2 sm:space-x-3 md:space-x-4 min-w-0 flex-1'>
              <div className='flex items-center space-x-2 sm:space-x-3 min-w-0'>
                <Image 
                  src={companyLogo} 
                  alt='GMG Logo' 
                  width={40} 
                  height={40} 
                  className='object-contain flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12' 
                />
                <div className='min-w-0'>
                  <p className='text-sm sm:text-base md:text-lg font-semibold text-gray-700 leading-tight'>
                    <span className='hidden sm:inline'>Resale Certificate System</span>
                    <span className='sm:hidden'>Resale System</span>
                  </p>
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-2 sm:space-x-4 flex-shrink-0'>
              <button
                onClick={() => setCurrentStep(0)}
                className='text-gray-600 hover:text-green-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors'
              >
                {userRole === 'admin' ? 'Dashboard' : 'Home'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className='max-w-5xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 md:py-8'>
        {/* Progress Steps */}
        <div className='mb-4 sm:mb-6 md:mb-8'>
          {/* Mobile: Compact progress with current step title */}
          <div className='block md:hidden'>
            {/* Current Step Title */}
            <div className='mb-4 text-center'>
              <div className='inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full'>
                <span className='text-xs font-semibold text-green-700'>
                  Step {currentStep} of {steps.length}
                </span>
              </div>
              <h2 className='mt-2 text-lg font-bold text-green-900'>
                {steps.find(s => s.number === currentStep)?.title || 'Progress'}
              </h2>
            </div>
            
            {/* Compact Progress Dots */}
            <div className='flex items-center justify-center gap-2'>
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = currentStep === step.number;
                const isCompleted = currentStep > step.number;
                const isUpcoming = currentStep < step.number;

                return (
                  <React.Fragment key={step.number}>
                    <div className='flex flex-col items-center'>
                      <div
                        className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 transition-all ${
                          isActive
                            ? 'border-green-600 bg-green-600 text-white scale-110 shadow-lg'
                            : isCompleted
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-300 bg-white text-gray-400'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle className='h-4 w-4 sm:h-5 sm:w-5' />
                        ) : (
                          <StepIcon className='h-4 w-4 sm:h-5 sm:w-5' />
                        )}
                      </div>
                      {isActive && (
                        <span className='mt-1 text-[10px] sm:text-xs font-medium text-green-600 text-center max-w-[60px] sm:max-w-[80px] leading-tight'>
                          {step.title.split(' ')[0]}
                        </span>
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 max-w-[20px] sm:max-w-[30px] transition-colors ${
                          isCompleted
                            ? 'bg-green-600'
                            : 'bg-gray-300'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          
          {/* Desktop: Full progress bar */}
          <div className='hidden md:block'>
            {/* For 6+ steps (lender questionnaire), use compact single-row layout */}
            {steps.length >= 6 ? (
              <div className='flex items-center justify-center gap-2'>
                {steps.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.number;
                  const isCompleted = currentStep > step.number;

                  return (
                    <React.Fragment key={step.number}>
                      <div className='flex flex-col items-center'>
                        <div
                          className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                            isActive
                              ? 'border-green-600 bg-green-600 text-white scale-110 shadow-md'
                              : isCompleted
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'border-gray-300 bg-white text-gray-400'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle className='h-5 w-5' />
                          ) : (
                            <StepIcon className='h-5 w-5' />
                          )}
                        </div>
                        <span
                          className={`mt-2 text-xs font-medium text-center max-w-[100px] leading-tight ${
                            isActive
                              ? 'text-green-600 font-semibold'
                              : isCompleted
                              ? 'text-green-600'
                              : 'text-gray-500'
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          className={`w-8 h-0.5 transition-colors ${
                            isCompleted
                              ? 'bg-green-600'
                              : 'bg-gray-300'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              /* For 5 or fewer steps, use traditional horizontal layout */
              <div className='flex items-center justify-between'>
                {steps.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.number;
                  const isCompleted = currentStep > step.number;

                  return (
                    <div key={step.number} className='flex items-center flex-1'>
                      <div className='flex items-center'>
                        <div
                          className={`flex items-center justify-center w-12 h-12 rounded-full border-2 flex-shrink-0 ${
                            isActive
                              ? 'border-green-600 bg-green-600 text-white'
                              : isCompleted
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'border-gray-300 bg-white text-gray-500'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle className='h-6 w-6' />
                          ) : (
                            <StepIcon className='h-6 w-6' />
                          )}
                        </div>
                        <span
                          className={`ml-3 text-sm font-medium whitespace-nowrap ${
                            isActive
                              ? 'text-green-600'
                              : isCompleted
                              ? 'text-green-600'
                              : 'text-gray-500'
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          className={`flex-1 h-px mx-4 min-w-[20px] ${
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
            )}
          </div>
        </div>

        {/* Form Content */}
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8 mb-4 sm:mb-6 md:mb-8'>
          {renderStepContent()}
        </div>

        {/* Navigation Buttons - Mobile: Sticky bottom, Desktop: Normal */}
        <div className='fixed bottom-0 left-0 right-0 md:relative md:bottom-auto md:left-auto md:right-auto bg-white border-t border-gray-200 md:border-0 md:bg-transparent shadow-lg md:shadow-none z-40 md:z-auto'>
          <div className='max-w-5xl mx-auto px-3 sm:px-4 lg:px-8 py-3 md:py-0'>
            <div className='flex justify-between gap-3 md:mb-12'>
              {/* Show Previous button for all steps except step 1, step 5 (Upload for lender questionnaire), and step 6 (Review) */}
              {currentStep !== 1 && currentStep !== 5 && currentStep !== 6 ? (
                <button
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className='flex-1 md:flex-initial px-4 sm:px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-medium'
                >
                  Previous
                </button>
              ) : currentStep === 6 ? (
                // For step 6 (Review), show Previous button to go back to step 5 (Upload for lender questionnaire)
                <button
                  onClick={prevStep}
                  className='flex-1 md:flex-initial px-4 sm:px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-medium'
                >
                  Previous
                </button>
              ) : (
                <div className='md:block hidden'></div>
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
                  className='flex-1 md:flex-initial px-4 sm:px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-medium'
                >
                  Continue
                  <FileText className='h-4 w-4' />
                </button>
              ) : currentStep === 5 && !applicationId ? (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`w-full md:w-auto px-4 sm:px-8 py-3 bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-medium ${
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
                      <span className='hidden sm:inline'>Submitting...</span>
                      <span className='sm:hidden'>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className='h-5 w-5' />
                      <span className='hidden sm:inline'>
                        Submit Application & Pay ${calculateTotal(formData, stripePrices, hoaProperties).toFixed(2)}
                      </span>
                      <span className='sm:hidden'>
                        Pay ${calculateTotal(formData, stripePrices, hoaProperties).toFixed(2)}
                      </span>
                    </>
                  )}
                </button>
              ) : null}
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