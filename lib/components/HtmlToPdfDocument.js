/**
 * HTML to PDF Document Component
 * Converts HTML strings to react-pdf/renderer components
 * 
 * Uses htmlparser2 to properly parse HTML and convert to react-pdf components
 */

import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { parseDocument } from 'htmlparser2';
import { getElementsByTagName, getText } from 'domutils';

/**
 * Map CSS font families to react-pdf built-in fonts
 * react-pdf supports: Helvetica, Times-Roman, Courier, Symbol, ZapfDingbats
 */
function mapFontFamily(fontFamily) {
  if (!fontFamily) return 'Helvetica';
  
  const font = fontFamily.toLowerCase().split(',')[0].trim();
  
  // Map common fonts to react-pdf built-in fonts
  if (font.includes('arial') || font.includes('sans-serif') || font.includes('helvetica')) {
    return 'Helvetica';
  }
  if (font.includes('times') || font.includes('serif')) {
    return 'Times-Roman';
  }
  if (font.includes('courier') || font.includes('monospace')) {
    return 'Courier';
  }
  
  // Default to Helvetica
  return 'Helvetica';
}

/**
 * Convert CSS string to react-pdf style object
 */
function parseCssToStyle(cssText) {
  const styles = {};
  if (!cssText) return styles;
  
  // Remove comments
  cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Parse CSS rules
  const rules = cssText.match(/([^{]+)\{([^}]+)\}/g) || [];
  
  rules.forEach(rule => {
    const match = rule.match(/([^{]+)\{([^}]+)\}/);
    if (match) {
      const selector = match[1].trim().replace(/^\./, '').replace(/\s+/g, '');
      const properties = match[2].trim();
      
      const styleObj = {};
      properties.split(';').forEach(prop => {
        const [key, value] = prop.split(':').map(s => s.trim());
        if (key && value) {
          // Convert CSS property to camelCase
          const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          
          // Convert CSS values
          if (key === 'font-family' || key === 'fontFamily') {
            // Map font families to react-pdf built-in fonts
            styleObj.fontFamily = mapFontFamily(value);
          } else if (key === 'display' && value === 'flex') {
            styleObj.display = 'flex';
            // Note: react-pdf doesn't support flexbox the same way, but we'll handle it in element conversion
          } else if (key === 'justify-content' || camelKey === 'justifyContent') {
            styleObj.justifyContent = value; // space-between, flex-start, flex-end, center
          } else if (key === 'align-items' || camelKey === 'alignItems') {
            styleObj.alignItems = value; // center, flex-start, flex-end, stretch
          } else if (key === 'text-align' || camelKey === 'textAlign') {
            styleObj.textAlign = value; // left, right, center, justify
          } else if (key === 'border-bottom' || camelKey === 'borderBottom') {
            // Parse border-bottom: 3px solid #166534
            const borderMatch = value.match(/(\d+)px\s+(solid|dashed|dotted)\s+(#[0-9a-fA-F]+|\w+)/);
            if (borderMatch) {
              styleObj.borderBottomWidth = parseFloat(borderMatch[1]);
              styleObj.borderBottomColor = borderMatch[3];
              styleObj.borderBottomStyle = borderMatch[2];
            }
          } else if (key === 'border-top' || camelKey === 'borderTop') {
            const borderMatch = value.match(/(\d+)px\s+(solid|dashed|dotted)\s+(#[0-9a-fA-F]+|\w+)/);
            if (borderMatch) {
              styleObj.borderTopWidth = parseFloat(borderMatch[1]);
              styleObj.borderTopColor = borderMatch[3];
              styleObj.borderTopStyle = borderMatch[2];
            }
          } else if (key === 'background-color' || camelKey === 'backgroundColor') {
            styleObj.backgroundColor = value;
          } else if (key === 'border-radius' || camelKey === 'borderRadius') {
            // react-pdf doesn't support border-radius, but we can approximate with padding
            const radius = parseFloat(value);
            if (radius) {
              styleObj.borderRadius = radius;
            }
          } else if (value.includes('px')) {
            styleObj[camelKey] = parseFloat(value);
          } else if (value.includes('em') || value.includes('rem')) {
            styleObj[camelKey] = parseFloat(value) * 12;
          } else if (value.includes('%')) {
            styleObj[camelKey] = value;
          } else if (value.startsWith('#')) {
            styleObj[camelKey] = value;
          } else if (value === 'bold') {
            styleObj.fontWeight = 'bold';
          } else if (value === 'italic') {
            styleObj.fontStyle = 'italic';
          } else {
            styleObj[camelKey] = value;
          }
        }
      });
      
      if (Object.keys(styleObj).length > 0) {
        styles[selector] = styleObj;
      }
    }
  });
  
  return styles;
}

/**
 * Convert HTML element to react-pdf component
 */
function elementToReactPdf(element, styles = {}, key = 0) {
  if (!element) return null;
  
  const tagName = element.name;
  const attributes = element.attribs || {};
  const className = attributes.class || '';
  const styleAttr = attributes.style || '';
  
  // Get computed styles
  let computedStyle = {
    ...(styles[className] || {}),
    ...(styles[tagName] || {}),
    ...parseInlineStyle(styleAttr)
  };
  
  // Map font family if present
  if (computedStyle.fontFamily) {
    computedStyle = {
      ...computedStyle,
      fontFamily: mapFontFamily(computedStyle.fontFamily)
    };
  }
  
  // Handle text nodes
  if (element.type === 'text') {
    const text = element.data.trim();
    return text ? React.createElement(Text, { key }, text) : null;
  }
  
  // Handle different HTML elements
  switch (tagName) {
    case 'div':
    case 'section':
    case 'header':
    case 'footer':
      const divChildren = (element.children || [])
        .map((child, idx) => elementToReactPdf(child, styles, `${key}-${idx}`))
        .filter(Boolean);
      
      // Handle flexbox layouts - react-pdf uses flexDirection, justifyContent, alignItems
      let flexStyle = { ...computedStyle };
      if (computedStyle.display === 'flex' || className.includes('company-header')) {
        flexStyle.flexDirection = computedStyle.flexDirection || 'row';
        if (computedStyle.justifyContent) {
          flexStyle.justifyContent = computedStyle.justifyContent;
        } else if (className.includes('justify-between') || className.includes('space-between') || className.includes('company-header')) {
          flexStyle.justifyContent = 'space-between';
        }
        if (computedStyle.alignItems) {
          flexStyle.alignItems = computedStyle.alignItems;
        } else if (className.includes('align-center') || className.includes('items-center') || className.includes('company-header')) {
          flexStyle.alignItems = 'center';
        }
        // Remove display as react-pdf uses flexDirection directly
        delete flexStyle.display;
      }
      
      // Handle field class - labels and values should be on same line
      if (className.includes('field') && !className.includes('textarea-field')) {
        // Field with label and value spans - render as flex row
        const fieldStyle = {
          ...flexStyle,
          flexDirection: 'row',
          marginBottom: Math.min(flexStyle.marginBottom || 4, 6),
          marginTop: Math.min(flexStyle.marginTop || 0, 4),
          flexWrap: 'wrap'
        };
        return React.createElement(
          View,
          { key, style: fieldStyle },
          ...divChildren
        );
      }
      
      // Handle section class - reduce margins to prevent large gaps
      if (className.includes('section')) {
        const sectionStyle = {
          ...flexStyle,
          marginTop: Math.min(flexStyle.marginTop || 5, 8),
          marginBottom: Math.min(flexStyle.marginBottom || 5, 8),
          // Remove any excessive margins
          marginLeft: 0,
          marginRight: 0
        };
        return React.createElement(
          View,
          { key, style: sectionStyle },
          ...divChildren
        );
      }
      
      // Handle section-title class - minimal margins
      if (className.includes('section-title')) {
        const titleStyle = {
          ...flexStyle,
          marginTop: Math.min(flexStyle.marginTop || 8, 10),
          marginBottom: Math.min(flexStyle.marginBottom || 3, 5),
          marginLeft: 0,
          marginRight: 0
        };
        return React.createElement(
          View,
          { key, style: titleStyle },
          ...divChildren
        );
      }
      
      return React.createElement(
        View,
        { key, style: flexStyle },
        ...divChildren
      );
    
    case 'p':
      // Paragraphs can contain text and inline elements
      const pChildren = (element.children || [])
        .map((child, idx) => elementToReactPdf(child, styles, `${key}-${idx}`))
        .filter(Boolean);
      const pStyle = {
        ...computedStyle,
        marginBottom: computedStyle.marginBottom || 8
      };
      // Render as Text if all children are text/inline, otherwise View
      return React.createElement(
        Text,
        { key, style: pStyle },
        ...pChildren
      );
    
    case 'span':
    case 'strong':
    case 'em':
    case 'b':
    case 'i':
      const textChildren = (element.children || [])
        .map((child, idx) => elementToReactPdf(child, styles, `${key}-${idx}`))
        .filter(Boolean);
      const textStyle = {
        ...computedStyle,
        ...(tagName === 'strong' || tagName === 'b' ? { fontWeight: 'bold' } : {}),
        ...(tagName === 'em' || tagName === 'i' ? { fontStyle: 'italic' } : {})
      };
      return React.createElement(
        Text,
        { key, style: textStyle },
        ...textChildren
      );
    
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      const headingChildren = (element.children || [])
        .map((child, idx) => elementToReactPdf(child, styles, `${key}-${idx}`))
        .filter(Boolean);
      const headingStyle = {
        ...computedStyle,
        fontSize: tagName === 'h1' ? 24 : tagName === 'h2' ? 20 : tagName === 'h3' ? 18 : 16,
        fontWeight: 'bold',
        marginBottom: Math.min(computedStyle.marginBottom || 8, 10),
        marginTop: Math.min(computedStyle.marginTop || 15, 20)
      };
      return React.createElement(
        Text,
        { key, style: headingStyle },
        ...headingChildren
      );
    
    case 'img':
      const src = attributes.src || '';
      if (src.startsWith('data:image')) {
        // Use the full data URI - react-pdf should handle it
        return React.createElement(
          Image,
          {
            key,
            src: src, // Use full data URI
            style: {
              maxWidth: computedStyle.maxWidth || 200,
              maxHeight: computedStyle.maxHeight || 80,
              width: computedStyle.width,
              height: computedStyle.height,
              marginBottom: computedStyle.marginBottom || 0,
              marginRight: computedStyle.marginRight || 10,
            }
          }
        );
      }
      return null;
    
    case 'br':
      return React.createElement(Text, { key }, '\n');
    
    case 'ul':
    case 'ol':
      const listChildren = (element.children || [])
        .filter(child => child.name === 'li')
        .map((child, idx) => {
          const liChildren = (child.children || [])
            .map((c, cIdx) => elementToReactPdf(c, styles, `${key}-${idx}-${cIdx}`))
            .filter(Boolean);
          const prefix = tagName === 'ul' ? '• ' : `${idx + 1}. `;
          return React.createElement(
            Text,
            { key: `${key}-li-${idx}`, style: { marginBottom: 5 } },
            prefix,
            ...liChildren
          );
        });
      return React.createElement(
        View,
        { key, style: { marginLeft: 20, ...computedStyle } },
        ...listChildren
      );
    
    case 'li':
      // Handled in ul/ol
      return null;
    
    default:
      // For unknown tags, try to render children
      const defaultChildren = (element.children || [])
        .map((child, idx) => elementToReactPdf(child, styles, `${key}-${idx}`))
        .filter(Boolean);
      return defaultChildren.length > 0
        ? React.createElement(View, { key }, ...defaultChildren)
        : null;
  }
}

/**
 * Parse inline style attribute
 */
function parseInlineStyle(styleText) {
  const styles = {};
  if (!styleText) return styles;
  
  styleText.split(';').forEach(prop => {
    const [key, value] = prop.split(':').map(s => s.trim());
    if (key && value) {
      const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      if (key === 'font-family' || camelKey === 'fontFamily') {
        styles.fontFamily = mapFontFamily(value);
      } else if (key === 'text-align' || camelKey === 'textAlign') {
        styles.textAlign = value;
      } else if (key === 'background-color' || camelKey === 'backgroundColor') {
        styles.backgroundColor = value;
      } else if (key === 'border-bottom' || camelKey === 'borderBottom') {
        const borderMatch = value.match(/(\d+)px\s+(solid|dashed|dotted)\s+(#[0-9a-fA-F]+|\w+)/);
        if (borderMatch) {
          styles.borderBottomWidth = parseFloat(borderMatch[1]);
          styles.borderBottomColor = borderMatch[3];
          styles.borderBottomStyle = borderMatch[2];
        }
      } else if (value.includes('px')) {
        styles[camelKey] = parseFloat(value);
      } else if (value.startsWith('#')) {
        styles[camelKey] = value;
      } else {
        styles[camelKey] = value;
      }
    }
  });
  
  return styles;
}

/**
 * Main HTML to PDF Document Component
 */
function HtmlToPdfDocument({ htmlContent, options = {} }) {
  // Parse HTML
  const dom = parseDocument(htmlContent);
  
  // Extract title
  const titleElements = getElementsByTagName('title', dom);
  const title = titleElements.length > 0 ? getText(titleElements[0]) : 'Document';
  
  // Extract styles
  const styleElements = getElementsByTagName('style', dom);
  let cssStyles = {};
  styleElements.forEach(styleEl => {
    const styleText = getText(styleEl);
    const parsed = parseCssToStyle(styleText);
    cssStyles = { ...cssStyles, ...parsed };
  });
  
  // Extract body
  const bodyElements = getElementsByTagName('body', dom);
  const bodyElement = bodyElements.length > 0 ? bodyElements[0] : dom;
  
  // Map font families in CSS styles to react-pdf built-in fonts
  const mappedStyles = {};
  Object.keys(cssStyles).forEach(key => {
    const style = cssStyles[key];
    mappedStyles[key] = { ...style };
    if (style.fontFamily) {
      mappedStyles[key].fontFamily = mapFontFamily(style.fontFamily);
    }
  });
  
  // Create react-pdf stylesheet
  // Use body margin from CSS, but reduce it to match example PDF better
  const bodyMargin = mappedStyles.body?.margin ? parseFloat(String(mappedStyles.body.margin).replace('px', '')) : 20;
  // Reduce padding to create tighter layout matching example PDF
  const pagePadding = Math.min(bodyMargin || 20, 20); // Cap at 20px but prefer smaller
  
  const pdfStyles = StyleSheet.create({
    page: {
      padding: pagePadding,
      fontFamily: 'Helvetica',
      fontSize: 12,
      lineHeight: 1.6,
      // Don't apply body margin to page, use padding instead
      ...(mappedStyles.page || {})
    },
    ...mappedStyles
  });
  
  // Convert body to react-pdf elements
  const bodyChildren = (bodyElement.children || [])
    .map((child, idx) => elementToReactPdf(child, mappedStyles, `body-${idx}`))
    .filter(Boolean);
  
  return React.createElement(
    Document,
    { title },
    React.createElement(
      Page,
      {
        size: options.format || 'LETTER',
        style: pdfStyles.page
      },
      ...bodyChildren
    )
  );
}

export { HtmlToPdfDocument };
