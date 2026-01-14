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
    paddingTop: 6,
    paddingBottom: 6,
  },
  mainTitle: {
    color: '#0f4734',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 6,
    paddingBottom: 6,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  headerInfo: {
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 8,
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
    marginBottom: 3,
    fontSize: 10,
    color: '#374151',
  },
  headerInfoLabel: {
    fontWeight: 'bold',
    color: '#0f4734',
  },
  section: {
    marginTop: 8,
    marginBottom: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sectionTitle: {
    color: '#0f4734',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  fieldsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
    justifyContent: 'space-between',
    gap: 0,
  },
  field: {
    flexDirection: 'row',
    marginTop: 3,
    marginBottom: 3,
    width: '49%',
    paddingRight: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap', // Allow field to wrap if content is very long
  },
  fieldFullWidth: {
    flexDirection: 'column',
    marginTop: 4,
    marginBottom: 4,
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
    wordWrap: 'break-word', // Allow long values to wrap
    flexWrap: 'wrap', // Allow wrapping for very long content
  },
  valueLong: {
    color: '#111827',
    fontSize: 9,
    flex: 1,
    lineHeight: 1.4,
    wordWrap: 'break-word', // Allow long values to wrap
    flexWrap: 'wrap', // Allow wrapping for very long content
  },
  textareaField: {
    marginTop: 0,
    marginBottom: 0,
    width: '100%',
  },
  textareaLabel: {
    fontWeight: 'bold',
    color: '#0f4734',
    marginBottom: 4,
    fontSize: 10,
  },
  textareaValue: {
    color: '#111827',
    whiteSpace: 'pre-wrap',
    fontSize: 9,
    lineHeight: 1.5,
    paddingLeft: 4,
    wordWrap: 'break-word', // Allow long words to break
    maxWidth: '100%', // Ensure it doesn't overflow
  },
  feeTable: {
    marginTop: 4,
    marginBottom: 4,
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
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    width: '100%',
  },
  paymentSectionBox: {
    marginTop: 6,
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#0f4734',
  },
  overallTotalSeparator: {
    marginTop: 10,
    marginBottom: 6,
    borderTopWidth: 2,
    borderTopColor: '#0f4734',
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  paymentInstructions: {
    marginTop: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
  },
  paymentInstruction: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  paymentInstructionLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  paymentInstructionText: {
    fontSize: 10,
    color: '#111827',
    marginBottom: 8,
    lineHeight: 1.5,
  },
  paymentRecipient: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f4734',
    marginTop: 8,
    marginBottom: 4,
  },
  paymentAddress: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.5,
    marginTop: 4,
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
  requestorPhone = '',
  gmgAddress = '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060',
  associationAddress = '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060',
  gmgPaymentAmount = 0,
  associationPaymentAmount = 0,
  confirmationNumber = ''
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
        ...sections.map((section, sectionIdx) => {
          const isCommentsSection = section.title === 'Comments';
          const isFeesSection = section.title === 'Fees';
          
          // Calculate more accurate section height based on field types and content
          let estimatedSectionHeight = 50; // Base: title/padding
          
          section.fields.forEach(field => {
            if (field.type === 'textarea') {
              // Textarea fields can be very long - estimate based on content length
              const contentLength = (field.value || '').length;
              const estimatedLines = Math.max(1, Math.ceil(contentLength / 80)); // ~80 chars per line
              estimatedSectionHeight += (estimatedLines * 15) + 20; // 15px per line + 20px for label/padding
            } else if (field.type === 'fee' || field.type === 'total') {
              // Fee table rows are compact
              estimatedSectionHeight += 30;
            } else {
              // Regular fields
              const isLongValue = field.value && String(field.value).length > 80;
              estimatedSectionHeight += isLongValue ? 30 : 20; // More space for long values
            }
          });
          
          // Add extra space for Fees section (table + totals + payment instructions)
          if (isFeesSection) {
            estimatedSectionHeight += 150; // Extra space for table structure and payment boxes
          }
          
          // Calculate dynamic spacing based on number of fields
          const fieldCount = section.fields.length;
          const isShortSection = fieldCount <= 2; // Sections with 2 or fewer fields are "short"
          
          // Dynamic section spacing - less space for short sections
          const sectionStyle = {
            ...styles.section,
            marginTop: sectionIdx === 0 ? 8 : (isShortSection ? 6 : 8),
            marginBottom: isShortSection ? 4 : 6,
            paddingTop: isShortSection ? 2 : 4,
            paddingBottom: isShortSection ? 2 : 4,
          };
          
          return React.createElement(
            View,
            { 
              key: `section-${sectionIdx}`, 
              style: sectionStyle,
              wrap: false, // Prevent section from breaking across pages
              minPresenceAhead: estimatedSectionHeight // Reserve space - if not enough, move entire section to next page
            },
            // Hide section title for Comments section (redundant with field label)
            !isCommentsSection ? React.createElement(
              Text,
              { 
                style: {
                  ...styles.sectionTitle,
                  marginBottom: isShortSection ? 4 : 6, // Less space for short sections
                }
              },
              section.title
            ) : null,
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
                // Totals - show below table with payment instructions directly below each total
                totalFields.length > 0 ? React.createElement(
                  View,
                  { style: styles.totalAmountField },
                  ...totalFields.map((totalField, idx) => {
                    // Determine which payment instruction to show based on the total type
                    const isGMGTotal = totalField.payableTo === 'Goodman Management Group';
                    const isAssociationTotal = totalField.payableTo === 'Association';
                    const isOverallTotal = totalField.payableTo === 'Overall';
                    
                    // Only show payment instructions for GMG and Association totals, not Overall Total
                    const showPaymentInstruction = (isGMGTotal && gmgPaymentAmount > 0) || (isAssociationTotal && associationPaymentAmount > 0);
                    
                    // Add separator before Overall Total
                    const showSeparator = isOverallTotal && idx > 0;
                    
                    // For Overall Total, render it normally (not in a box)
                    if (isOverallTotal) {
                      return React.createElement(
                        View,
                        { 
                          key: `total-${idx}`,
                          style: showSeparator ? styles.overallTotalSeparator : { 
                            marginTop: idx > 0 ? 12 : 0
                          }
                        },
                        React.createElement(
                          View,
                          { 
                            style: { 
                              flexDirection: 'row', 
                              alignItems: 'center'
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
                      );
                    }
                    
                    // For GMG and Association totals, include the total inside the box
                    return React.createElement(
                      View,
                      { 
                        key: `total-${idx}`,
                        style: { 
                          marginTop: idx > 0 ? 12 : 0
                        }
                      },
                      // Payment instruction box with total inside
                      showPaymentInstruction ? React.createElement(
                        View,
                        { style: styles.paymentSectionBox },
                        // Total amount row (inside the box)
                        React.createElement(
                          View,
                          { 
                            style: { 
                              flexDirection: 'row', 
                              alignItems: 'center',
                              marginBottom: 8
                            }
                          },
                          React.createElement(
                            Text,
                            { style: { ...styles.label, minWidth: 150, fontWeight: 'bold', fontSize: 10 } },
                            `${totalField.label}:`
                          ),
                          React.createElement(
                            Text,
                            { style: { ...styles.value, fontWeight: 'bold', fontSize: 10, color: '#0f4734' } },
                            totalField.value
                          )
                        ),
                        // Small note
                        React.createElement(
                          Text,
                          { style: { ...styles.paymentInstructionText, fontSize: 9, color: '#6b7280', fontStyle: 'italic', marginBottom: 4 } },
                          'Pay the amount to the address below:'
                        ),
                        // Recipient name
                        React.createElement(
                          Text,
                          { style: { ...styles.paymentRecipient, fontSize: 10, marginBottom: 2 } },
                          isGMGTotal ? 'Goodman Management Group, Inc.' : (associationAddress || hoaName || 'Association')
                        ),
                        // Address (formatted)
                        React.createElement(
                          Text,
                          { style: { ...styles.paymentAddress, fontSize: 9, lineHeight: 1.4 } },
                          gmgAddress
                        )
                      ) : React.createElement(
                        // If no payment instruction, just show the total normally
                        View,
                        { 
                          style: { 
                            flexDirection: 'row', 
                            alignItems: 'center'
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
                    );
                  })
                ) : null
              );
            })() : (
              // Regular sections with two-column layout
              React.createElement(
                View,
                { style: styles.fieldsContainer },
                ...section.fields.map((field, fieldIdx) => {
                  // Determine if value is long (needs smaller font or full width)
                  const valueLength = (field.value || '').length;
                  const isLongValue = valueLength > 80;
                  const isVeryLongValue = valueLength > 150; // Very long values should be full width
                  const isEmptyValue = !field.value || String(field.value).trim() === '';
                  
                  // Textarea fields should always be full width
                  if (field.type === 'textarea') {
                    return React.createElement(
                      View,
                      { 
                        key: `field-${sectionIdx}-${fieldIdx}`, 
                        style: {
                          ...styles.fieldFullWidth,
                          marginTop: fieldIdx === 0 ? 0 : (isEmptyValue ? 2 : 4), // Less space for empty fields
                          marginBottom: isEmptyValue ? 2 : 4,
                        }
                      },
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
                          field.value || ''
                        )
                      )
                    );
                  }
                  
                  // Very long regular fields should be full width too
                  if (isVeryLongValue) {
                    return React.createElement(
                      View,
                      { 
                        key: `field-${sectionIdx}-${fieldIdx}`, 
                        style: {
                          ...styles.fieldFullWidth,
                          marginTop: fieldIdx === 0 ? 0 : 4,
                          marginBottom: 4,
                        }
                      },
                      React.createElement(
                        View,
                        { style: { flexDirection: 'row', alignItems: 'flex-start' } },
                        React.createElement(
                          Text,
                          { style: { ...styles.label, marginBottom: 4 } },
                          `${field.label}:`
                        )
                      ),
                      React.createElement(
                        Text,
                        { style: { ...styles.valueLong, marginTop: 4 } },
                        field.value || ''
                      )
                    );
                  }
                  
                  // Regular fields in two columns - reduce spacing for empty or short sections
                  return React.createElement(
                    View,
                    { 
                      key: `field-${sectionIdx}-${fieldIdx}`, 
                      style: {
                        ...styles.field,
                        marginTop: fieldIdx === 0 ? 0 : (isEmptyValue ? 1 : 3), // Less space for empty fields
                        marginBottom: isEmptyValue ? 1 : 3,
                      }
                    },
                    React.createElement(
                      Text,
                      { style: styles.label },
                      `${field.label}:`
                    ),
                    React.createElement(
                      Text,
                      { style: isLongValue ? styles.valueLong : styles.value },
                      field.value || ''
                    )
                  );
                })
              )
            )
          );
        })
      ),
      // Professional Footer
      React.createElement(ProfessionalFooter, { generatedDate })
    )
  );
}

export { SettlementPdfDocument };

