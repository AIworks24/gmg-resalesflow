/**
 * Settlement PDF Document Component
 * Dedicated React PDF component that matches the exact layout of the example PDF
 */

import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { ProfessionalHeader } from './ProfessionalHeader';
import { ProfessionalFooter } from './ProfessionalFooter';

// Create styles matching the example PDF exactly
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'Helvetica',
    fontSize: 12,
    lineHeight: 1.4,
  },
  content: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  mainTitle: {
    color: '#166534',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 8,
    paddingBottom: 8,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 3,
    borderBottomColor: '#166534',
    borderBottomStyle: 'solid',
  },
  headerInfo: {
    backgroundColor: '#f9fafb',
    padding: '10 15',
    borderRadius: 5,
    marginTop: 10,
    marginBottom: 10,
  },
  headerInfoText: {
    marginBottom: 3,
    fontSize: 12,
  },
  section: {
    marginTop: 5,
    marginBottom: 5,
  },
  sectionTitle: {
    color: '#059669',
    fontSize: 15.6, // 1.3em
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 3,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#059669',
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
    color: '#374151',
    minWidth: 200,
    fontSize: 12,
  },
  value: {
    color: '#111827',
    fontSize: 12,
  },
  textareaField: {
    marginTop: 6,
    marginBottom: 6,
  },
  textareaLabel: {
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
    fontSize: 12,
  },
  textareaValue: {
    color: '#111827',
    whiteSpace: 'pre-wrap',
    fontSize: 12,
  },
});

function SettlementPdfDocument({ 
  documentType,
  propertyAddress,
  hoaName,
  generatedDate,
  logoBase64,
  sections = [],
  footerText
}) {
  return React.createElement(
    Document,
    { title: `${documentType} - ${propertyAddress}` },
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, wrap: true },
      // Professional Header
      React.createElement(ProfessionalHeader, { logoBase64 }),
      // Main Title (centered)
      React.createElement(
        View,
        { style: { alignItems: 'center', width: '100%' } },
        React.createElement(
          Text,
          { style: styles.mainTitle },
          documentType
        )
      ),
      // Content wrapper with padding
      React.createElement(
        View,
        { style: styles.content },
        // Header Info
        React.createElement(
          View,
          { style: styles.headerInfo },
          React.createElement(
            Text,
            { style: styles.headerInfoText },
            React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Property Address: '),
            propertyAddress
          ),
          React.createElement(
            Text,
            { style: styles.headerInfoText },
            React.createElement(Text, { style: { fontWeight: 'bold' } }, 'HOA: '),
            hoaName
          ),
          React.createElement(
            Text,
            { style: styles.headerInfoText },
            React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Generated: '),
            generatedDate
          )
        ),
        // Sections
        ...sections.map((section, sectionIdx) => 
          React.createElement(
            View,
            { 
              key: `section-${sectionIdx}`, 
              style: styles.section,
              wrap: false, // Prevent section from breaking across pages
              minPresenceAhead: Math.max(section.fields.length * 15, 50) // Reserve space to prevent breaking mid-section
            },
            React.createElement(
              Text,
              { style: styles.sectionTitle },
              section.title
            ),
            ...section.fields.map((field, fieldIdx) => {
              if (field.type === 'textarea') {
                return React.createElement(
                  View,
                  { key: `field-${sectionIdx}-${fieldIdx}`, style: styles.textareaField },
                  React.createElement(
                    Text,
                    { style: styles.textareaLabel },
                    `${field.label}:`
                  ),
                  React.createElement(
                    Text,
                    { style: styles.textareaValue },
                    field.value
                  )
                );
              }
              return React.createElement(
                View,
                { key: `field-${sectionIdx}-${fieldIdx}`, style: styles.field },
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
              );
            })
          )
        )
      ),
      // Professional Footer
      React.createElement(ProfessionalFooter, { generatedDate })
    )
  );
}

export { SettlementPdfDocument };

