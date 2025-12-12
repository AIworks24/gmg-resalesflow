/**
 * Professional Footer Component
 * Reusable footer for all PDF documents with company information
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

const footerStyles = StyleSheet.create({
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#166534',
    borderTopStyle: 'solid',
    color: '#6b7280',
    fontSize: 10.8,
    textAlign: 'center',
    marginLeft: 20,
    marginRight: 20,
  },
  footerText: {
    marginBottom: 3,
    fontSize: 10.8,
  },
});

function ProfessionalFooter({ generatedDate }) {
  return React.createElement(
    View,
    { style: footerStyles.footer },
    React.createElement(
      Text,
      { style: footerStyles.footerText },
      React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Goodman Management Group')
    ),
    React.createElement(
      Text,
      { style: footerStyles.footerText },
      `This document was generated on ${generatedDate || new Date().toLocaleString()}`
    ),
    React.createElement(
      Text,
      { style: footerStyles.footerText },
      'For questions or concerns, please contact GMG ResaleFlow at resales@gmgva.com or (804) 404-8012'
    )
  );
}

export { ProfessionalFooter, footerStyles };







