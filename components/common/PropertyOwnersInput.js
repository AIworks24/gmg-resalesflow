import React, { useCallback, useState, useEffect, useRef } from 'react';
import { X, Plus, User, Mail, Phone, AlertCircle, Loader2, Info } from 'lucide-react';
import { isValidEmail } from '../../lib/emailUtils';

/**
 * PropertyOwnersInput Component
 * Manages multiple property owners, each with name, email, and phone
 * 
 * @param {Array<{name: string, email: string, phone: string}>} value - Array of owner objects
 * @param {Function} onChange - Callback when owners change: (owners: Array) => void
 * @param {boolean} required - Whether at least one owner is required
 * @param {boolean} showValidationErrors - Whether to show validation errors (for form submission)
 * @param {string} className - Additional CSS classes
 */
const PropertyOwnersInput = ({ 
  value = [], 
  onChange, 
  required = false,
  showValidationErrors = false,
  className = ''
}) => {
  // Ensure value is always an array
  const owners = Array.isArray(value) ? value : [];

  // State for email autocomplete per owner
  const [emailInputs, setEmailInputs] = useState({});
  
  // Sync emailInputs with owner emails when owners change externally (e.g., loaded from DB)
  // Only sync when emailInputs is empty/undefined to avoid clearing user input
  useEffect(() => {
    const syncedInputs = {};
    owners.forEach((owner, index) => {
      const currentInput = emailInputs[index];
      // Only sync if input is empty/undefined and owner has email
      if ((!currentInput || currentInput === '') && owner.email) {
        syncedInputs[index] = owner.email;
      }
    });
    if (Object.keys(syncedInputs).length > 0) {
      setEmailInputs(prev => ({ ...prev, ...syncedInputs }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners.length]); // Only sync when number of owners changes (initial load)
  const [suggestions, setSuggestions] = useState({});
  const [showSuggestions, setShowSuggestions] = useState({});
  const [selectedIndex, setSelectedIndex] = useState({});
  const [isLoading, setIsLoading] = useState({});
  const [emailStatus, setEmailStatus] = useState({}); // Track if emails are registered (true/false/undefined)
  const debounceTimers = useRef({});
  const statusCheckTimers = useRef({});
  const suggestionRefs = useRef({});
  const inputRefs = useRef({});

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Update owner field - defined first as it's used by other callbacks
  // Use the current owners from props to ensure we always have the latest data
  const updateOwner = useCallback((index, field, fieldValue) => {
    const updatedOwners = owners.map((owner, i) => {
      if (i === index) {
        return { ...owner, [field]: fieldValue };
      }
      return owner;
    });
    onChange(updatedOwners);
  }, [owners, onChange]);

  // Check if an email is a registered user (admin/staff/accounting)
  const checkEmailStatus = useCallback(async (email, ownerIndex) => {
    if (!email || !emailRegex.test(email.trim())) {
      setEmailStatus(prev => ({ ...prev, [ownerIndex]: undefined }));
      return;
    }

    try {
      const response = await fetch(`/api/admin/search-users-by-email?q=${encodeURIComponent(email.trim())}&limit=1`);
      if (response.ok) {
        const data = await response.json();
        const isRegistered = data.users && data.users.some(user => 
          user.email.toLowerCase() === email.trim().toLowerCase()
        );
        setEmailStatus(prev => ({
          ...prev,
          [ownerIndex]: isRegistered
        }));
      }
    } catch (error) {
      console.error('Error checking email status:', error);
      // Don't set status on error - allow the email
    }
  }, []);

  // Fetch user suggestions from API
  const fetchSuggestions = useCallback(async (searchTerm, ownerIndex) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSuggestions(prev => ({ ...prev, [ownerIndex]: [] }));
      return;
    }

    // Don't search if it looks like a complete email being typed
    if (emailRegex.test(searchTerm.trim())) {
      setSuggestions(prev => ({ ...prev, [ownerIndex]: [] }));
      return;
    }

    setIsLoading(prev => ({ ...prev, [ownerIndex]: true }));
    try {
      const response = await fetch(`/api/admin/search-users-by-email?q=${encodeURIComponent(searchTerm)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        const allUsers = data.users || [];
        
        // Get all emails already used by other owners (excluding current owner)
        const usedEmails = new Set();
        owners.forEach((owner, idx) => {
          if (idx !== ownerIndex) {
            // Check both emailInputs and owner.email
            const email = (emailInputs[idx] || owner.email)?.trim().toLowerCase();
            if (email) {
              usedEmails.add(email);
            }
          }
        });
        
        // Filter out users whose emails are already used
        const filteredUsers = allUsers.filter(user => {
          const userEmail = user.email?.trim().toLowerCase();
          return userEmail && !usedEmails.has(userEmail);
        });
        
        setSuggestions(prev => ({ ...prev, [ownerIndex]: filteredUsers }));
      } else {
        setSuggestions(prev => ({ ...prev, [ownerIndex]: [] }));
      }
    } catch (error) {
      console.error('Error fetching user suggestions:', error);
      setSuggestions(prev => ({ ...prev, [ownerIndex]: [] }));
    } finally {
      setIsLoading(prev => ({ ...prev, [ownerIndex]: false }));
    }
  }, [owners, emailInputs]);


  // Handle email input change with debounced autocomplete (no real-time validation)
  const handleEmailInputChange = useCallback((index, value) => {
    // Update email input state for autocomplete (for search suggestions)
    setEmailInputs(prev => ({ ...prev, [index]: value }));
    
    // Update owner email immediately
    updateOwner(index, 'email', value);
    
    // Clear existing timers
    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index]);
    }
    if (statusCheckTimers.current[index]) {
      clearTimeout(statusCheckTimers.current[index]);
    }
    
    // Debounce autocomplete search
    const trimmedValue = value.trim();
    if (trimmedValue.length >= 2 && !trimmedValue.includes('@')) {
      debounceTimers.current[index] = setTimeout(() => {
        fetchSuggestions(trimmedValue, index);
        setShowSuggestions(prev => ({ ...prev, [index]: true }));
      }, 300);
    } else {
      setSuggestions(prev => ({ ...prev, [index]: [] }));
      setShowSuggestions(prev => ({ ...prev, [index]: false }));
    }
    
    // Check email registration status when user finishes typing (debounced)
    if (trimmedValue && emailRegex.test(trimmedValue)) {
      statusCheckTimers.current[index] = setTimeout(() => {
        checkEmailStatus(trimmedValue, index);
      }, 500); // Check after 500ms of no typing
    } else {
      setEmailStatus(prev => ({ ...prev, [index]: undefined }));
    }
  }, [fetchSuggestions, updateOwner, checkEmailStatus]);

  // Handle user selection from autocomplete
  const handleUserSelect = useCallback((index, user) => {
    // Update emailInputs immediately (for display)
    setEmailInputs(prev => ({ ...prev, [index]: user.email }));
    
    // Update owner email and name in a single atomic update to ensure consistency
    const updatedOwners = owners.map((owner, i) => {
      if (i === index) {
        return {
          ...owner,
          email: user.email,
          // Auto-fill name if empty
          name: owner.name?.trim() || user.name || owner.name
        };
      }
      return owner;
    });
    onChange(updatedOwners);
    
    setShowSuggestions(prev => ({ ...prev, [index]: false }));
    setSuggestions(prev => ({ ...prev, [index]: [] }));
    // Set status to registered
    setEmailStatus(prev => ({ ...prev, [index]: true }));
  }, [owners, onChange]);

  // Handle keyboard navigation in suggestions
  const handleEmailKeyDown = useCallback((e, index) => {
    const ownerSuggestions = suggestions[index] || [];
    const currentSelected = selectedIndex[index] ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentSelected < ownerSuggestions.length - 1 ? currentSelected + 1 : currentSelected;
      setSelectedIndex(prev => ({ ...prev, [index]: nextIndex }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentSelected > 0 ? currentSelected - 1 : -1;
      setSelectedIndex(prev => ({ ...prev, [index]: prevIndex }));
    } else if (e.key === 'Enter' && currentSelected >= 0 && ownerSuggestions[currentSelected]) {
      e.preventDefault();
      handleUserSelect(index, ownerSuggestions[currentSelected]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(prev => ({ ...prev, [index]: false }));
    }
  }, [suggestions, selectedIndex, handleUserSelect]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(suggestionRefs.current).forEach(index => {
        if (suggestionRefs.current[index] && !suggestionRefs.current[index].contains(event.target) &&
            inputRefs.current[index] && !inputRefs.current[index].contains(event.target)) {
          setShowSuggestions(prev => ({ ...prev, [index]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check email registration status for existing emails when component loads or emails change
  useEffect(() => {
    const timers = [];
    
    owners.forEach((owner, index) => {
      // Prefer emailInputs (what user sees) over owner.email
      const email = (emailInputs[index] || owner.email)?.trim();
      if (email && emailRegex.test(email)) {
        // Check email status (will be debounced by the checkEmailStatus function)
        // Small delay to avoid too many simultaneous requests
        const timer = setTimeout(() => {
          checkEmailStatus(email, index);
        }, index * 150); // Stagger requests by 150ms per owner
        timers.push(timer);
      } else {
        // Clear status if email is invalid or empty
        setEmailStatus(prev => {
          const newState = { ...prev };
          delete newState[index];
          return newState;
        });
      }
    });
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners.map((o, i) => (emailInputs[i] || o.email || '')).join('|'), checkEmailStatus]); // Re-check when emails change

  const addOwner = useCallback(() => {
    const newOwner = { name: '', email: '', phone: '' };
    onChange([...owners, newOwner]);
  }, [owners, onChange]);

  const removeOwner = useCallback((index) => {
    const updatedOwners = owners.filter((_, i) => i !== index);
    onChange(updatedOwners);
    // Clean up state for removed owner
    setEmailInputs(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
    setSuggestions(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
    setShowSuggestions(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
    setEmailStatus(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
    // Clean up timers
    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index]);
      delete debounceTimers.current[index];
    }
    if (statusCheckTimers.current[index]) {
      clearTimeout(statusCheckTimers.current[index]);
      delete statusCheckTimers.current[index];
    }
  }, [owners, onChange]);

  // Validation (only used when showValidationErrors is true - for form submission)
  const validateOwner = (owner, index) => {
    if (!showValidationErrors) return [];
    
    const errors = [];
    
    // Get the current email value - prefer emailInputs (what user sees) over owner.email
    const currentEmail = emailInputs[index] !== undefined 
      ? emailInputs[index] 
      : (owner.email || '');
    const trimmedEmail = currentEmail.trim();
    const trimmedName = owner.name?.trim() || '';
    const trimmedPhone = owner.phone?.trim() || '';
    
    // Check if owner has meaningful data (not just a single character being typed)
    // Consider it "has data" only if name/email has at least 2 characters or phone has content
    const hasMeaningfulData = 
      (trimmedName && trimmedName.length >= 2) || 
      (trimmedEmail && trimmedEmail.length >= 2) || 
      trimmedPhone;
    
    // Only validate if owner has meaningful data OR if it's the only owner (required)
    // This prevents showing errors while user is just starting to type
    if (!hasMeaningfulData && owners.length > 1) {
      // Skip validation for owners with minimal/no data (unless it's the only owner)
      return [];
    }
    
    // Only show required errors on form submission, not while typing
    if (required && !trimmedName) {
      errors.push(`Owner ${index + 1}: Name is required`);
    }
    
    if (required && !trimmedEmail) {
      errors.push(`Owner ${index + 1}: Email is required`);
    } else if (trimmedEmail) {
      // Format validation (duplicate check - real-time validation already shows this)
      // But we include it here for the summary at the bottom
      if (!isValidEmail(trimmedEmail)) {
        errors.push(`Owner ${index + 1}: Invalid email format`);
      }
    }
    
    return errors;
  };

  const allErrors = showValidationErrors 
    ? owners.flatMap((owner, index) => validateOwner(owner, index))
    : [];
  const hasErrors = allErrors.length > 0;

  return (
    <div className={className}>
      <div className="space-y-4">
        {owners.map((owner, index) => {
          const ownerSuggestions = suggestions[index] || [];
          const showOwnerSuggestions = showSuggestions[index] && ownerSuggestions.length > 0;
          const ownerSelectedIndex = selectedIndex[index] ?? -1;
          const ownerIsLoading = isLoading[index] || false;
          // Use emailInputs for autocomplete, fallback to owner.email
          const emailInputValue = emailInputs[index] !== undefined ? emailInputs[index] : (owner.email || '');

          return (
            <div
              key={index}
              className="border border-gray-300 rounded-lg p-4 bg-gray-50 relative"
            >
              {/* Remove button */}
              {owners.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOwner(index)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Remove owner"
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {/* Owner number badge */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                  {index + 1}
                </div>
                <h4 className="text-sm font-medium text-gray-700">
                  Owner {index + 1}
                </h4>
              </div>

              {/* Owner fields - Email first, then Name, then Phone */}
              {/* Mobile: Stack all fields vertically */}
              {/* Tablet+: Email spans 2 columns, Name and Phone share 1 column each */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Owner Email - First field with autocomplete, spans 2 columns on tablet+ */}
                <div className="relative md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email {required && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative" ref={el => inputRefs.current[index] = el}>
                    <input
                      type="email"
                      value={emailInputValue}
                      onChange={(e) => handleEmailInputChange(index, e.target.value)}
                      onFocus={() => {
                        const trimmed = emailInputValue.trim();
                        if (trimmed.length >= 2 && !trimmed.includes('@')) {
                          fetchSuggestions(trimmed, index);
                          setShowSuggestions(prev => ({ ...prev, [index]: true }));
                        }
                      }}
                      onKeyDown={(e) => handleEmailKeyDown(e, index)}
                      required={required}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                    {ownerIsLoading && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Autocomplete suggestions dropdown */}
                  {showOwnerSuggestions && (
                    <div
                      ref={el => suggestionRefs.current[index] = el}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                    >
                      {ownerSuggestions.map((user, sugIndex) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleUserSelect(index, user)}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                            sugIndex === ownerSelectedIndex ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{user.name}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                            <span className="text-xs text-gray-400 capitalize">{user.role}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Owner Name - Second field, 1 column on tablet+ */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="w-4 h-4 inline mr-1" />
                    Name {required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={owner.name || ''}
                    onChange={(e) => updateOwner(index, 'name', e.target.value)}
                    required={required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John Doe"
                  />
                </div>

                {/* Owner Phone - Third field, 1 column on tablet+ */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={owner.phone || ''}
                    onChange={(e) => updateOwner(index, 'phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* Warning for unregistered email (not an error, just informational) */}
              {emailInputValue && emailStatus[index] === false && (
                <div className="mt-2 text-sm text-amber-600 flex items-start gap-1 bg-amber-50 border border-amber-200 rounded-md p-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>This email address is not registered in the system. The owner can still be added and will receive notifications via email.</span>
                </div>
              )}

              {/* Owner-specific errors - only show when showValidationErrors is true (for form submission) */}
              {showValidationErrors && validateOwner(owner, index).length > 0 && (
                <div className="mt-2 text-sm text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    {validateOwner(owner, index).map((error, errIndex) => (
                      <div key={errIndex}>{error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Owner button */}
        <button
          type="button"
          onClick={addOwner}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add Another Owner</span>
        </button>
      </div>

      {/* Global validation errors - only show when showValidationErrors is true */}
      {showValidationErrors && hasErrors && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <div className="font-medium mb-1">Please fix the following errors:</div>
              <ul className="list-disc list-inside space-y-1">
                {allErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Helper text */}
      {!hasErrors && owners.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {owners.length} owner{owners.length !== 1 ? 's' : ''} added
        </p>
      )}

      {/* Required field indicator */}
      {required && owners.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          At least one property owner is required
        </p>
      )}
    </div>
  );
};

export default PropertyOwnersInput;
