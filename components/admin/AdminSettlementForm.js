import React, { useState, useEffect, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  getSettlementSections, 
  initializeFormData, 
  validateFormData as validateFormDataHelper 
} from '../../lib/settlementFormFieldsLoader';

// Utility functions (moved from pricingUtils to avoid module issues)
const getPropertyState = (location) => {
  if (!location) return null;
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) return 'VA';
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) return 'NC';
  return null;
};

const getSettlementDocumentType = (propertyState) => {
  return 'Settlement Form';
};

import {
  Building2,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  FileText,
  Save,
  Send,
  AlertCircle,
  CheckCircle,
  Download,
  X
} from 'lucide-react';

export default function AdminSettlementForm({ applicationId, onClose, isModal = false, showSnackbar, propertyGroupId = null }) {
  const [application, setApplication] = useState(null);
  const [hoaProperty, setHoaProperty] = useState(null);
  const [formData, setFormData] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState({});
  const [propertyState, setPropertyState] = useState(null);
  const [documentType, setDocumentType] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  // Get sections from JSON config
  const sections = useMemo(() => {
    if (!propertyState) return [];
    return getSettlementSections(propertyState);
  }, [propertyState]);

  useEffect(() => {
    let timeoutId = null;
    let isMounted = true;

    // Set a timeout to prevent infinite loading
    timeoutId = setTimeout(() => {
      if (isMounted) {
        console.error('Settlement form loading timed out');
        setLoading(false);
        setErrors({ 
          general: 'Form loading timed out. Please try again. The form may still load partially - please refresh if needed.' 
        });
        if (showSnackbar) {
          showSnackbar('Form loading timed out. Please try again.', 'error');
        }
      }
    }, 15000); // 15 second timeout

    // Load data
    Promise.all([
      loadApplicationData(),
      loadCurrentUser()
    ]).catch(error => {
      if (isMounted) {
        console.error('Error loading settlement form data:', error);
        setErrors({ general: 'Failed to load form data. Please try again.' });
        if (showSnackbar) {
          showSnackbar('Failed to load form data', 'error');
        }
        setLoading(false);
      }
    }).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    // Cleanup timeout on unmount
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    }, [applicationId, propertyGroupId]);

  // Update form data when user loads (but only if form is already initialized)
  useEffect(() => {
    if (user && formData && Object.keys(formData).length > 0) {
      setFormData(prev => {
        // Only update if manager fields are currently empty or different
        const needsUpdate = 
          !prev.managerName || 
          prev.managerName !== user?.name ||
          !prev.managerEmail ||
          prev.managerEmail !== user?.email;
        
        if (needsUpdate) {
          return {
            ...prev,
            managerName: user?.name || prev.managerName || '',
            managerTitle: user?.title || prev.managerTitle || 'Community Manager',
            managerCompany: user?.company || prev.managerCompany || 'GMG Community Management',
            managerPhone: user?.phone || prev.managerPhone || '',
            managerEmail: user?.email || prev.managerEmail || '',
          };
        }
        return prev;
      });
    }
  }, [user]);

  const loadCurrentUserForInit = async () => {
    try {
      const supabase = createClientComponentClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.warn('Auth error loading user:', authError);
        return null;
      }

      if (user) {
        const { data: userData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', user.email)
          .single();
        
        if (profileError) {
          console.warn('Profile error:', profileError);
          return null;
        }
        
        return userData;
      }
      return null;
    } catch (error) {
      console.warn('Error loading user for init:', error);
      return null;
    }
  };

  const loadCurrentUser = async () => {
    const supabase = createClientComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();
      setUser(userData);
      
      // Update form data with user info if form is already initialized
      if (formData && Object.keys(formData).length > 0) {
        setFormData(prev => ({
          ...prev,
          managerName: userData?.name || '',
          managerTitle: userData?.title || 'Community Manager',
          managerCompany: userData?.company || 'GMG Community Management',
          managerPhone: userData?.phone || '',
          managerEmail: userData?.email || '',
        }));
      }
    }
  };

  const loadApplicationData = async () => {
    try {
      setLoading(true);
      setErrors({}); // Clear previous errors
      
      const supabase = createClientComponentClient();

      // Optimize: Load application, form data, and property group (if needed) in parallel
      const loadPromises = [
        supabase
          .from('applications')
          .select(`
            *,
            hoa_properties(name, location, property_owner_name, property_owner_email, property_owner_phone, management_contact, phone, email)
          `)
          .eq('id', applicationId)
          .single(),
        (() => {
          let query = supabase
            .from('property_owner_forms')
            .select('id,form_data,status')
            .eq('application_id', applicationId)
            .eq('form_type', 'settlement_form');
          
          // For multi-community, filter by property_group_id
          if (propertyGroupId) {
            query = query.eq('property_group_id', propertyGroupId);
          } else {
            query = query.is('property_group_id', null);
          }
          
          return query.maybeSingle();
        })()
      ];

      // If propertyGroupId is provided, also load the property group and its property data
      if (propertyGroupId) {
        loadPromises.push(
          supabase
            .from('application_property_groups')
            .select(`
              *,
              hoa_properties(id, name, location, property_owner_name, property_owner_email, property_owner_phone, management_contact, phone, email)
            `)
            .eq('id', propertyGroupId)
            .eq('application_id', applicationId)
            .single()
        );
      }

      const responses = await Promise.allSettled(loadPromises);
      const [appResponse, formResponse, groupResponse] = responses;

      // Handle application data
      if (appResponse.status === 'rejected') {
        throw new Error('Failed to load application data');
      }
      
      const { data: appData, error: appError } = appResponse.value;
      if (appError) {
        console.error('Application data error:', appError);
        throw appError;
      }

      if (!appData) {
        throw new Error('Application not found');
      }

      // Get property data - prioritize property group's property for multi-community
      let propertyData = null;
      let propertyGroupData = null;
      
      // If propertyGroupId is provided, use the property group's property data
      if (propertyGroupId && groupResponse?.status === 'fulfilled') {
        const { data: groupData, error: groupError } = groupResponse.value;
        if (!groupError && groupData) {
          propertyGroupData = groupData;
          // Use the property group's property data
          propertyData = groupData.hoa_properties || null;
          
          // Override application's hoa_properties with the property group's property
          if (propertyData) {
            appData.hoa_properties = propertyData;
            // For multi-community: property address should remain the same for all properties
            // DO NOT override property_address - it should be the same across all property groups
            // Only update property location if available
            if (groupData.property_location) {
              propertyData.location = groupData.property_location;
            }
            // Override HOA name (association name) with the property group's property name
            if (groupData.property_name) {
              appData.hoa_properties.name = groupData.property_name;
            }
          } else if (groupData.property_name) {
            // If no hoa_properties in group, create a minimal property object from group data
            propertyData = {
              name: groupData.property_name,
              location: groupData.property_location || appData.hoa_properties?.location,
              ...(appData.hoa_properties || {})
            };
            appData.hoa_properties = propertyData;
            // For multi-community: property address should remain the same for all properties
            // DO NOT override property_address
          }
        }
      }
      
      // Fallback to application's hoa_properties if property group data not available
      if (!propertyData) {
        propertyData = appData.hoa_properties || null;
      }
      
      setApplication(appData);
      
      // Load HOA property data if not already included in nested object
      // Use a timeout for this query to prevent hanging
      if (!propertyData && appData.hoa_property_id) {
        try {
          const propertyPromise = supabase
            .from('hoa_properties')
            .select('*')
            .eq('id', appData.hoa_property_id)
            .is('deleted_at', null) // Only get non-deleted properties
            .single();
          
          const propertyTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Property query timeout')), 5000)
          );

          const { data: propertyDataResult, error: propertyError } = await Promise.race([
            propertyPromise,
            propertyTimeout
          ]);

          if (propertyError && propertyError.message !== 'Property query timeout') {
            console.warn('Could not load HOA property data:', propertyError);
            // Continue without property data - use defaults
          } else if (propertyDataResult) {
            propertyData = propertyDataResult;
            setHoaProperty(propertyData);
          }
        } catch (propertyError) {
          console.warn('Property data loading failed or timed out:', propertyError);
          // Continue with partial data
        }
      } else if (propertyData) {
        setHoaProperty(propertyData);
      }

      // Determine property state and document type (use default if no property data)
      let state = 'VA'; // Default to VA if no property data
      if (propertyData && propertyData.location) {
        state = getPropertyState(propertyData.location) || 'VA';
      } else if (appData.hoa_properties?.location) {
        state = getPropertyState(appData.hoa_properties.location) || 'VA';
      }
      setPropertyState(state);
      setDocumentType(getSettlementDocumentType(state));

      // Handle existing form data (from parallel query)
      if (formResponse.status === 'fulfilled') {
        const { data: existingForm, error: formFetchError } = formResponse.value;
        
        // Error handling - PGRST116 is expected when no form exists yet
        if (formFetchError && formFetchError.code !== 'PGRST116') {
          console.error('Error checking for existing form:', formFetchError);
          // Don't block form initialization for this error
        }

        if (existingForm && existingForm.form_data) {
          // Check if existing form data has auto-fill fields populated
          // If key auto-fill fields are missing or empty, re-initialize
          const existingData = existingForm.form_data;
          const hasPropertyAddress = existingData.propertyAddress && existingData.propertyAddress.trim() !== '';
          const hasAssociationName = existingData.associationName && existingData.associationName.trim() !== '';
          
          // For NC forms, also check parcelId
          const hasParcelId = state !== 'NC' || (existingData.parcelId !== undefined);
          
          if (hasPropertyAddress && hasAssociationName && hasParcelId) {
            setFormData(existingData);
            return; // Exit early if we have complete existing form data
          }
          // Otherwise continue to re-initialize below
        }
      }

      // Initialize new form - load user data first
      try {
        const currentUser = await Promise.race([
          loadCurrentUserForInit(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User load timeout')), 5000)
          )
        ]).catch(err => {
          console.warn('User data load timed out or failed:', err);
          return null; // Continue without user data
        });

        initializeFormDataLocal(appData, propertyData, currentUser, state);
      } catch (initError) {
        console.error('Error initializing form:', initError);
        // Initialize with minimal data so form can still render
        initializeFormDataLocal(appData, propertyData, null, state);
      }

    } catch (error) {
      console.error('Error loading application data:', error);
      const errorMessage = error.message || 'Failed to load application data';
      setErrors({ general: errorMessage });
      
      // Set minimal state so form can still render
      setPropertyState('VA'); // Default state
      setDocumentType(getSettlementDocumentType('VA'));
    } finally {
      setLoading(false);
    }
  };

  const initializeFormDataLocal = (appData, propertyData, currentUser = null, stateToUse = null) => {
    const userToUse = currentUser || user;
    // Use provided state or fallback to component state
    const effectiveState = stateToUse || propertyState || 'VA';
    
    // Get property address (without unit number concatenation)
    const propertyAddress = (appData.property_address || '').trim();
    
    // Get property manager details from propertyData (preferred) or hoa_properties nested object
    const propertyManager = propertyData || appData.hoa_properties || {};
    
    // Prepare application data for auto-filling based on new JSON structure
    const applicationData = {
      // Property Information
      propertyAddress: propertyAddress,
      // Association Name should be the same as Property Address in settlement form
      associationName: propertyAddress,
      // Only include parcelId for NC forms (don't set to undefined, just omit for VA)
      ...(effectiveState === 'NC' && { parcelId: propertyManager.parcel_id || '' }),
      
      // Seller Information
      sellerName: appData.seller_name || appData.sellerName || '',
      
      // Buyer Information
      buyerName: appData.buyer_name || appData.buyerName || '',
      estimatedClosingDate: appData.closing_date 
        ? (appData.closing_date.includes('T') 
            ? appData.closing_date.split('T')[0] 
            : appData.closing_date)
        : (appData.estimatedClosingDate || ''),
      // Only include currentOwner for NC forms (don't set to undefined, just omit for VA)
      ...(effectiveState === 'NC' && { currentOwner: appData.seller_name || appData.sellerName || '' }),
      
      // Requestor Information (from submitter)
      requestorName: appData.submitter_name || appData.submitterName || '',
      requestorCompany: appData.submitter_company || appData.submitterCompany || '',
      requestorPhone: appData.submitter_phone || appData.submitterPhone || '',
      
      // Closing Information
      salesPrice: appData.sale_price 
        ? (typeof appData.sale_price === 'number' 
            ? `$${appData.sale_price.toLocaleString()}` 
            : appData.sale_price)
        : (appData.salesPrice || ''),
      fileEscrowNumber: appData.file_number || appData.fileNumber || appData.escrow_number || '',
      buyerOccupant: appData.buyer_occupant || '',
      
      // Assessment fields - let the JSON initializer handle defaults
    };

    // Prepare manager information from property data first, then fallback to user data
    const managerFromProperty = propertyManager.management_contact || propertyManager.property_owner_name || '';
    const managerEmailFromProperty = propertyManager.email || propertyManager.property_owner_email || '';
    const managerPhoneFromProperty = propertyManager.phone || propertyManager.property_owner_phone || '';
    
    const userData = {
      // Use property manager details if available, otherwise use logged-in user details
      managerName: managerFromProperty || userToUse?.name || '',
      managerTitle: userToUse?.title || 'Community Manager',
      managerCompany: userToUse?.company || 'Goodman Management Group',
      managerPhone: managerPhoneFromProperty || userToUse?.phone || '',
      managerEmail: managerEmailFromProperty || userToUse?.email || '',
      managerAddress: userToUse?.address || '',
      preparerSignature: userToUse?.name || managerFromProperty || '',
      preparerName: userToUse?.name || managerFromProperty || '',
    };

    // Use the JSON-based initializer with the correct state
    const initialData = initializeFormData(effectiveState, applicationData, userData);

    // Set auto-generated fields
    initialData.datePrepared = new Date().toISOString().split('T')[0];
    initialData.preparerSignature = userToUse?.name || managerFromProperty || '';
    initialData.preparerName = userToUse?.name || managerFromProperty || '';


    setFormData(initialData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Render a single field based on its configuration
  const renderField = (field) => {
    const value = formData[field.key] || '';
    const hasError = errors[field.key];

    const commonProps = {
      value: value,
      onChange: (e) => handleInputChange(field.key, e.target.value),
      className: `w-full px-3 py-2.5 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed ${
        hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200'
      }`,
      disabled: isCompleted,
    };

    switch (field.type) {
      case 'select':
        return (
          <select {...commonProps}>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      
      case 'textarea':
        return <textarea {...commonProps} rows={3} />;
      
      case 'number':
        return <input type="number" {...commonProps} />;
      
      case 'tel':
        return <input type="tel" {...commonProps} />;
      
      case 'email':
        // For managerEmail, use text input to allow multiple comma-separated emails
        if (field.key === 'managerEmail') {
          return (
            <input 
              type="text" 
              {...commonProps}
              placeholder={field.placeholder || 'Enter email addresses separated by commas'}
            />
          );
        }
        return <input type="email" {...commonProps} />;
      
      case 'date':
        return <input type="date" {...commonProps} />;
      
      default:
        return <input type="text" {...commonProps} placeholder={field.placeholder} />;
    }
  };

  const validateForm = () => {
    // Use JSON-based validator
    const newErrors = validateFormDataHelper(propertyState, formData);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveForm = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      
      const supabase = createClientComponentClient();

      // Check if form already exists
      let query = supabase
        .from('property_owner_forms')
        .select('id')
        .eq('application_id', applicationId)
        .eq('form_type', 'settlement_form');
      
      if (propertyGroupId) {
        query = query.eq('property_group_id', propertyGroupId);
      } else {
        query = query.is('property_group_id', null);
      }
      
      const { data: existingForm } = await query.maybeSingle();
      
      const formDataToUpsert = {
        application_id: applicationId,
        form_type: 'settlement_form',
        form_data: formData,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
        recipient_email: application?.submitter_email || 'admin@gmgva.com'
      };
      
      // For multi-community, include property_group_id
      if (propertyGroupId) {
        formDataToUpsert.property_group_id = propertyGroupId;
      }
      
      let result;
      if (existingForm) {
        // Update existing form
        const { data, error } = await supabase
          .from('property_owner_forms')
          .update(formDataToUpsert)
          .eq('id', existingForm.id)
          .select();
        result = { data, error };
      } else {
        // Insert new form
        const { data, error } = await supabase
          .from('property_owner_forms')
          .insert(formDataToUpsert)
          .select();
        result = { data, error };
      }
      
      const { data, error } = result;

      if (error) throw error;

      // Show success notification
      if (showSnackbar) {
        showSnackbar('Form saved successfully!', 'success');
      }
    } catch (error) {
      console.error('Error saving form:', error);
      setErrors({ general: 'Failed to save form' });
      
      // Show error notification
      if (showSnackbar) {
        showSnackbar('Failed to save form', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const completeAndSubmitForm = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setGenerating(true);
      
      const supabase = createClientComponentClient();

      // Update form as completed - check if form already exists first
      // For multi-community, check by property_group_id
      let query = supabase
        .from('property_owner_forms')
        .select('id')
        .eq('application_id', applicationId)
        .eq('form_type', 'settlement_form');
      
      if (propertyGroupId) {
        query = query.eq('property_group_id', propertyGroupId);
      } else {
        query = query.is('property_group_id', null);
      }
      
      const { data: existingForm } = await query.maybeSingle();

      let formError;
      if (existingForm) {
        // Update existing form
        const { error } = await supabase
          .from('property_owner_forms')
          .update({
            form_data: formData,
            response_data: formData,
            status: 'completed',
            completed_at: new Date().toISOString(),
            recipient_email: application?.submitter_email || 'admin@gmgva.com'
          })
          .eq('id', existingForm.id);
        formError = error;
      } else {
        // Insert new form
        const formDataToInsert = {
          application_id: applicationId,
          form_type: 'settlement_form',
          form_data: formData,
          response_data: formData,
          status: 'completed',
          completed_at: new Date().toISOString(),
          recipient_email: application?.submitter_email || 'admin@gmgva.com'
        };
        
        // For multi-community, include property_group_id
        if (propertyGroupId) {
          formDataToInsert.property_group_id = propertyGroupId;
        }
        
        const { error } = await supabase
          .from('property_owner_forms')
          .insert(formDataToInsert);
        formError = error;
      }

      if (formError) throw formError;

      // Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (appError) throw appError;

      // Mark Task 1 as completed with timestamp
      try {
        await fetch('/api/complete-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            applicationId: applicationId,
            taskName: 'settlement_form'
          }),
        });
      } catch (taskError) {
        console.error('Failed to mark task as completed:', taskError);
        // Don't throw - form was saved successfully
      }
      
      // Notify parent listeners to refresh tasks/status
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('application-updated', { detail: { applicationId } }));
        } catch (e) {
          // no-op
        }
      }

      // Show success notification
      if (showSnackbar) {
        showSnackbar('Settlement form completed successfully!', 'success');
      }
      
      // Close the modal after completion
      if (onClose) {
        setTimeout(() => onClose(), 1500);
      }

    } catch (error) {
      console.error('Error completing form:', error);
      setErrors({ general: 'Failed to complete form' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-2">Loading settlement form...</span>
      </div>
    );
  }

  // Allow form to render with partial data - don't block on missing hoaProperty
  if (!application) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Not Found</h3>
        <p className="text-gray-600 mb-4">Could not load application data.</p>
        {errors.general && (
          <p className="text-red-600 mb-4">{errors.general}</p>
        )}
        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => {
              setLoading(true);
              loadApplicationData();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // If modal, render with modal wrapper
  if (isModal) {
    return (
      <div className={`${isModal ? 'p-0 h-full flex flex-col' : 'max-w-4xl mx-auto p-6'} bg-gray-50/50 ${isModal ? '' : 'min-h-screen'}`}>
        {/* Modal Header - Fixed at top */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between z-10 sticky top-0 border-t-4 border-t-emerald-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Admin: Settlement Form</h1>
              <p className="text-xs text-gray-500">Application #{applicationId} • {propertyState === 'VA' ? 'Dues Request - Escrow Instructions' : 'Statement of Unpaid Assessments'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          
          {/* Application Details Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Application Details
              </h2>
            </div>
            <div className="p-5">
              <div className="grid md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                <div>
                  <div className="mb-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Property Address</span>
                    <span className="font-medium text-gray-900">{application?.property_address || 'N/A'}</span>
                  </div>
                  <div className="mb-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">HOA</span>
                    <span className="font-medium text-gray-900">{hoaProperty?.name || application?.hoa_property || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">Submitter</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{application?.submitter_name || 'N/A'}</span>
                      {application?.submitter_email && (
                        <span className="text-xs text-gray-500">({application.submitter_email})</span>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Buyer</span>
                    <span className="font-medium text-gray-900">{application?.buyer_name || 'N/A'}</span>
                  </div>
                  <div className="mb-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Seller</span>
                    <span className="font-medium text-gray-900">{application?.seller_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">Sale Price</span>
                    <span className="font-medium text-gray-900">${application?.sale_price?.toLocaleString() || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error Messages */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800 font-medium">{errors.general}</p>
            </div>
          )}

          {/* Form Fields - Dynamically rendered from JSON */}
          <div className="space-y-6">
            {sections && sections.length > 0 ? (
              sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-emerald-50/50 border-b border-emerald-100">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                      {section.section}
                    </h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {section.fields.map((field) => (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {renderField({
                            ...field,
                            className: `w-full px-3 py-2.5 bg-gray-50 border ${
                              errors[field.key] ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/20'
                            } rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-4 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed`
                          })}
                          {errors[field.key] && (
                            <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {errors[field.key]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-center">
                <p className="text-yellow-800 font-medium">No form fields found. Loading...</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Action Buttons - Fixed at bottom */}
        {!isCompleted && (
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between z-10 sticky bottom-0">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-gray-600 font-medium hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={saving || generating}
            >
              Cancel
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={saveForm}
                disabled={saving || generating}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent"></div>
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Draft
              </button>
              
              <button
                onClick={completeAndSubmitForm}
                disabled={saving || generating}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {generating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Complete Form
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Non-modal rendering (for standalone page)
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white min-h-screen">
      {/* Admin Header */}
      <div className="bg-blue-50 p-6 rounded-lg mb-8 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin: Settlement Form</h1>
              <p className="text-gray-600">Complete for Application #{applicationId}</p>
            </div>
          </div>
        </div>
        
      </div>

      {/* Error/Success Messages */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{errors.general}</p>
        </div>
      )}

      {/* Settlement Document Header */}
      <div className="bg-gray-50 p-6 rounded-lg mb-8 border">
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {propertyState === 'VA' ? 'Dues Request - Escrow Instructions (Virginia)' : 'Statement of Unpaid Assessments (North Carolina)'}
          </h2>
        </div>
      </div>

      {/* Form Fields - Dynamically rendered from JSON */}
      <div className="space-y-6 mb-8">
        {sections && sections.length > 0 ? (
          sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {section.section}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(field)}
                    {errors[field.key] && (
                      <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-yellow-50 p-4 rounded-lg">
            <p className="text-yellow-800">No form fields found. propertyState: {propertyState}, sections: {JSON.stringify(sections)}</p>
          </div>
        )}
      </div>


      {/* Action Buttons */}
      {!isCompleted && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-600 hover:text-gray-800"
              disabled={saving || generating}
            >
              Cancel
            </button>
            
            <div className="flex space-x-4">
              <button
                onClick={saveForm}
                disabled={saving || generating}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Draft
              </button>
              
              <button
                onClick={completeAndSubmitForm}
                disabled={saving || generating}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                {generating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Complete
              </button>
            </div>
          </div>
        )}

    </div>
  );
}