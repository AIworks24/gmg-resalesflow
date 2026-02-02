/**
 * Property Inspection Form PDF Document Component
 * Matches the exact layout of property_inspection_form_sample.pdf
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ProfessionalHeader } from './ProfessionalHeader';
import { ProfessionalFooter } from './ProfessionalFooter';
import { formatDateMonthDayYear } from '../timeUtils';

// Create styles matching the sample PDF exactly
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
  },
  mainTitle: {
    color: '#0f4734',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 10,
    paddingBottom: 8,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  dateInfo: {
    marginBottom: 12,
    marginLeft: 20,
    marginRight: 20,
    fontSize: 10,
    color: '#6b7280',
  },
  dateInfoLine: {
    marginBottom: 4,
    fontSize: 10,
  },
  section: {
    backgroundColor: '#f9fafb',
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 20,
    marginRight: 20,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#0f4734',
  },
  sectionTitle: {
    color: '#0f4734',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 0,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  field: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  label: {
    fontWeight: 'bold',
    color: '#0f4734',
    minWidth: 150,
    fontSize: 10,
  },
  value: {
    color: '#111827',
    fontSize: 10,
    flex: 1,
  },
  valueLong: {
    color: '#111827',
    fontSize: 9,
    flex: 1,
  },
  completedStatus: {
    color: '#0f4734',
    fontWeight: 'bold',
  },
  additionalInfo: {
    marginTop: 20,
    fontSize: 10,
    color: '#111827',
  },
  additionalInfoText: {
    marginBottom: 4,
    fontSize: 10,
  },
});

function InspectionFormPdfDocument({
  propertyAddress,
  hoaName,
  generatedDate,
  formStatus,
  completedAt,
  formData = {},
  logoBase64 = null,
  timezone = null,
}) {
  // Get user's timezone if not provided
  const userTimezone = timezone || (typeof Intl !== 'undefined' && Intl.DateTimeFormat?.().resolvedOptions?.().timeZone) || 'UTC';
  
  // Format date as Month-Day-Year (e.g. 1-23-2026), with optional time
  const formatDateInTimezone = (date, includeTime = false) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '';
    const datePart = formatDateMonthDayYear(dateObj, userTimezone);
    if (!includeTime) return datePart;
    const timePart = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone
    });
    return `${datePart}, ${timePart}`;
  };

  // Format a form value for display; dates become Month-Day-Year (1-23-2026)
  const formatFormValue = (value) => {
    if (value === null || value === undefined) return 'Not provided';
    const str = String(value);
    if (!str) return 'Not provided';
    const dateObj = new Date(str);
    if (!isNaN(dateObj.getTime()) && (str.includes('-') || str.includes('T'))) {
      return formatDateMonthDayYear(dateObj, userTimezone);
    }
    return str;
  };

  // Format form data fields
  const inspectionFields = Object.entries(formData)
    .filter(([key]) => {
      const internalFields = ['status', 'association', 'completedAt', 'completedBy'];
      return !internalFields.includes(key);
    })
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim(),
      value: formatFormValue(value)
    }));

  return React.createElement(
    Document,
    { title: `Property Inspection Form - ${propertyAddress}` },
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, wrap: true, debug: false },
      // Professional Header
      React.createElement(ProfessionalHeader, { logoBase64 }),
      // Main Title (centered)
      React.createElement(
        View,
        { style: { alignItems: 'center', width: '100%' } },
        React.createElement(
          Text,
          { style: styles.mainTitle },
          'Property Inspection Form'
        )
      ),
      // Date Information
      React.createElement(
        View,
        { style: styles.dateInfo },
        React.createElement(
          Text,
          { style: styles.dateInfoLine },
          `Generated on: ${formatDateInTimezone(new Date(), true)}`
        ),
        React.createElement(
          Text,
          { style: styles.dateInfoLine },
          `Property Address: ${propertyAddress}`
        ),
        React.createElement(
          Text,
          { style: styles.dateInfoLine },
          `HOA: ${hoaName}`
        )
      ),
      // Form Status Section
      React.createElement(
        View,
        { 
          style: styles.section
        },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          'Form Status'
        ),
        React.createElement(
          View,
          { style: styles.field },
          React.createElement(
            Text,
            { style: styles.label },
            'Status:'
          ),
          React.createElement(
            Text,
            { style: [styles.value, styles.completedStatus] },
            formStatus || 'Not completed'
          )
        ),
        React.createElement(
          View,
          { style: styles.field },
          React.createElement(
            Text,
            { style: styles.label },
            'Completed:'
          ),
          React.createElement(
            Text,
            { style: styles.value },
            completedAt ? formatDateInTimezone(completedAt, true) : 'Not completed'
          )
        )
      ),
      // Inspection Details Section
      React.createElement(
        View,
        { 
          style: styles.section
        },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          'Inspection Details'
        ),
        ...inspectionFields.map((field, idx) => {
          // Determine if value is long (needs smaller font)
          const isLongValue = field.value && String(field.value).length > 80;
          
          return React.createElement(
            View,
            { key: `field-${idx}`, style: styles.field },
            React.createElement(
              Text,
              { style: styles.label },
              `${field.label}:`
            ),
            React.createElement(
              Text,
              { style: isLongValue ? styles.valueLong : styles.value },
              field.value
            )
          );
        })
      ),
      // Additional Information Section
      React.createElement(
        View,
        { 
          style: styles.section
        },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          'Additional Information'
        ),
        React.createElement(
          Text,
          { style: styles.additionalInfoText },
          `This form was completed as part of the resale certificate process for ${propertyAddress}.`
        ),
        React.createElement(
          Text,
          { style: styles.additionalInfoText },
          'For questions or concerns, please contact GMG ResaleFlow at resales@gmgva.com'
        )
      ),
      // Professional Footer
      React.createElement(ProfessionalFooter, { 
        generatedDate: generatedDate || formatDateInTimezone(new Date(), true),
        timezone: userTimezone
      })
    )
  );
}

export { InspectionFormPdfDocument };

