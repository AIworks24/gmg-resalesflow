/**
 * Property Inspection Form PDF Document Component
 * Matches the exact layout of property_inspection_form_sample.pdf
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ProfessionalHeader } from './ProfessionalHeader';

// Create styles matching the sample PDF exactly
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'Helvetica',
    fontSize: 12,
    lineHeight: 1.4,
  },
  mainTitle: {
    color: '#166534',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 10,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#166534',
    borderBottomStyle: 'solid',
  },
  dateInfo: {
    marginBottom: 15,
    marginLeft: 20,
    marginRight: 20,
    fontSize: 12,
    color: '#6b7280',
  },
  dateInfoLine: {
    marginBottom: 5,
    fontSize: 12,
  },
  section: {
    backgroundColor: '#f9fafb',
    padding: 15,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 20,
    marginRight: 20,
    borderRadius: 5,
  },
  sectionTitle: {
    color: '#059669',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 0,
  },
  field: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  label: {
    fontWeight: 'bold',
    color: '#374151',
    minWidth: 150,
    fontSize: 12,
  },
  value: {
    color: '#111827',
    fontSize: 12,
  },
  completedStatus: {
    color: '#059669',
    fontWeight: 'bold',
  },
  additionalInfo: {
    marginTop: 20,
    fontSize: 12,
    color: '#111827',
  },
  additionalInfoText: {
    marginBottom: 5,
    fontSize: 12,
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
}) {
  // Format form data fields
  const inspectionFields = Object.entries(formData)
    .filter(([key]) => {
      // Filter out internal fields
      const internalFields = ['status', 'association', 'completedAt', 'completedBy'];
      return !internalFields.includes(key);
    })
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim(),
      value: value !== null && value !== undefined ? String(value) : 'Not provided'
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
          `Generated on: ${new Date().toLocaleDateString()}`
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
            completedAt ? new Date(completedAt).toLocaleString() : 'Not completed'
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
        ...inspectionFields.map((field, idx) =>
          React.createElement(
            View,
            { key: `field-${idx}`, style: styles.field },
            React.createElement(
              Text,
              { style: styles.label },
              `${field.label}:`
            ),
            React.createElement(
              Text,
              { style: styles.value },
              field.value
            )
          )
        )
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
      )
    )
  );
}

export { InspectionFormPdfDocument };

