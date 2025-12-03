import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, User, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * MultiEmailInput Component with Autocomplete
 * A tokenized email input that supports multiple email addresses with autocomplete
 * 
 * Features:
 * - Visual chips/tags for each email
 * - Autocomplete suggestions from admin/staff/accounting users
 * - Warning if email is not a registered user
 * - Enter, comma, or semicolon to confirm email
 * - Individual email validation
 * - Inline error feedback
 * - Delete tags by clicking X
 * 
 * @param {Array<string>} value - Array of email addresses
 * @param {Function} onChange - Callback when emails change: (emails: string[]) => void
 * @param {boolean} required - Whether the field is required
 * @param {string} className - Additional CSS classes
 * @param {string} placeholder - Placeholder text
 */
const MultiEmailInput = ({ 
  value = [], 
  onChange, 
  required = false,
  className = '',
  placeholder = 'Type to search users or enter email addresses'
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [emailStatus, setEmailStatus] = useState({}); // Track if emails are registered users
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Ensure value is always an array
  const emails = Array.isArray(value) ? value : (value ? [value] : []);

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Fetch user suggestions from API
  const fetchSuggestions = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }

    // Don't search if it looks like a complete email being typed
    if (emailRegex.test(searchTerm.trim())) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/search-users-by-email?q=${encodeURIComponent(searchTerm)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.users || []);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error fetching user suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if an email is a registered user
  const checkEmailStatus = useCallback(async (email) => {
    if (!email || !emailRegex.test(email.trim())) return;

    try {
      const response = await fetch(`/api/admin/search-users-by-email?q=${encodeURIComponent(email.trim())}&limit=1`);
      if (response.ok) {
        const data = await response.json();
        const isRegistered = data.users && data.users.some(user => 
          user.email.toLowerCase() === email.trim().toLowerCase()
        );
        setEmailStatus(prev => ({
          ...prev,
          [email.toLowerCase()]: isRegistered
        }));
      }
    } catch (error) {
      console.error('Error checking email status:', error);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmedValue = inputValue.trim();
    if (trimmedValue.length >= 2 && !trimmedValue.includes(',') && !trimmedValue.includes(';')) {
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(trimmedValue);
        setShowSuggestions(true);
      }, 300); // 300ms debounce
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue, fetchSuggestions]);

  const validateEmail = (email) => {
    const trimmed = email.trim();
    if (!trimmed) return { valid: false, error: 'Email cannot be empty' };
    if (!emailRegex.test(trimmed)) return { valid: false, error: 'Invalid email format' };
    if (emails.includes(trimmed)) return { valid: false, error: 'Email already added' };
    return { valid: true, email: trimmed };
  };

  const addEmail = (email) => {
    const validation = validateEmail(email);
    if (validation.valid) {
      const newEmails = [...emails, validation.email];
      onChange(newEmails);
      setInputValue('');
      setError('');
      setShowSuggestions(false);
      setSelectedIndex(-1);
      
      // Check if email is registered user
      checkEmailStatus(validation.email);
    } else {
      setError(validation.error);
      // Clear error after 3 seconds
      setTimeout(() => setError(''), 3000);
    }
  };

  const removeEmail = (indexToRemove) => {
    const emailToRemove = emails[indexToRemove];
    const newEmails = emails.filter((_, index) => index !== indexToRemove);
    onChange(newEmails);
    setError('');
    
    // Remove from status tracking
    if (emailToRemove) {
      setEmailStatus(prev => {
        const updated = { ...prev };
        delete updated[emailToRemove.toLowerCase()];
        return updated;
      });
    }
  };

  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          addEmail(suggestions[selectedIndex].email);
        } else if (inputValue.trim()) {
          addEmail(inputValue);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (inputValue.trim()) {
        addEmail(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && emails.length > 0) {
      // Remove last email if backspace is pressed on empty input
      removeEmail(emails.length - 1);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    setError(''); // Clear error when user types
    setSelectedIndex(-1);

    // Check for comma or semicolon to add email
    if (value.includes(',') || value.includes(';')) {
      const separator = value.includes(',') ? ',' : ';';
      const parts = value.split(separator);
      const emailToAdd = parts[0].trim();
      const remaining = parts.slice(1).join(separator).trim();
      
      if (emailToAdd) {
        addEmail(emailToAdd);
        setInputValue(remaining);
      } else {
        setInputValue(remaining);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Split by comma, semicolon, or newline
    const emailsToAdd = pastedText
      .split(/[,;\n]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);
    
    if (emailsToAdd.length > 0) {
      // Add all valid emails
      let newEmails = [...emails];
      emailsToAdd.forEach(email => {
        const validation = validateEmail(email);
        if (validation.valid && !newEmails.includes(validation.email)) {
          newEmails.push(validation.email);
          checkEmailStatus(validation.email);
        }
      });
      onChange(newEmails);
      setInputValue('');
      setError('');
      setShowSuggestions(false);
    }
  };

  const handleBlur = (e) => {
    // Don't hide suggestions if clicking on a suggestion
    if (suggestionsRef.current?.contains(e.relatedTarget)) {
      return;
    }
    
    // Add email if there's text in the input when blurring
    if (inputValue.trim()) {
      addEmail(inputValue);
    }
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion) => {
    addEmail(suggestion.email);
  };

  // Check status of existing emails when they change
  useEffect(() => {
    emails.forEach(email => {
      const emailLower = email.toLowerCase();
      // Only check if we haven't checked this email yet
      if (email && emailStatus[emailLower] === undefined) {
        checkEmailStatus(email);
      }
    });
  }, [emails]); // Run when emails change

  return (
    <div className={`w-full relative ${className}`}>
      <div
        className={`
          w-full min-h-[42px] px-3 py-2 border rounded-md
          focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
          flex flex-wrap items-center gap-2
          ${required && emails.length === 0 ? 'border-red-300' : ''}
        `}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Email chips */}
        {emails.map((email, index) => {
          const isRegistered = emailStatus[email.toLowerCase()];
          return (
            <span
              key={index}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${
                isRegistered === true 
                  ? 'bg-green-100 text-green-800' 
                  : isRegistered === false
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              <span>{email}</span>
              {isRegistered === true && (
                <CheckCircle className="w-3 h-3" title="Registered user" />
              )}
              {isRegistered === false && (
                <AlertCircle className="w-3 h-3" title="Not a registered user" />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEmail(index);
                }}
                className="hover:opacity-70 rounded-full p-0.5 transition-opacity"
                aria-label={`Remove ${email}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={emails.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
        />
      </div>

      {/* Autocomplete suggestions dropdown */}
      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
        >
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-gray-500">Searching...</div>
          ) : (
            suggestions.map((suggestion, index) => (
              <div
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion)}
                className={`
                  px-4 py-2 cursor-pointer hover:bg-blue-50 flex items-center gap-2
                  ${selectedIndex === index ? 'bg-blue-50' : ''}
                `}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <User className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {suggestion.name}
                  </div>
                  <div className="text-xs text-gray-500">{suggestion.email}</div>
                </div>
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                  {suggestion.role}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      )}

      {/* Warning for non-registered emails */}
      {!error && emails.some(email => emailStatus[email.toLowerCase()] === false) && (
        <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          <span>
            Some emails are not registered users. They can still be added and will receive notifications.
          </span>
        </p>
      )}

      {/* Helper text */}
      {!error && emails.length > 0 && !emails.some(email => emailStatus[email.toLowerCase()] === false) && (
        <p className="mt-1 text-xs text-gray-500">
          {emails.length} email{emails.length !== 1 ? 's' : ''} added
        </p>
      )}

      {/* Required field indicator */}
      {required && emails.length === 0 && !error && (
        <p className="mt-1 text-xs text-gray-500">
          At least one email address is required
        </p>
      )}
    </div>
  );
};

export default MultiEmailInput;
