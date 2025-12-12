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
    marginTop: 10,
    marginBottom: 15,
    marginLeft: 20,
    marginRight: 20,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
    borderBottomWidth: 3,
    borderBottomColor: '#166534',
    borderBottomStyle: 'solid',
  },
  logo: {
    maxWidth: 200,
    maxHeight: 80,
    marginRight: 10,
  },
  companyInfo: {
    textAlign: 'right',
    alignItems: 'flex-end',
    color: '#166534',
    fontSize: 10.8, // 0.9em
  },
  companyName: {
    fontSize: 14.4, // 1.2em
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#166534',
  },
  companySubtext: {
    fontSize: 10.8,
    marginBottom: 2,
    color: '#374151',
  },
  contactInfo: {
    fontSize: 10.8,
    marginBottom: 2,
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
      React.createElement(Text, { style: headerStyles.contactInfo }, 'Phone: (804) 404-8012'),
      React.createElement(Text, { style: headerStyles.contactInfo }, 'Email: resales@gmgva.com')
    )
  );
}

export { ProfessionalHeader, headerStyles };

