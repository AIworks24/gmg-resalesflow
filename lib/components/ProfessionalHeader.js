/**
 * Professional Header Component
 * Reusable header for all PDF documents with logo and company information
 */

import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const headerStyles = StyleSheet.create({
  companyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 10,
    marginLeft: 20,
    marginRight: 20,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 5,
    paddingRight: 5,
    borderBottomWidth: 2,
    borderBottomColor: '#0f4734',
    borderBottomStyle: 'solid',
  },
  logo: {
    maxWidth: 140,
    maxHeight: 55,
    marginRight: 8,
  },
  companyInfo: {
    textAlign: 'right',
    alignItems: 'flex-end',
    color: '#0f4734',
    fontSize: 9,
  },
  companyName: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
    color: '#0f4734',
  },
  companySubtext: {
    fontSize: 8.5,
    marginBottom: 1,
    color: '#374151',
  },
  contactInfo: {
    fontSize: 8.5,
    marginBottom: 1,
    color: '#111827',
  },
});

function ProfessionalHeader({ logoBase64 }) {
  return React.createElement(
    View,
    { style: headerStyles.companyHeader },
    logoBase64 && React.createElement(
      Image,
      { src: logoBase64, style: headerStyles.logo }
    ),
    React.createElement(
      View,
      { style: headerStyles.companyInfo },
      React.createElement(Text, { style: headerStyles.companyName }, 'Goodman Management Group'),
      React.createElement(Text, { style: headerStyles.companySubtext }, 'Professional HOA Management & Settlement Services'),
      React.createElement(Text, { style: headerStyles.contactInfo }, '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060'),
      React.createElement(Text, { style: headerStyles.contactInfo }, '(804) 404-8012'),
      React.createElement(Text, { style: headerStyles.contactInfo }, 'resales@gmgva.com')
    )
  );
}

export { ProfessionalHeader, headerStyles };

