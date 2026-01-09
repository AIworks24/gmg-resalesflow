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
    fontSize: 11,
    lineHeight: 1.5,
  },
  content: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  mainTitle: {
    color: '#0f4734',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
    paddingBottom: 8,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  headerInfo: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#0f4734',
    flexDirection: 'row',
  },
  headerInfoLeft: {
    flex: 1,
  },
  headerInfoRight: {
    flex: 1,
    marginLeft: 20,
  },
  headerInfoText: {
    marginBottom: 4,
    fontSize: 10,
    color: '#374151',
  },
  headerInfoLabel: {
    fontWeight: 'bold',
    color: '#0f4734',
  },
  section: {
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#0f4734',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  fieldsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    justifyContent: 'space-between',
    gap: 0,
  },
  field: {
    flexDirection: 'row',
    marginTop: 5,
    marginBottom: 5,
    width: '49%',
    paddingRight: 12,
    alignItems: 'flex-start',
    minHeight: 16,
  },
  fieldFullWidth: {
    flexDirection: 'column',
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
  },
  label: {
    fontWeight: 'bold',
    color: '#0f4734',
    minWidth: 150,
    fontSize: 10,
    marginRight: 10,
    flexShrink: 0,
  },
  value: {
    color: '#111827',
    fontSize: 10,
    flex: 1,
    lineHeight: 1.4,
  },
  valueLong: {
    color: '#111827',
    fontSize: 9,
    flex: 1,
    lineHeight: 1.4,
  },
  textareaField: {
    marginTop: 0,
    marginBottom: 0,
    width: '100%',
  },
  textareaLabel: {
    fontWeight: 'bold',
    color: '#0f4734',
    marginBottom: 6,
    fontSize: 10,
  },
  textareaValue: {
    color: '#111827',
    whiteSpace: 'pre-wrap',
    fontSize: 9,
    lineHeight: 1.5,
    paddingLeft: 4,
  },
  feeTable: {
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#0f4734',
    borderRadius: 4,
    overflow: 'hidden',
  },
  feeTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f4734',
    padding: 8,
  },
  feeTableHeaderText: {
    fontWeight: 'bold',
    color: '#ffffff',
    fontSize: 10,
  },
  feeTableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  feeTableRowLast: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 0,
    backgroundColor: '#ffffff',
  },
  feeTableCell: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.4,
  },
  feeTableName: {
    width: '40%',
    paddingRight: 8,
  },
  feeTableAmount: {
    width: '25%',
    paddingRight: 8,
    textAlign: 'right',
  },
  feeTablePayTo: {
    width: '35%',
  },
  totalAmountField: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    width: '100%',
  },
});

function SettlementPdfDocument({ 
  documentType,
  propertyAddress,
  hoaName,
  generatedDate,
  logoBase64,
  sections = [],
  footerText,
  requestorName = '',
  requestorCompany = '',
  requestorPhone = ''
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
          // Left side - Property Info
          React.createElement(
            View,
            { style: styles.headerInfoLeft },
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'Property Address: '),
              propertyAddress
            ),
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'HOA: '),
              hoaName
            ),
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'Generated: '),
              generatedDate
            )
          ),
          // Right side - Requester Info
          React.createElement(
            View,
            { style: styles.headerInfoRight },
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'Requestor Name: '),
              requestorName || '—'
            ),
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'Requestor Company: '),
              requestorCompany || '—'
            ),
            React.createElement(
              Text,
              { style: styles.headerInfoText },
              React.createElement(Text, { style: styles.headerInfoLabel }, 'Requestor Phone: '),
              requestorPhone || '—'
            )
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
            // Special handling for Fees section - render as table
            section.title === 'Fees' && section.fields.length > 0 ? (() => {
              // Separate fee fields from totals
              const feeFields = section.fields.filter(f => f.type === 'fee');
              const totalFields = section.fields.filter(f => f.type === 'total');
              
              return React.createElement(
                View,
                { style: styles.fieldFullWidth },
                // Fee Table
                feeFields.length > 0 ? React.createElement(
                  View,
                  { style: styles.feeTable },
                  // Table Header
                  React.createElement(
                    View,
                    { style: styles.feeTableHeader },
                    React.createElement(
                      View,
                      { style: styles.feeTableName },
                      React.createElement(Text, { style: styles.feeTableHeaderText }, 'Name')
                    ),
                    React.createElement(
                      View,
                      { style: styles.feeTableAmount },
                      React.createElement(Text, { style: styles.feeTableHeaderText }, 'Amount')
                    ),
                    React.createElement(
                      View,
                      { style: styles.feeTablePayTo },
                      React.createElement(Text, { style: styles.feeTableHeaderText }, 'Pay To')
                    )
                  ),
                  // Table Rows
                  ...feeFields.map((field, fieldIdx) => 
                    React.createElement(
                      View,
                      { 
                        key: `fee-row-${fieldIdx}`, 
                        style: fieldIdx === feeFields.length - 1 ? styles.feeTableRowLast : styles.feeTableRow 
                      },
                      React.createElement(
                        View,
                        { style: styles.feeTableName },
                        React.createElement(Text, { style: styles.feeTableCell }, field.label || '—')
                      ),
                      React.createElement(
                        View,
                        { style: styles.feeTableAmount },
                        React.createElement(Text, { style: styles.feeTableCell }, field.value || '—')
                      ),
                      React.createElement(
                        View,
                        { style: styles.feeTablePayTo },
                        React.createElement(Text, { style: styles.feeTableCell }, field.payableTo || '—')
                      )
                    )
                  )
                ) : null,
                // Totals - show below table
                totalFields.length > 0 ? React.createElement(
                  View,
                  { style: styles.totalAmountField },
                  ...totalFields.map((totalField, idx) => 
                    React.createElement(
                      View,
                      { 
                        key: `total-${idx}`,
                        style: { 
                          flexDirection: 'row', 
                          alignItems: 'center',
                          marginTop: idx > 0 ? 8 : 0
                        }
                      },
                      React.createElement(
                        Text,
                        { style: { ...styles.label, minWidth: 150, fontWeight: 'bold' } },
                        `${totalField.label}:`
                      ),
                      React.createElement(
                        Text,
                        { style: { ...styles.value, fontWeight: 'bold', fontSize: 11, color: '#0f4734' } },
                        totalField.value
                      )
                    )
                  )
                ) : null
              );
            })() : (
              // Regular sections with two-column layout
              React.createElement(
                View,
                { style: styles.fieldsContainer },
                ...section.fields.map((field, fieldIdx) => {
                  // Determine if value is long (needs smaller font)
                  const isLongValue = field.value && String(field.value).length > 80;
                  
                  // Textarea fields should be full width
                  if (field.type === 'textarea') {
                    return React.createElement(
                      View,
                      { key: `field-${sectionIdx}-${fieldIdx}`, style: styles.fieldFullWidth },
                      React.createElement(
                        View,
                        { style: styles.textareaField },
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
                      )
                    );
                  }
                  // Regular fields in two columns
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
                      { style: isLongValue ? styles.valueLong : styles.value },
                      field.value
                    )
                  );
                })
              )
            )
          )
        )
      ),
      // Professional Footer
      React.createElement(ProfessionalFooter, { generatedDate })
    )
  );
}

export { SettlementPdfDocument };

