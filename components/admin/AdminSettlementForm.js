import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  getSettlementSections, 
  initializeFormData, 
  validateFormData as validateFormDataHelper 
} from '../../lib/settlementFormFieldsLoader';

// Helper function to format property address with unit number
const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};

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
  X,
  GripVertical
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
  const [customFields, setCustomFields] = useState([]);
  const fieldRefs = useRef({});
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);
  const [fieldEditorData, setFieldEditorData] = useState({ name: '', type: 'text', value: '', width: 'half', payableTo: '' });
  const [fieldEditorErrors, setFieldEditorErrors] = useState({});
  const [fieldEditorSection, setFieldEditorSection] = useState(null); // Track which section is adding the field: 'assessment' or 'fees'
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggedFieldType, setDraggedFieldType] = useState(null); // 'standard' or 'custom'
  const [assessmentFieldOrder, setAssessmentFieldOrder] = useState([]);

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

  // Update associationAddress when HOA property becomes available
  useEffect(() => {
    if (hoaProperty?.name && formData && Object.keys(formData).length > 0) {
      // If associationAddress is empty or set to default address, update it with HOA name
      const currentAddress = formData.associationAddress || '';
      if (!currentAddress || 
          currentAddress.trim() === '' || 
          currentAddress === '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060' ||
          currentAddress === 'Association') {
        setFormData(prev => ({
          ...prev,
          associationAddress: hoaProperty.name,
          associationName: hoaProperty.name
        }));
      }
    }
  }, [hoaProperty?.name]);

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
          const updated = {
            ...prev,
            managerName: user?.name || prev.managerName || '',
            managerTitle: user?.title || prev.managerTitle || 'Community Manager',
            managerCompany: user?.company || prev.managerCompany || 'GMG Community Management',
            managerPhone: user?.phone || prev.managerPhone || '',
            managerEmail: user?.email || prev.managerEmail || '',
          };
          // Recalculate total after update
          updated.totalAmountDue = calculateTotalAmountDue(updated);
          return updated;
        }
        return prev;
      });
    }
  }, [user]);

  // Calculate total when custom fields change
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0 && propertyState && customFields.length > 0) {
      setFormData(prev => {
        const calculated = calculateTotalAmountDue(prev);
        // Only update if different to avoid infinite loops
        if (prev.totalAmountDue !== calculated) {
          return { ...prev, totalAmountDue: calculated };
        }
        return prev;
      });
    }
  }, [customFields]);

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
            hoa_properties(name, location, property_owner_name, property_owner_email, property_owner_phone, management_contact, phone, email, insurance_company_name, insurance_agent_name, insurance_agent_phone, insurance_agent_email)
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
              hoa_properties(id, name, location, property_owner_name, property_owner_email, property_owner_phone, management_contact, phone, email, insurance_company_name, insurance_agent_name, insurance_agent_phone, insurance_agent_email)
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
            // Clean up placeholder values that might have been saved as actual values
            // Get sections to check which fields have placeholders
            const sections = getSettlementSections(state);
            sections.forEach(section => {
              section.fields.forEach(field => {
                if (field.placeholder && existingData[field.key] === field.placeholder) {
                  // If the saved value matches the placeholder, clear it
                  existingData[field.key] = '';
                }
              });
            });
            
            // Initialize custom fields from saved data
            if (existingData.customFields && Array.isArray(existingData.customFields)) {
              // Ensure all fields have order and sort by it
              const fieldsWithOrder = existingData.customFields.map((field, index) => ({
                ...field,
                order: field.order !== undefined ? field.order : index,
                width: field.width || 'half'
              })).sort((a, b) => (a.order || 0) - (b.order || 0));
              setCustomFields(fieldsWithOrder);
              existingData.customFields = fieldsWithOrder;
            } else {
              existingData.customFields = [];
            }
            
            // Initialize field order for standard fields if not present
            const assessmentSection = getSettlementSections(state).find(s => s.section === 'Assessment Information');
            if (assessmentSection) {
              assessmentSection.fields.forEach((field, index) => {
                if (existingData[`${field.key}_order`] === undefined) {
                  existingData[`${field.key}_order`] = index;
                }
                if (existingData[`${field.key}_width`] === undefined) {
                  existingData[`${field.key}_width`] = (field.type === 'textarea' || field.key === 'totalAmountDue' ? 'full' : 'half');
                }
              });
            }
            
            // Auto-fill manager address with company address if not set
            if (!existingData.managerAddress || existingData.managerAddress.trim() === '') {
              existingData.managerAddress = '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060';
            }
            
            // Auto-fill default address values for fee payment instructions if not set
            if (!existingData.gmgAddress || existingData.gmgAddress.trim() === '') {
              existingData.gmgAddress = '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060';
            }
            // Association address should already be set from HOA property name above
            // If still not set, use associationName or HOA name as fallback (NOT the physical address)
            if (!existingData.associationAddress || existingData.associationAddress.trim() === '') {
              existingData.associationAddress = existingData.associationName || 
                                                propertyData?.name || 
                                                appData.hoa_properties?.name || 
                                                'Association';
            }
            // If associationAddress was set to the default address, replace it with HOA name
            if (existingData.associationAddress === '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060') {
              existingData.associationAddress = existingData.associationName || 
                                                propertyData?.name || 
                                                appData.hoa_properties?.name || 
                                                'Association';
            }
            
            // Auto-fill default "Pay To" values for specific fees (only if not already set)
            if (!existingData.ownerCurrentBalance_payableTo) {
              existingData.ownerCurrentBalance_payableTo = 'Payable to Association';
            }
            if (!existingData.transferFee_payableTo) {
              existingData.transferFee_payableTo = 'Payable to Goodman Management Group';
            }
            if (!existingData.resaleCertificateFee_payableTo) {
              existingData.resaleCertificateFee_payableTo = 'Payable to Goodman Management Group';
            }
            if (!existingData.capitalContribution_payableTo) {
              existingData.capitalContribution_payableTo = 'Payable to Association';
            }
            if (!existingData.prepaidAssessments_payableTo) {
              existingData.prepaidAssessments_payableTo = 'Payable to Association';
            }
            
            // Ensure all payableTo values from form_data are preserved
            // Check all fee fields and preserve their payableTo values
            const vaFeeFields = ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee'];
            const ncFeeFields = ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'resaleCertificateFee'];
            const allFeeFields = state === 'VA' ? vaFeeFields : ncFeeFields;
            
            allFeeFields.forEach(feeKey => {
              const payableToKey = `${feeKey}_payableTo`;
              // Preserve existing payableTo value if it exists in the loaded data
              if (existingForm.form_data[payableToKey] && !existingData[payableToKey]) {
                existingData[payableToKey] = existingForm.form_data[payableToKey];
              }
            });
            
            // For multi-community: Update association name from property group if available
            // This ensures each property group uses its own HOA name, not the primary property's name
            if (propertyGroupId && propertyData && propertyData.name) {
              existingData.associationName = propertyData.name;
            } else if (propertyData && propertyData.name) {
              // Also update if we have property data (even without propertyGroupId)
              existingData.associationName = propertyData.name;
            }
            
            // Update Insurance Information fields from property data if they're empty
            // This ensures insurance data is populated even when loading existing form data
            if (propertyData) {
              if (!existingData.insuranceCompanyName && propertyData.insurance_company_name) {
                existingData.insuranceCompanyName = propertyData.insurance_company_name;
              }
              if (!existingData.insuranceAgentName && propertyData.insurance_agent_name) {
                existingData.insuranceAgentName = propertyData.insurance_agent_name;
              }
              if (!existingData.insuranceAgentPhone && propertyData.insurance_agent_phone) {
                existingData.insuranceAgentPhone = propertyData.insurance_agent_phone;
              }
              if (!existingData.insuranceAgentEmail && propertyData.insurance_agent_email) {
                existingData.insuranceAgentEmail = propertyData.insurance_agent_email;
              }
            }
            
            // Auto-fill association address from HOA property name
            // The association address should be the HOA name (e.g., "VA Property"), NOT the physical address
            // Always override associationAddress with HOA name if available
            if (propertyData && propertyData.name) {
              existingData.associationAddress = propertyData.name;
            } else if (appData.hoa_properties && appData.hoa_properties.name) {
              existingData.associationAddress = appData.hoa_properties.name;
            } else if (existingData.associationName) {
              // Fallback to associationName if already set
              existingData.associationAddress = existingData.associationName;
            }
            // If associationAddress is still set to the default address, replace it with HOA name
            if (existingData.associationAddress === '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060') {
              existingData.associationAddress = existingData.associationName || 
                                                propertyData?.name || 
                                                appData.hoa_properties?.name || 
                                                'Association';
            }
            
            // Calculate total amount due for existing data
            existingData.totalAmountDue = calculateTotalAmountDue(existingData, state);
            
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
    
    // Get property address with unit number if available
    const propertyAddress = formatPropertyAddress(
      (appData.property_address || '').trim(),
      appData.unit_number
    );
    
    // Get property manager details from propertyData (preferred) or hoa_properties nested object
    const propertyManager = propertyData || appData.hoa_properties || {};
    
    // Get HOA name for association address
    // The association address should be the HOA name (e.g., "VA Property")
    const hoaName = propertyManager.name || appData.hoa_properties?.name || '';
    
    // Prepare application data for auto-filling based on new JSON structure
    const applicationData = {
      // Property Information
      propertyAddress: propertyAddress,
      // Association Name should be the HOA property name
      associationName: hoaName,
      // Association Address should be the HOA property name (same as associationName), NOT the physical address
      associationAddress: hoaName || 'Association',
      // GMG Address - always default to company address
      gmgAddress: '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060',
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
      
      // Insurance Information (from property data)
      insuranceCompanyName: propertyManager.insurance_company_name || '',
      insuranceAgentName: propertyManager.insurance_agent_name || '',
      insuranceAgentPhone: propertyManager.insurance_agent_phone || '',
      insuranceAgentEmail: propertyManager.insurance_agent_email || '',
    };

    // Helper function to get first email from comma-separated string or array
    const getFirstEmail = (emailValue) => {
      if (!emailValue) return '';
      if (Array.isArray(emailValue)) {
        return emailValue.length > 0 ? emailValue[0].trim() : '';
      }
      if (typeof emailValue === 'string') {
        const emails = emailValue.split(',').map(e => e.trim()).filter(Boolean);
        return emails.length > 0 ? emails[0] : '';
      }
      return '';
    };

    // Prepare manager information from property data first, then fallback to user data
    const managerFromProperty = propertyManager.management_contact || propertyManager.property_owner_name || '';
    // Always use first email if multiple property owner emails exist
    const propertyOwnerEmail = getFirstEmail(propertyManager.property_owner_email);
    const managerEmailFromProperty = propertyManager.email || propertyOwnerEmail || '';
    const managerPhoneFromProperty = propertyManager.phone || propertyManager.property_owner_phone || '';
    
    const userData = {
      // Use property manager details if available, otherwise use logged-in user details
      managerName: managerFromProperty || userToUse?.name || '',
      managerTitle: userToUse?.title || 'Community Manager',
      managerCompany: userToUse?.company || 'Goodman Management Group',
      managerPhone: managerPhoneFromProperty || userToUse?.phone || '',
      managerEmail: managerEmailFromProperty || userToUse?.email || '',
      managerAddress: '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060',
      preparerSignature: userToUse?.name || managerFromProperty || '',
      preparerName: userToUse?.name || managerFromProperty || '',
    };

    // Use the JSON-based initializer with the correct state
    const initialData = initializeFormData(effectiveState, applicationData, userData);

    // Set auto-generated fields
    initialData.datePrepared = new Date().toISOString().split('T')[0];
    initialData.preparerSignature = userToUse?.name || managerFromProperty || '';
    initialData.preparerName = userToUse?.name || managerFromProperty || '';
    
    // Manually populate Insurance Information fields from property data
    // (Insurance section has autoFill: false, so we need to set these manually)
    if (applicationData.insuranceCompanyName) {
      initialData.insuranceCompanyName = applicationData.insuranceCompanyName;
    }
    if (applicationData.insuranceAgentName) {
      initialData.insuranceAgentName = applicationData.insuranceAgentName;
    }
    if (applicationData.insuranceAgentPhone) {
      initialData.insuranceAgentPhone = applicationData.insuranceAgentPhone;
    }
    if (applicationData.insuranceAgentEmail) {
      initialData.insuranceAgentEmail = applicationData.insuranceAgentEmail;
    }
    
    // Auto-fill default "Pay To" values for specific fees (only if not already set)
    if (!initialData.ownerCurrentBalance_payableTo) {
      initialData.ownerCurrentBalance_payableTo = 'Payable to Association';
    }
    if (!initialData.transferFee_payableTo) {
      initialData.transferFee_payableTo = 'Payable to Goodman Management Group';
    }
    if (!initialData.resaleCertificateFee_payableTo) {
      initialData.resaleCertificateFee_payableTo = 'Payable to Goodman Management Group';
    }
    if (!initialData.capitalContribution_payableTo) {
      initialData.capitalContribution_payableTo = 'Payable to Association';
    }
    if (!initialData.prepaidAssessments_payableTo) {
      initialData.prepaidAssessments_payableTo = 'Payable to Association';
    }

    // Initialize custom fields from saved form data if available
    if (initialData.customFields && Array.isArray(initialData.customFields)) {
      // Ensure all fields have order and sort by it
      const fieldsWithOrder = initialData.customFields.map((field, index) => ({
        ...field,
        order: field.order !== undefined ? field.order : index,
        width: field.width || 'half'
      })).sort((a, b) => (a.order || 0) - (b.order || 0));
      setCustomFields(fieldsWithOrder);
      initialData.customFields = fieldsWithOrder;
    } else {
      initialData.customFields = [];
    }
    
    // Initialize field order for standard fields
    const assessmentSection = getSettlementSections(effectiveState).find(s => s.section === 'Assessment Information');
    if (assessmentSection) {
      assessmentSection.fields.forEach((field, index) => {
        initialData[`${field.key}_order`] = index;
        initialData[`${field.key}_width`] = (field.type === 'textarea' || field.key === 'totalAmountDue' ? 'full' : 'half');
      });
    }

    // Calculate initial total amount due
    initialData.totalAmountDue = calculateTotalAmountDue(initialData, effectiveState);

    setFormData(initialData);
  };

  // Utility function to parse currency value from string
  const parseCurrencyValue = (value) => {
    if (!value || typeof value !== 'string') return 0;
    // Remove $, commas, and whitespace, then parse as float
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calculate totals for GMG, Association, and Overall
  const calculateFeeTotals = (data, state = null) => {
    const effectiveState = state || propertyState;
    let totalGMG = 0;
    let totalAssociation = 0;
    
    // Get fee fields based on state
    const vaFeeFields = ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee'];
    const ncFeeFields = ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'resaleCertificateFee'];
    const feeFields = effectiveState === 'VA' ? vaFeeFields : ncFeeFields;
    
    // Calculate totals from standard fee fields
    feeFields.forEach(fieldKey => {
      const value = parseCurrencyValue(data[fieldKey] || '');
      if (value > 0) {
        const payableToKey = `${fieldKey}_payableTo`;
        const payableTo = (data[payableToKey] || '').toLowerCase();
        
        if (payableTo.includes('goodman management') || payableTo.includes('gmg')) {
          totalGMG += value;
        } else if (payableTo.includes('association')) {
          totalAssociation += value;
        }
      }
    });
    
    // Add custom fee field values
    if (data.customFields && Array.isArray(data.customFields)) {
      data.customFields.forEach(customField => {
        if (customField.type === 'fee' && customField.value) {
          const value = parseCurrencyValue(customField.value);
          if (value > 0) {
            const payableTo = (customField.payableTo || '').toLowerCase();
            if (payableTo.includes('goodman management') || payableTo.includes('gmg')) {
              totalGMG += value;
            } else if (payableTo.includes('association')) {
              totalAssociation += value;
            }
          }
        }
      });
    }
    
    const overallTotal = totalGMG + totalAssociation;
    
    return {
      totalGMG: totalGMG > 0 ? `$${totalGMG.toFixed(2)}` : '$0.00',
      totalAssociation: totalAssociation > 0 ? `$${totalAssociation.toFixed(2)}` : '$0.00',
      overallTotal: overallTotal > 0 ? `$${overallTotal.toFixed(2)}` : '$0.00',
      totalGMGNumeric: totalGMG,
      totalAssociationNumeric: totalAssociation,
      overallTotalNumeric: overallTotal
    };
  };

  // Calculate total amount due based on property state
  const calculateTotalAmountDue = (data, state = null) => {
    let total = 0;
    const effectiveState = state || propertyState;
    
    if (effectiveState === 'VA') {
      // VA fields to sum
      const vaFields = [
        'regularAssessmentAmount',
        'ownerCurrentBalance',
        'transferFee',
        'resaleCertificateFee',
        'capitalContribution',
        'prepaidAssessments',
        'adminFee'
      ];
      
      vaFields.forEach(field => {
        total += parseCurrencyValue(data[field] || '');
      });
    } else if (effectiveState === 'NC') {
      // NC fields to sum
      const ncFields = [
        'unpaidRegularAssessments',
        'unpaidSpecialAssessments',
        'lateFees',
        'interestCharges',
        'attorneyFees',
        'otherCharges'
      ];
      
      ncFields.forEach(field => {
        total += parseCurrencyValue(data[field] || '');
      });
    }
    
    // Add custom field values (number and fee type fields)
    if (data.customFields && Array.isArray(data.customFields)) {
      data.customFields.forEach(customField => {
        if (customField.value && (customField.type === 'number' || customField.type === 'fee')) {
          total += parseCurrencyValue(customField.value);
        }
      });
    }
    
    // Format as currency
    return total > 0 ? `$${total.toFixed(2)}` : '$0.00';
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      
      // Auto-calculate total amount due when assessment fields change
      const assessmentFields = propertyState === 'VA' 
        ? ['regularAssessmentAmount', 'ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee']
        : ['unpaidRegularAssessments', 'unpaidSpecialAssessments', 'lateFees', 'interestCharges', 'attorneyFees', 'otherCharges'];
      
      if (assessmentFields.includes(field) || field.startsWith('customField_')) {
        updated.totalAmountDue = calculateTotalAmountDue(updated);
      }
      
      // Recalculate totals when payableTo fields change
      if (field.endsWith('_payableTo')) {
        updated.totalAmountDue = calculateTotalAmountDue(updated);
      }
      
      return updated;
    });

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Handle custom field changes
  const handleCustomFieldChange = (index, field, value) => {
    const updated = [...customFields];
    updated[index] = { ...updated[index], [field]: value };
    setCustomFields(updated);
    
    // Update formData
    setFormData(prev => {
      const updatedData = {
        ...prev,
        customFields: updated
      };
      
      // Recalculate total if value or payableTo changed
      if (field === 'value' || field === 'payableTo') {
        updatedData.totalAmountDue = calculateTotalAmountDue(updatedData);
      }
      
      return updatedData;
    });
  };

  // Check if field name is unique (case-insensitive)
  const isFieldNameUnique = (name, excludeIndex = null) => {
    if (!name || name.trim() === '') return false;
    const nameLower = name.trim().toLowerCase();
    
    // Check against existing custom fields
    for (let i = 0; i < customFields.length; i++) {
      if (i === excludeIndex) continue;
      if (customFields[i].name && customFields[i].name.toLowerCase() === nameLower) {
        return false;
      }
    }
    
    // Check against predefined assessment fields (get field keys from sections)
    const assessmentSection = sections.find(s => s.section === 'Assessment Information');
    if (assessmentSection) {
      const existingFieldKeys = assessmentSection.fields.map(f => f.label.toLowerCase());
      if (existingFieldKeys.includes(nameLower)) {
        return false;
      }
    }
    
    return true;
  };

  // Validate field editor data
  const validateFieldEditor = () => {
    const newErrors = {};
    
    // Field name validation
    if (!fieldEditorData.name || fieldEditorData.name.trim() === '') {
      newErrors.name = 'Field name is required';
    } else if (fieldEditorData.name.length > 100) {
      newErrors.name = 'Field name must be 100 characters or less';
    } else if (!isFieldNameUnique(fieldEditorData.name, editingFieldIndex)) {
      newErrors.name = 'Field name must be unique';
    }
    
    // Field type validation
    if (!fieldEditorData.type) {
      newErrors.type = 'Field type is required';
    }
    
    setFieldEditorErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Open field editor (for new field)
  const openFieldEditor = () => {
    setFieldEditorData({ name: '', type: 'text', value: '', width: 'half', payableTo: '' });
    setFieldEditorErrors({});
    setEditingFieldIndex(null);
    setShowFieldEditor(true);
  };

  // Open field editor (for editing existing field)
  const openFieldEditorForEdit = (index) => {
    const field = customFields[index];
    setFieldEditorData({
      name: field.name || '',
      type: field.type || 'text',
      value: field.value || '',
      width: field.width || 'half',
      payableTo: field.payableTo || ''
    });
    setFieldEditorErrors({});
    setEditingFieldIndex(index);
    // Set section based on field type - fee fields belong to fees section
    setFieldEditorSection(field.type === 'fee' ? 'fees' : 'assessment');
    setShowFieldEditor(true);
  };

  // Close field editor
  const closeFieldEditor = () => {
    setShowFieldEditor(false);
    setFieldEditorData({ name: '', type: 'text', value: '', width: 'half', payableTo: '' });
    setFieldEditorErrors({});
    setEditingFieldIndex(null);
    setFieldEditorSection(null);
  };

  // Save field from editor
  const saveFieldFromEditor = () => {
    if (!validateFieldEditor()) {
      return;
    }

    const fieldData = {
      id: editingFieldIndex !== null ? customFields[editingFieldIndex].id : `custom_${Date.now()}`,
      name: fieldEditorData.name.trim(),
      type: fieldEditorData.type,
      value: fieldEditorData.value || '',
      width: fieldEditorData.width || 'half',
      payableTo: fieldEditorData.payableTo || '', // For fee type fields
      order: editingFieldIndex !== null ? customFields[editingFieldIndex].order : (customFields.length > 0 ? Math.max(...customFields.map(f => f.order || 0)) + 1 : 0)
    };

    let updated;
    if (editingFieldIndex !== null) {
      // Update existing field
      updated = [...customFields];
      updated[editingFieldIndex] = fieldData;
    } else {
      // Add new field
      updated = [...customFields, fieldData];
    }

    // Sort by order
    updated.sort((a, b) => (a.order || 0) - (b.order || 0));

    setCustomFields(updated);
    setFormData(prev => {
      const updatedData = {
        ...prev,
        customFields: updated
      };
      // Recalculate total if it's a number/currency field or fee field
      if ((fieldData.type === 'number' || fieldData.type === 'fee') && fieldData.value) {
        updatedData.totalAmountDue = calculateTotalAmountDue(updatedData);
      }
      return updatedData;
    });

    closeFieldEditor();
    
    if (showSnackbar) {
      showSnackbar(editingFieldIndex !== null ? 'Field updated successfully' : 'Field added successfully', 'success');
    }
  };

  // Add new custom field (opens editor)
  const addCustomField = () => {
    setFieldEditorSection('assessment');
    openFieldEditor();
  };

  // Add new fee field (opens editor with fee type pre-selected)
  const addCustomFeeField = () => {
    setFieldEditorSection('fees');
    setFieldEditorData({ name: '', type: 'fee', value: '', width: 'half', payableTo: '' });
    setShowFieldEditor(true);
  };

  // Remove custom field
  const removeCustomField = (index) => {
    const updated = customFields.filter((_, i) => i !== index);
    // Reorder remaining fields
    updated.forEach((field, i) => {
      field.order = i;
    });
    setCustomFields(updated);
    
    setFormData(prev => {
      const updatedData = {
        ...prev,
        customFields: updated
      };
      
      // Recalculate total
      updatedData.totalAmountDue = calculateTotalAmountDue(updatedData);
      
      return updatedData;
    });
  };

  // Get all Fees section fields (standard + custom fee fields) in order
  const getAllFeesFields = useMemo(() => {
    const feesSection = sections.find(s => s.section === 'Fees');
    if (!feesSection) return [];
    
    // Get standard fee fields (excluding totalAmountDue for now)
    const standardFields = feesSection.fields
      .filter(f => f.key !== 'totalAmountDue')
      .map((field, index) => ({
        ...field,
        isCustom: false,
        order: index
      }));
    
    // Get custom fee fields only
    const customFeeFields = customFields
      .filter(field => field.type === 'fee')
      .map((field, index) => ({
        ...field,
        isCustom: true,
        key: `custom_${field.id}`,
        label: field.name,
        order: field.order !== undefined ? field.order : (standardFields.length + index)
      }));
    
    // Combine standard fields with custom fee fields, but keep totalAmountDue at the end
    const allFields = [...standardFields, ...customFeeFields].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Add totalAmountDue at the end
    const totalField = feesSection.fields.find(f => f.key === 'totalAmountDue');
    if (totalField) {
      allFields.push({ ...totalField, isCustom: false });
    }
    
    return allFields;
  }, [sections, customFields]);

  // Get all Assessment Information fields (standard + custom) in order
  const getAllAssessmentFields = useMemo(() => {
    const assessmentSection = sections.find(s => s.section === 'Assessment Information');
    if (!assessmentSection) return [];
    
    // Get standard fields with their order from formData or default order
    const standardFields = assessmentSection.fields.map((field, index) => ({
      ...field,
      isCustom: false,
      order: formData[`${field.key}_order`] !== undefined ? formData[`${field.key}_order`] : index,
      width: formData[`${field.key}_width`] || (field.type === 'textarea' || field.key === 'totalAmountDue' ? 'full' : 'half')
    }));
    
    // Get custom fields (excluding fee type fields - those belong to Fees section)
    const customFieldsWithOrder = customFields
      .filter(field => field.type !== 'fee')
      .map(field => ({
        ...field,
        isCustom: true,
        width: field.width || 'half'
      }));
    
    // Combine and sort by order
    const allFields = [...standardFields, ...customFieldsWithOrder].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return allFields;
  }, [sections, formData, customFields]);

  // Unified drag and drop handlers for all fields
  const handleDragStart = (e, globalIndex) => {
    setDraggedIndex(globalIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }

    const draggedField = getAllAssessmentFields[draggedIndex];
    const dropField = getAllAssessmentFields[dropIndex];
    
    // Swap orders
    const draggedOrder = draggedField.order || draggedIndex;
    const dropOrder = dropField.order || dropIndex;
    
    // Update dragged field order
    if (draggedField.isCustom) {
      const customIndex = customFields.findIndex(f => f.id === draggedField.id);
      if (customIndex !== -1) {
        const updated = [...customFields];
        updated[customIndex] = { ...updated[customIndex], order: dropOrder };
        setCustomFields(updated);
        setFormData(prev => ({
          ...prev,
          customFields: updated
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [`${draggedField.key}_order`]: dropOrder
      }));
    }
    
    // Update drop field order
    if (dropField.isCustom) {
      const customIndex = customFields.findIndex(f => f.id === dropField.id);
      if (customIndex !== -1) {
        const updated = [...customFields];
        updated[customIndex] = { ...updated[customIndex], order: draggedOrder };
        setCustomFields(updated);
        setFormData(prev => ({
          ...prev,
          customFields: updated
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [`${dropField.key}_order`]: draggedOrder
      }));
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
    
    if (showSnackbar) {
      showSnackbar('Field order updated', 'success');
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Render custom field input based on type
  const renderCustomFieldInput = (customField, customIndex) => {
    const commonProps = {
      value: customField.value || '',
      onChange: (e) => handleCustomFieldChange(customIndex, 'value', e.target.value),
      disabled: isCompleted,
      className: "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
    };

    switch (customField.type) {
      case 'fee':
        // Extract numeric value for input (remove $ and format)
        let numericValue = '';
        if (customField.value) {
          const cleaned = customField.value.toString().replace(/[^0-9.]/g, '');
          if (cleaned) {
            // Check if the value is in an incomplete decimal state (ends with "." or has exactly one digit after decimal)
            const decimalIndex = cleaned.indexOf('.');
            const hasIncompleteDecimal = cleaned.endsWith('.') || 
              (decimalIndex !== -1 && cleaned.substring(decimalIndex + 1).length === 1);
            
            if (hasIncompleteDecimal) {
              // Preserve the raw string to maintain the incomplete decimal (e.g., "20.0" stays "20.0")
              numericValue = cleaned;
            } else {
              // Value is complete, use parseFloat to normalize
              const num = parseFloat(cleaned);
              if (!isNaN(num)) {
                numericValue = num.toString();
              }
            }
          }
        }
        
        return (
          <div className="space-y-2">
            <div className="flex">
              <span className="inline-flex items-center px-3 py-2.5 border border-r-0 border-gray-200 bg-gray-50 text-gray-700 text-sm rounded-l-lg">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={numericValue}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue === '' || inputValue === null || inputValue === undefined) {
                    handleCustomFieldChange(customIndex, 'value', '');
                    return;
                  }
                  const num = parseFloat(inputValue);
                  if (!isNaN(num) && num >= 0) {
                    // Allow user to type freely - don't format while typing
                    // Check if it ends with "." or has exactly one digit after decimal point
                    const decimalIndex = inputValue.indexOf('.');
                    const hasIncompleteDecimal = inputValue.endsWith('.') || 
                      (decimalIndex !== -1 && inputValue.substring(decimalIndex + 1).length === 1);
                    
                    if (hasIncompleteDecimal) {
                      // User is still typing decimals, store raw numeric value
                      handleCustomFieldChange(customIndex, 'value', inputValue);
                    } else {
                      // Value is complete, format with $ and 2 decimal places
                      handleCustomFieldChange(customIndex, 'value', `$${num.toFixed(2)}`);
                    }
                  } else {
                    handleCustomFieldChange(customIndex, 'value', inputValue);
                  }
                }}
                onBlur={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue && inputValue !== '') {
                    const num = parseFloat(inputValue);
                    if (!isNaN(num) && num >= 0) {
                      handleCustomFieldChange(customIndex, 'value', `$${num.toFixed(2)}`);
                    }
                  }
                }}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="0.00"
                disabled={isCompleted}
              />
            </div>
            <select
              value={customField.payableTo || ''}
              onChange={(e) => handleCustomFieldChange(customIndex, 'payableTo', e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isCompleted}
            >
              <option value="">Select Pay To...</option>
              <option value="Payable to Association">Payable to Association</option>
              <option value="Payable to Goodman Management Group">Payable to Goodman Management Group</option>
            </select>
          </div>
        );
      case 'number':
        return <input type="number" step="0.01" {...commonProps} placeholder="0.00" />;
      case 'date':
        // Use text input for date to allow flexible input (per requirements)
        return <input type="text" {...commonProps} placeholder="mm/dd/yyyy or enter specific information" />;
      case 'text':
      default:
        return <input type="text" {...commonProps} placeholder="Enter value" />;
    }
  };

  // Check if a field is a fee field
  const isFeeField = (fieldKey) => {
    const vaFeeFields = ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee'];
    const ncFeeFields = ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'resaleCertificateFee'];
    const allFeeFields = [...vaFeeFields, ...ncFeeFields];
    return allFeeFields.includes(fieldKey);
  };

  // Render a single field based on its configuration
  const renderField = (field) => {
    // Use formData value, or defaultValue from field config, or empty string
    let value = formData[field.key] || field.defaultValue || '';
    
    // Special handling for associationAddress - if empty, try to get from HOA name
    if (field.key === 'associationAddress' && (!value || value.trim() === '')) {
      value = formData.associationName || 
              hoaProperty?.name || 
              '';
    }
    
    const hasError = errors[field.key];
    
    // Make totalAmountDue read-only and styled differently
    const isTotalField = field.key === 'totalAmountDue';
    
    // Check if this is a fee field (but not totalAmountDue)
    const isFee = isFeeField(field.key) && !isTotalField;

    // Use provided className or build default one
    const baseClassName = field.className || `w-full px-3 py-2.5 bg-gray-50 border rounded-lg ${field.type === 'textarea' ? 'text-base' : 'text-sm'} text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed ${
      hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200'
    } ${isTotalField ? 'bg-blue-50 font-semibold border-blue-300' : ''}`;
    
    // For textarea, ensure text-base is used instead of text-sm
    const finalClassName = field.type === 'textarea' 
      ? baseClassName.replace(/\btext-sm\b/g, 'text-base')
      : baseClassName;

    const commonProps = {
      value: value,
      onChange: (e) => handleInputChange(field.key, e.target.value),
      className: finalClassName,
      disabled: isCompleted || isTotalField,
      readOnly: isTotalField,
    };

    // Special handling for fee fields
    if (isFee) {
      const payableToKey = `${field.key}_payableTo`;
      const payableToValue = formData[payableToKey] || '';
      const payableToOptions = [
        'Payable to Association',
        'Payable to Goodman Management Group'
      ];
      
      // Extract numeric value for input (remove $ and format)
      let numericValue = '';
      if (value) {
        // Remove $ and any non-numeric characters except decimal point
        const cleaned = value.toString().replace(/[^0-9.]/g, '');
        if (cleaned) {
          // Check if the value is in an incomplete decimal state (ends with "." or has exactly one digit after decimal)
          const decimalIndex = cleaned.indexOf('.');
          const hasIncompleteDecimal = cleaned.endsWith('.') || 
            (decimalIndex !== -1 && cleaned.substring(decimalIndex + 1).length === 1);
          
          if (hasIncompleteDecimal) {
            // Preserve the raw string to maintain the incomplete decimal (e.g., "20.0" stays "20.0")
            numericValue = cleaned;
          } else {
            // Value is complete, use parseFloat to normalize
            const num = parseFloat(cleaned);
            if (!isNaN(num)) {
              numericValue = num.toString();
            }
          }
        }
      }
      
      return (
        <div className="space-y-2">
          <div className="flex">
            <span className="inline-flex items-center px-3 py-2.5 border border-r-0 border-gray-200 bg-gray-50 text-gray-700 text-sm rounded-l-lg">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={numericValue}
              onChange={(e) => {
                const inputValue = e.target.value;
                // Allow empty input for deletion
                if (inputValue === '' || inputValue === null || inputValue === undefined) {
                  handleInputChange(field.key, '');
                  return;
                }
                // Allow user to type freely - don't format while typing
                // Check if the value is a valid number or in the process of being typed
                const num = parseFloat(inputValue);
                if (!isNaN(num) && num >= 0) {
                  // Only format if the value doesn't end with a decimal point or has incomplete decimal
                  // This allows typing "20.0" without immediately formatting to "20.00"
                  // Check if it ends with "." or has exactly one digit after decimal point
                  const decimalIndex = inputValue.indexOf('.');
                  const hasIncompleteDecimal = inputValue.endsWith('.') || 
                    (decimalIndex !== -1 && inputValue.substring(decimalIndex + 1).length === 1);
                  
                  if (hasIncompleteDecimal) {
                    // User is still typing decimals, store raw numeric value
                    handleInputChange(field.key, inputValue);
                  } else {
                    // Value is complete, format with $ and 2 decimal places
                    handleInputChange(field.key, `$${num.toFixed(2)}`);
                  }
                } else {
                  // If invalid, just store the raw value temporarily
                  handleInputChange(field.key, inputValue);
                }
              }}
              onBlur={(e) => {
                // Format on blur to ensure proper formatting when user leaves field
                const inputValue = e.target.value;
                if (inputValue && inputValue !== '') {
                  const num = parseFloat(inputValue);
                  if (!isNaN(num) && num >= 0) {
                    handleInputChange(field.key, `$${num.toFixed(2)}`);
                  }
                }
              }}
              className={`flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed ${
                hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''
              }`}
              placeholder="0.00"
              disabled={isCompleted}
            />
          </div>
          <select
            value={payableToValue}
            onChange={(e) => {
              handleInputChange(payableToKey, e.target.value);
            }}
            className={`w-full px-3 py-2.5 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              errors[payableToKey] ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200'
            }`}
            disabled={isCompleted}
          >
            <option value="">Select Pay To...</option>
            {payableToOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

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
              className={`${commonProps.className} email-field-multi`}
              placeholder={field.placeholder || 'Enter email addresses separated by commas'}
              style={{
                minWidth: '100%',
                hyphens: 'none',
                WebkitHyphens: 'none',
                MozHyphens: 'none',
                msHyphens: 'none',
                wordBreak: 'normal',
                overflowWrap: 'break-word'
              }}
            />
          );
        }
        return (
          <input 
            type="email" 
            {...commonProps}
            style={{
              minWidth: '100%',
              hyphens: 'none',
              WebkitHyphens: 'none',
              MozHyphens: 'none',
              msHyphens: 'none',
              wordBreak: 'normal',
              overflowWrap: 'break-word'
            }}
          />
        );
      
      case 'date':
        return <input type="date" {...commonProps} />;
      
      default:
        return <input type="text" {...commonProps} placeholder={field.placeholder} />;
    }
  };

  // Scroll to first error field
  const scrollToFirstError = (errorKeys) => {
    if (!errorKeys || errorKeys.length === 0) return;
    
    // Find the first error field
    const firstErrorKey = errorKeys[0];
    const errorFieldRef = fieldRefs.current[firstErrorKey];
    
    if (errorFieldRef && errorFieldRef.current) {
      // Scroll to the field with smooth behavior
      errorFieldRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
      
      // Focus the input field after a short delay to ensure scroll completes
      setTimeout(() => {
        if (errorFieldRef.current) {
          // Try to find the input/select/textarea within the field container
          const input = errorFieldRef.current.querySelector('input, select, textarea');
          if (input && !input.disabled) {
            input.focus();
            // Also try to select the text if it's an input
            if (input.type === 'text' || input.type === 'email' || input.type === 'tel') {
              input.select();
            }
          }
        }
      }, 400);
    }
  };

  const validateForm = () => {
    // Use JSON-based validator
    const newErrors = validateFormDataHelper(propertyState, formData);
    setErrors(newErrors);
    const errorKeys = Object.keys(newErrors);
    
    // If there are errors, scroll to the first one
    if (errorKeys.length > 0) {
      // Use requestAnimationFrame and setTimeout to ensure state update and DOM render complete
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToFirstError(errorKeys);
        }, 150);
      });
    }
    
    return errorKeys.length === 0;
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
      
      // Ensure all payableTo values are included in formData before saving
      const formDataToSave = { ...formData };
      
      // Verify payableTo fields are present for fee fields
      const vaFeeFields = ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee'];
      const ncFeeFields = ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'resaleCertificateFee'];
      const allFeeFields = propertyState === 'VA' ? vaFeeFields : ncFeeFields;
      
      allFeeFields.forEach(feeKey => {
        const payableToKey = `${feeKey}_payableTo`;
        // If the fee has a value but no payableTo, set a default
        if (formDataToSave[feeKey] && !formDataToSave[payableToKey]) {
          // Set defaults based on fee type
          if (feeKey === 'ownerCurrentBalance' || feeKey === 'capitalContribution' || feeKey === 'prepaidAssessments') {
            formDataToSave[payableToKey] = 'Payable to Association';
          } else if (feeKey === 'transferFee' || feeKey === 'resaleCertificateFee') {
            formDataToSave[payableToKey] = 'Payable to Goodman Management Group';
          }
        }
      });
      
      const formDataToUpsert = {
        application_id: applicationId,
        form_type: 'settlement_form',
        form_data: formDataToSave,
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

      // Ensure all payableTo values are included in formData before saving
      const formDataToSave = { ...formData };
      
      // Verify payableTo fields are present for fee fields
      const vaFeeFields = ['ownerCurrentBalance', 'transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee'];
      const ncFeeFields = ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'resaleCertificateFee'];
      const allFeeFields = propertyState === 'VA' ? vaFeeFields : ncFeeFields;
      
      allFeeFields.forEach(feeKey => {
        const payableToKey = `${feeKey}_payableTo`;
        // If the fee has a value but no payableTo, set a default
        if (formDataToSave[feeKey] && !formDataToSave[payableToKey]) {
          // Set defaults based on fee type
          if (feeKey === 'ownerCurrentBalance' || feeKey === 'capitalContribution' || feeKey === 'prepaidAssessments') {
            formDataToSave[payableToKey] = 'Payable to Association';
          } else if (feeKey === 'transferFee' || feeKey === 'resaleCertificateFee') {
            formDataToSave[payableToKey] = 'Payable to Goodman Management Group';
          }
        }
      });
      
      let formError;
      if (existingForm) {
        // Update existing form
        const { error } = await supabase
          .from('property_owner_forms')
          .update({
            form_data: formDataToSave,
            response_data: formDataToSave,
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
          form_data: formDataToSave,
          response_data: formDataToSave,
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
                    <span className="font-medium text-gray-900">{formatPropertyAddress(application?.property_address, application?.unit_number) || 'N/A'}</span>
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
              sections.map((section, sectionIndex) => {
                const isAssessmentSection = section.section === 'Assessment Information';
                const isFeesSection = section.section === 'Fees';
                return (
                  <div key={sectionIndex} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className={`px-5 py-3 ${isFeesSection ? 'bg-blue-50/50 border-b border-blue-100' : 'bg-emerald-50/50 border-b border-emerald-100'} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        {isFeesSection && <DollarSign className="w-4 h-4 text-blue-600" />}
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                          {section.section}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAssessmentSection && !isCompleted && (
                          <button
                            onClick={addCustomField}
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors"
                          >
                            <span className="text-base">+</span>
                            Add Field
                          </button>
                        )}
                        {isFeesSection && !isCompleted && (
                          <button
                            onClick={addCustomFeeField}
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Add Fee
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`p-5 ${isFeesSection ? 'bg-gradient-to-br from-blue-50/30 to-white' : ''}`}>
                      {isAssessmentSection ? (
                        // Render Assessment Information with unified drag-and-drop (only if custom fields exist)
                        (() => {
                          const hasCustomFields = customFields.length > 0;
                          const allFields = hasCustomFields ? getAllAssessmentFields : section.fields;
                          
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              {hasCustomFields ? (
                                // Render with drag-and-drop when custom fields exist
                                allFields.map((field, index) => {
                                  const fieldWidth = field.width || (field.type === 'textarea' || field.key === 'totalAmountDue' ? 'full' : 'half');
                                  const colSpan = fieldWidth === 'full' ? 'md:col-span-2' : '';
                                  const isCustom = field.isCustom;
                                  const fieldIndex = isCustom ? customFields.findIndex(f => f.id === field.id) : section.fields.findIndex(f => f.key === field.key);
                                  
                                  // Create ref if it doesn't exist
                                  const refKey = isCustom ? `custom_${field.id}` : field.key;
                                  if (!fieldRefs.current[refKey]) {
                                    fieldRefs.current[refKey] = React.createRef();
                                  }
                                  
                                  return (
                                    <div
                                      key={isCustom ? field.id : field.key}
                                      ref={fieldRefs.current[refKey]}
                                      draggable={!isCompleted}
                                      onDragStart={(e) => handleDragStart(e, index)}
                                      onDragEnd={handleDragEnd}
                                      onDragOver={(e) => handleDragOver(e, index)}
                                      onDrop={(e) => handleDrop(e, index)}
                                      onDragLeave={handleDragLeave}
                                      className={`${colSpan} border rounded-lg p-4 transition-all group ${
                                        dragOverIndex === index
                                          ? 'border-blue-400 bg-blue-50'
                                          : draggedIndex === index
                                          ? 'border-gray-300 bg-gray-100 opacity-50'
                                          : isCustom
                                          ? 'border-gray-200 bg-gray-50'
                                          : 'border-transparent'
                                      } ${!isCompleted ? 'hover:border-gray-300 hover:shadow-sm cursor-move' : ''}`}
                                    >
                                      <div className="flex items-start gap-3">
                                        {!isCompleted && (
                                          <div className="mt-6 cursor-grab active:cursor-grabbing text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <GripVertical className="w-4 h-4" />
                                          </div>
                                        )}
                                        <div className="flex-1">
                                        {isCustom ? (
                                          <>
                                            <div className="flex items-center justify-between mb-3">
                                              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">
                                                {field.name || 'Unnamed Field'}
                                              </label>
                                              <div className="flex items-center gap-2">
                                                {!isCompleted && (
                                                  <button
                                                    type="button"
                                                    onClick={() => openFieldEditorForEdit(fieldIndex)}
                                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                    title="Edit field"
                                                  >
                                                    <FileText className="w-4 h-4" />
                                                  </button>
                                                )}
                                                {!isCompleted && (
                                                  <button
                                                    type="button"
                                                    onClick={() => removeCustomField(fieldIndex)}
                                                    className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                                    title="Remove field"
                                                  >
                                                    <X className="w-4 h-4" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            {renderCustomFieldInput(field, fieldIndex)}
                                          </>
                                        ) : (
                                          <>
                                            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                                              {field.label}
                                              {field.required && <span className="text-red-500 ml-1">*</span>}
                                              {field.key === 'totalAmountDue' && (
                                                <span className="ml-2 text-xs font-normal text-gray-500 normal-case">(Auto-calculated)</span>
                                              )}
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
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                              ) : (
                                // Render standard fields normally when no custom fields
                                section.fields.map((field) => {
                                  // Create ref if it doesn't exist
                                  if (!fieldRefs.current[field.key]) {
                                    fieldRefs.current[field.key] = React.createRef();
                                  }
                                  
                                  return (
                                    <div 
                                      key={field.key} 
                                      ref={fieldRefs.current[field.key]}
                                      className={field.type === 'textarea' ? 'md:col-span-2' : (field.key === 'totalAmountDue' ? 'md:col-span-2' : '')}
                                    >
                                      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                        {field.key === 'totalAmountDue' && (
                                          <span className="ml-2 text-xs font-normal text-gray-500 normal-case">(Auto-calculated)</span>
                                        )}
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
                                  );
                                })
                              )}
                            </div>
                          );
                        })()
                      ) : isFeesSection ? (
                        // Render Fees section with enhanced styling (standard + custom fee fields)
                        (() => {
                          const hasCustomFeeFields = customFields.some(f => f.type === 'fee');
                          const allFeesFields = hasCustomFeeFields ? getAllFeesFields : section.fields;
                          // Filter out totalAmountDue from display (redundant with Overall Total)
                          const fieldsWithoutTotal = allFeesFields.filter(f => f.key !== 'totalAmountDue');
                          
                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {fieldsWithoutTotal.map((field) => {
                                  const isCustom = field.isCustom;
                                  const fieldKey = isCustom ? `custom_${field.id}` : field.key;
                                  const customIndex = isCustom ? customFields.findIndex(f => f.id === field.id) : -1;
                                  
                                  // Create ref if it doesn't exist
                                  if (!fieldRefs.current[fieldKey]) {
                                    fieldRefs.current[fieldKey] = React.createRef();
                                  }
                                  
                                  return (
                                    <div 
                                      key={fieldKey} 
                                      ref={fieldRefs.current[fieldKey]}
                                      className={`bg-white rounded-lg border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow ${isCustom ? 'border-dashed' : ''}`}
                                    >
                                      {isCustom ? (
                                        <>
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                              {field.name || 'Unnamed Field'}
                                            </label>
                                            <div className="flex items-center gap-2">
                                              {!isCompleted && (
                                                <button
                                                  type="button"
                                                  onClick={() => openFieldEditorForEdit(customIndex)}
                                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                  title="Edit field"
                                                >
                                                  <FileText className="w-4 h-4" />
                                                </button>
                                              )}
                                              {!isCompleted && (
                                                <button
                                                  type="button"
                                                  onClick={() => removeCustomField(customIndex)}
                                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                                  title="Remove field"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          {renderCustomFieldInput(field, customIndex)}
                                        </>
                                      ) : (
                                        <>
                                          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Fee Totals - GMG, Association, and Overall */}
                              {(() => {
                                const feeTotals = calculateFeeTotals(formData, propertyState);
                                return (
                                  <div className="space-y-3 mt-4">
                                    {feeTotals.totalGMGNumeric > 0 && (
                                      <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg border-2 border-blue-200 p-4">
                                        <div className="flex items-center justify-between">
                                          <label className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                            Total for Goodman Management Group
                                          </label>
                                          <span className="text-lg font-semibold text-gray-900">{feeTotals.totalGMG}</span>
                                        </div>
                                      </div>
                                    )}
                                    {feeTotals.totalAssociationNumeric > 0 && (
                                      <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg border-2 border-blue-200 p-4">
                                        <div className="flex items-center justify-between">
                                          <label className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                            Total for Association
                                          </label>
                                          <span className="text-lg font-semibold text-gray-900">{feeTotals.totalAssociation}</span>
                                        </div>
                                      </div>
                                    )}
                                    {feeTotals.overallTotalNumeric > 0 && (
                                      <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg border-2 border-blue-200 p-5">
                                        <div className="flex items-center justify-between">
                                          <label className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                            Overall Total
                                          </label>
                                          <span className="text-xl font-bold text-gray-900">{feeTotals.overallTotal}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()
                      ) : (
                        // Render other sections normally
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {section.fields.map((field) => {
                            // Create ref if it doesn't exist
                            if (!fieldRefs.current[field.key]) {
                              fieldRefs.current[field.key] = React.createRef();
                            }
                            
                            return (
                              <div 
                                key={field.key} 
                                ref={fieldRefs.current[field.key]}
                                className={field.type === 'textarea' ? 'md:col-span-2' : (field.key === 'totalAmountDue' ? 'md:col-span-2' : '')}
                              >
                                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1.5">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                  {field.key === 'totalAmountDue' && (
                                    <span className="ml-2 text-xs font-normal text-gray-500 normal-case">(Auto-calculated)</span>
                                  )}
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
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
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

        {/* Field Editor Modal */}
        {showFieldEditor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingFieldIndex !== null ? 'Edit Field' : 'Add Custom Field'}
                </h2>
                <button
                  onClick={closeFieldEditor}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Field Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Field Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fieldEditorData.name}
                    onChange={(e) => setFieldEditorData({ ...fieldEditorData, name: e.target.value })}
                    maxLength={100}
                    placeholder="Enter field name"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                      fieldEditorErrors.name ? 'border-red-300' : 'border-gray-200'
                    }`}
                  />
                  {fieldEditorErrors.name && (
                    <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {fieldEditorErrors.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{fieldEditorData.name.length}/100 characters</p>
                </div>

                {/* Field Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Field Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={fieldEditorData.type}
                    onChange={(e) => setFieldEditorData({ ...fieldEditorData, type: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                      fieldEditorErrors.type ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    <option value="text">Text (single-line)</option>
                    <option value="number">Number (currency-compatible)</option>
                    {fieldEditorSection !== 'assessment' && <option value="fee">Fee (with Pay To)</option>}
                    <option value="date">Date</option>
                  </select>
                  {fieldEditorErrors.type && (
                    <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {fieldEditorErrors.type}
                    </p>
                  )}
                </div>

                {/* Field Value (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Field Value <span className="text-gray-500 text-xs">(Optional)</span>
                  </label>
                  {fieldEditorData.type === 'fee' ? (
                    <div className="space-y-2">
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-200 bg-gray-50 text-gray-700 text-sm rounded-l-lg">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(() => {
                            // Extract numeric value for input (remove $ and format)
                            let numericValue = '';
                            if (fieldEditorData.value) {
                              const cleaned = fieldEditorData.value.toString().replace(/[^0-9.]/g, '');
                              if (cleaned) {
                                // Check if the value is in an incomplete decimal state (ends with "." or has exactly one digit after decimal)
                                const decimalIndex = cleaned.indexOf('.');
                                const hasIncompleteDecimal = cleaned.endsWith('.') || 
                                  (decimalIndex !== -1 && cleaned.substring(decimalIndex + 1).length === 1);
                                
                                if (hasIncompleteDecimal) {
                                  // Preserve the raw string to maintain the incomplete decimal (e.g., "20.0" stays "20.0")
                                  numericValue = cleaned;
                                } else {
                                  // Value is complete, use parseFloat to normalize
                                  const num = parseFloat(cleaned);
                                  if (!isNaN(num)) {
                                    numericValue = num.toString();
                                  }
                                }
                              }
                            }
                            return numericValue;
                          })()}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            // Allow empty input for deletion
                            if (inputValue === '' || inputValue === null || inputValue === undefined) {
                              setFieldEditorData({ ...fieldEditorData, value: '' });
                              return;
                            }
                            // Parse the number
                            const num = parseFloat(inputValue);
                            if (!isNaN(num) && num >= 0) {
                              // Allow user to type freely - don't format while typing
                              // Check if it ends with "." or has exactly one digit after decimal point
                              const decimalIndex = inputValue.indexOf('.');
                              const hasIncompleteDecimal = inputValue.endsWith('.') || 
                                (decimalIndex !== -1 && inputValue.substring(decimalIndex + 1).length === 1);
                              
                              if (hasIncompleteDecimal) {
                                // User is still typing decimals, store raw numeric value
                                setFieldEditorData({ ...fieldEditorData, value: inputValue });
                              } else {
                                // Value is complete, format with $ and 2 decimal places
                                setFieldEditorData({ ...fieldEditorData, value: `$${num.toFixed(2)}` });
                              }
                            } else {
                              // If invalid, just store the raw value temporarily
                              setFieldEditorData({ ...fieldEditorData, value: inputValue });
                            }
                          }}
                          onBlur={(e) => {
                            // Format on blur to ensure proper formatting when user leaves field
                            const inputValue = e.target.value;
                            if (inputValue && inputValue !== '') {
                              const num = parseFloat(inputValue);
                              if (!isNaN(num) && num >= 0) {
                                setFieldEditorData({ ...fieldEditorData, value: `$${num.toFixed(2)}` });
                              }
                            }
                          }}
                          placeholder="0.00"
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </div>
                      <select
                        value={fieldEditorData.payableTo || ''}
                        onChange={(e) => setFieldEditorData({ ...fieldEditorData, payableTo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      >
                        <option value="">Select Pay To...</option>
                        <option value="Payable to Association">Payable to Association</option>
                        <option value="Payable to Goodman Management Group">Payable to Goodman Management Group</option>
                      </select>
                    </div>
                  ) : fieldEditorData.type === 'number' ? (
                    <input
                      type="number"
                      step="0.01"
                      value={fieldEditorData.value}
                      onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  ) : fieldEditorData.type === 'date' ? (
                    <input
                      type="text"
                      value={fieldEditorData.value}
                      onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                      placeholder="mm/dd/yyyy or enter specific information"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  ) : (
                    <input
                      type="text"
                      value={fieldEditorData.value}
                      onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                      placeholder="Enter value"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={closeFieldEditor}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveFieldFromEditor}
                  className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  {editingFieldIndex !== null ? 'Update' : 'Add'} Field
                </button>
              </div>
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
          sections.map((section, sectionIndex) => {
            const isAssessmentSection = section.section === 'Assessment Information';
            return (
              <div key={sectionIndex} className="bg-gray-50 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {section.section}
                  </h3>
                  {isAssessmentSection && !isCompleted && (
                    <button
                      onClick={addCustomField}
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors"
                    >
                      <span className="text-base">+</span>
                      Add Field
                    </button>
                  )}
                </div>
                {isAssessmentSection ? (
                  // Render Assessment Information with unified drag-and-drop (only if custom fields exist)
                  (() => {
                    const hasCustomFields = customFields.length > 0;
                    const allFields = hasCustomFields ? getAllAssessmentFields : section.fields;
                    
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {hasCustomFields ? (
                          // Render with drag-and-drop when custom fields exist
                          allFields.map((field, index) => {
                            const fieldWidth = field.width || (field.type === 'textarea' || field.key === 'totalAmountDue' ? 'full' : 'half');
                            const colSpan = fieldWidth === 'full' ? 'md:col-span-2' : '';
                            const isCustom = field.isCustom;
                            const fieldIndex = isCustom ? customFields.findIndex(f => f.id === field.id) : section.fields.findIndex(f => f.key === field.key);
                            
                            // Create ref if it doesn't exist
                            const refKey = isCustom ? `custom_${field.id}` : field.key;
                            if (!fieldRefs.current[refKey]) {
                              fieldRefs.current[refKey] = React.createRef();
                            }
                            
                            return (
                              <div
                                key={isCustom ? field.id : field.key}
                                ref={fieldRefs.current[refKey]}
                                draggable={!isCompleted}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragLeave={handleDragLeave}
                                className={`${colSpan} border rounded-lg p-4 transition-all group ${
                                  dragOverIndex === index
                                    ? 'border-blue-400 bg-blue-50'
                                    : draggedIndex === index
                                    ? 'border-gray-300 bg-gray-100 opacity-50'
                                    : isCustom
                                    ? 'border-gray-300 bg-white'
                                    : 'border-transparent'
                                } ${!isCompleted ? 'hover:border-gray-400 hover:shadow-sm cursor-move' : ''}`}
                              >
                                <div className="flex items-start gap-3">
                                  {!isCompleted && (
                                    <div className="mt-6 cursor-grab active:cursor-grabbing text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                  {isCustom ? (
                                    <>
                                      <div className="flex items-center justify-between mb-3">
                                        <label className="block text-sm font-medium text-gray-700">
                                          {field.name || 'Unnamed Field'}
                                        </label>
                                        <div className="flex items-center gap-2">
                                          {!isCompleted && (
                                            <button
                                              type="button"
                                              onClick={() => openFieldEditorForEdit(fieldIndex)}
                                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                              title="Edit field"
                                            >
                                              <FileText className="w-4 h-4" />
                                            </button>
                                          )}
                                          {!isCompleted && (
                                            <button
                                              type="button"
                                              onClick={() => removeCustomField(fieldIndex)}
                                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                              title="Remove field"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {renderCustomFieldInput(field, fieldIndex)}
                                    </>
                                  ) : (
                                    <>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                        {field.key === 'totalAmountDue' && (
                                          <span className="ml-2 text-xs font-normal text-gray-500">(Auto-calculated)</span>
                                        )}
                                      </label>
                                      {renderField(field)}
                                      {errors[field.key] && (
                                        <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                        ) : (
                          // Render standard fields normally when no custom fields
                          section.fields.map((field) => {
                            // Create ref if it doesn't exist
                            if (!fieldRefs.current[field.key]) {
                              fieldRefs.current[field.key] = React.createRef();
                            }
                            
                            return (
                              <div 
                                key={field.key} 
                                ref={fieldRefs.current[field.key]}
                                className={field.type === 'textarea' ? 'md:col-span-2' : (field.key === 'totalAmountDue' ? 'md:col-span-2' : '')}
                              >
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                  {field.key === 'totalAmountDue' && (
                                    <span className="ml-2 text-xs font-normal text-gray-500">(Auto-calculated)</span>
                                  )}
                                </label>
                                {renderField(field)}
                                {errors[field.key] && (
                                  <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()
                ) : (
                  // Render other sections normally
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.fields.map((field) => {
                      // Create ref if it doesn't exist
                      if (!fieldRefs.current[field.key]) {
                        fieldRefs.current[field.key] = React.createRef();
                      }
                      
                      return (
                        <div 
                          key={field.key} 
                          ref={fieldRefs.current[field.key]}
                          className={field.type === 'textarea' ? 'md:col-span-2' : (field.key === 'totalAmountDue' ? 'md:col-span-2' : '')}
                        >
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                            {field.key === 'totalAmountDue' && (
                              <span className="ml-2 text-xs font-normal text-gray-500">(Auto-calculated)</span>
                            )}
                          </label>
                          {renderField(field)}
                          {errors[field.key] && (
                            <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
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

      {/* Field Editor Modal */}
      {showFieldEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingFieldIndex !== null ? 'Edit Field' : 'Add Custom Field'}
              </h2>
              <button
                onClick={closeFieldEditor}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Field Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Field Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fieldEditorData.name}
                  onChange={(e) => setFieldEditorData({ ...fieldEditorData, name: e.target.value })}
                  maxLength={100}
                  placeholder="Enter field name"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                    fieldEditorErrors.name ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {fieldEditorErrors.name && (
                  <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {fieldEditorErrors.name}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{fieldEditorData.name.length}/100 characters</p>
              </div>

              {/* Field Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Field Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={fieldEditorData.type}
                  onChange={(e) => setFieldEditorData({ ...fieldEditorData, type: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                    fieldEditorErrors.type ? 'border-red-300' : 'border-gray-200'
                  }`}
                >
                  <option value="text">Text (single-line)</option>
                  <option value="number">Number (currency-compatible)</option>
                  {fieldEditorSection !== 'assessment' && <option value="fee">Fee (with Pay To)</option>}
                  <option value="date">Date</option>
                </select>
                {fieldEditorErrors.type && (
                  <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {fieldEditorErrors.type}
                  </p>
                )}
              </div>

              {/* Field Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Field Width
                </label>
                <select
                  value={fieldEditorData.width || 'half'}
                  onChange={(e) => setFieldEditorData({ ...fieldEditorData, width: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="half">Half Width (2 columns)</option>
                  <option value="full">Full Width (1 column)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Half width fields appear side-by-side, full width fields span the entire row</p>
              </div>

              {/* Field Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Field Width
                </label>
                <select
                  value={fieldEditorData.width || 'half'}
                  onChange={(e) => setFieldEditorData({ ...fieldEditorData, width: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="half">Half Width (2 columns)</option>
                  <option value="full">Full Width (1 column)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Half width fields appear side-by-side, full width fields span the entire row</p>
              </div>

              {/* Field Value (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Field Value <span className="text-gray-500 text-xs">(Optional)</span>
                </label>
                {fieldEditorData.type === 'fee' ? (
                  <div className="space-y-2">
                    <div className="flex">
                      <span className="inline-flex items-center px-3 py-2 border border-r-0 border-gray-200 bg-gray-50 text-gray-700 text-sm rounded-l-lg">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(() => {
                          // Extract numeric value for input (remove $ and format)
                          let numericValue = '';
                          if (fieldEditorData.value) {
                            const cleaned = fieldEditorData.value.toString().replace(/[^0-9.]/g, '');
                            if (cleaned) {
                              const num = parseFloat(cleaned);
                              if (!isNaN(num)) {
                                numericValue = num.toString();
                              }
                            }
                          }
                          return numericValue;
                        })()}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          // Allow empty input for deletion
                          if (inputValue === '' || inputValue === null || inputValue === undefined) {
                            setFieldEditorData({ ...fieldEditorData, value: '' });
                            return;
                          }
                          // Parse the number
                          const num = parseFloat(inputValue);
                          if (!isNaN(num) && num >= 0) {
                            // Format with $ and 2 decimal places
                            setFieldEditorData({ ...fieldEditorData, value: `$${num.toFixed(2)}` });
                          } else {
                            // If invalid, just store the raw value temporarily
                            setFieldEditorData({ ...fieldEditorData, value: inputValue });
                          }
                        }}
                        onBlur={(e) => {
                          // Format on blur to ensure proper formatting when user leaves field
                          const inputValue = e.target.value;
                          if (inputValue && inputValue !== '') {
                            const num = parseFloat(inputValue);
                            if (!isNaN(num) && num >= 0) {
                              setFieldEditorData({ ...fieldEditorData, value: `$${num.toFixed(2)}` });
                            }
                          }
                        }}
                        placeholder="0.00"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <select
                      value={fieldEditorData.payableTo || ''}
                      onChange={(e) => setFieldEditorData({ ...fieldEditorData, payableTo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                      <option value="">Select Pay To...</option>
                      <option value="Payable to Association">Payable to Association</option>
                      <option value="Payable to Goodman Management Group">Payable to Goodman Management Group</option>
                    </select>
                  </div>
                ) : fieldEditorData.type === 'number' ? (
                  <input
                    type="number"
                    step="0.01"
                    value={fieldEditorData.value}
                    onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                ) : fieldEditorData.type === 'date' ? (
                  <input
                    type="text"
                    value={fieldEditorData.value}
                    onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                    placeholder="mm/dd/yyyy or enter specific information"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                ) : (
                  <input
                    type="text"
                    value={fieldEditorData.value}
                    onChange={(e) => setFieldEditorData({ ...fieldEditorData, value: e.target.value })}
                    placeholder="Enter value"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={closeFieldEditor}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveFieldFromEditor}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                {editingFieldIndex !== null ? 'Update' : 'Add'} Field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}