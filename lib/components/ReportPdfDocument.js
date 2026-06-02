/**
 * ReportPdfDocument — reusable branded PDF for all admin export reports
 * Props:
 *   title        {string}   e.g. "Revenue Report"
 *   subtitle     {string}   e.g. "Completed payments only"
 *   period       {string}   e.g. "January 1 – May 28, 2026"
 *   generatedAt  {string}   ISO date string (or empty → now)
 *   logoBase64   {string}   data:image/png;base64,...
 *   kpis         {Array}    [{ label, value, sub? }]
 *   sections     {Array}    [{ title, columns, rows, colorKey? }]
 *                  colorKey: fn(row) → 'red'|'orange'|'green'|'yellow'|null
 */

import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { ProfessionalFooter } from './ProfessionalFooter';

Font.registerHyphenationCallback((w) => [w]);

const BRAND = '#0f4734';
const BRAND_LIGHT = '#e8f4ef';
const ROW_ALT = '#f9fafb';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    backgroundColor: '#ffffff',
    paddingBottom: 20,
  },

  // ── header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginHorizontal: 24,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    borderBottomStyle: 'solid',
  },
  logo: { maxWidth: 130, maxHeight: 50 },
  companyInfo: { alignItems: 'flex-end' },
  companyName: { fontSize: 11, fontWeight: 'bold', color: BRAND, marginBottom: 2 },
  companyLine: { fontSize: 8, color: '#374151', marginBottom: 1 },

  // ── report title band ───────────────────────────────────────
  titleBand: {
    marginHorizontal: 24,
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  reportTitle: { fontSize: 16, fontWeight: 'bold', color: BRAND },
  reportSubtitle: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  periodBlock: { alignItems: 'flex-end' },
  periodText: { fontSize: 9, color: '#374151' },
  generatedText: { fontSize: 8, color: '#9ca3af', marginTop: 2 },

  // ── KPI strip ──────────────────────────────────────────────
  kpiStrip: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 12,
    gap: 8,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: BRAND_LIGHT,
    borderRadius: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
    borderLeftStyle: 'solid',
  },
  kpiLabel: { fontSize: 7.5, color: '#4b5563', marginBottom: 3, textTransform: 'uppercase' },
  kpiValue: { fontSize: 14, fontWeight: 'bold', color: BRAND },
  kpiSub: { fontSize: 7, color: '#6b7280', marginTop: 2 },

  // ── section ────────────────────────────────────────────────
  section: { marginHorizontal: 24, marginBottom: 14 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: BRAND,
    textTransform: 'uppercase',
    marginRight: 6,
  },
  sectionRule: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#d1fae5', borderBottomStyle: 'solid' },

  // ── table ──────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BRAND,
  },
  tableHeaderCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 5,
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  tableRow: { flexDirection: 'row' },
  tableRowAlt: { flexDirection: 'row', backgroundColor: ROW_ALT },
  tableCell: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 5,
    fontSize: 8,
    color: '#374151',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  // Color-coded cell text variants
  cellRed:    { color: '#dc2626' },
  cellOrange: { color: '#ea580c' },
  cellGreen:  { color: '#16a34a' },
  cellYellow: { color: '#ca8a04' },

  // ── badge pill (for status column) ─────────────────────────
  badgeRed:    { backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeOrange: { backgroundColor: '#ffedd5', color: '#ea580c', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeGreen:  { backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeYellow: { backgroundColor: '#fef9c3', color: '#ca8a04', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
});

// ── helpers ────────────────────────────────────────────────────────────────

function formatGeneratedAt(iso) {
  if (!iso) return new Date().toLocaleDateString('en-US');
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function cellStyle(color) {
  if (color === 'red')    return s.cellRed;
  if (color === 'orange') return s.cellOrange;
  if (color === 'green')  return s.cellGreen;
  if (color === 'yellow') return s.cellYellow;
  return null;
}

// ── sub-components ─────────────────────────────────────────────────────────

function Header({ logoBase64 }) {
  return React.createElement(
    View,
    { style: s.header },
    logoBase64
      ? React.createElement(Image, { src: logoBase64, style: s.logo })
      : React.createElement(View, { style: s.logo }),
    React.createElement(
      View,
      { style: s.companyInfo },
      React.createElement(Text, { style: s.companyName }, 'Goodman Management Group'),
      React.createElement(Text, { style: s.companyLine }, 'Professional HOA Management & Settlement Services'),
      React.createElement(Text, { style: s.companyLine }, '4101 Cox Rd., Suite 200-11, Glen Allen, VA 23060'),
      React.createElement(Text, { style: s.companyLine }, '(804) 404-8012  ·  resales@gmgva.com'),
    ),
  );
}

function TitleBand({ title, subtitle, period, generatedAt }) {
  return React.createElement(
    View,
    { style: s.titleBand },
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: s.reportTitle }, title),
      subtitle && React.createElement(Text, { style: s.reportSubtitle }, subtitle),
    ),
    React.createElement(
      View,
      { style: s.periodBlock },
      period && React.createElement(Text, { style: s.periodText }, `Period: ${period}`),
      React.createElement(Text, { style: s.generatedText }, `Generated: ${formatGeneratedAt(generatedAt)}`),
    ),
  );
}

function KpiStrip({ kpis }) {
  if (!kpis || kpis.length === 0) return null;
  return React.createElement(
    View,
    { style: s.kpiStrip },
    ...kpis.map((k, i) =>
      React.createElement(
        View,
        { key: i, style: s.kpiBox },
        React.createElement(Text, { style: s.kpiLabel }, k.label),
        React.createElement(Text, { style: s.kpiValue }, String(k.value ?? '—')),
        k.sub && React.createElement(Text, { style: s.kpiSub }, k.sub),
      ),
    ),
  );
}

function SectionTable({ section }) {
  const { title, columns, rows, colorKey } = section;
  return React.createElement(
    View,
    { style: s.section },
    React.createElement(
      View,
      { style: s.sectionTitleRow },
      React.createElement(Text, { style: s.sectionTitle }, title),
      React.createElement(View, { style: s.sectionRule }),
    ),
    // Header row
    React.createElement(
      View,
      { style: s.tableHeaderRow },
      ...columns.map((col, ci) =>
        React.createElement(
          Text,
          { key: ci, style: [s.tableHeaderCell, col.width ? { flex: col.width } : null] },
          col.label || col,
        ),
      ),
    ),
    // Data rows
    ...rows.map((row, ri) => {
      const color = colorKey ? colorKey(row) : null;
      const rowStyle = ri % 2 === 0 ? s.tableRow : s.tableRowAlt;
      const textExtra = cellStyle(color);
      return React.createElement(
        View,
        { key: ri, style: rowStyle },
        ...columns.map((col, ci) => {
          const key = col.key || col;
          const val = row[key] ?? '';
          return React.createElement(
            Text,
            {
              key: ci,
              style: [s.tableCell, col.width ? { flex: col.width } : null, ci === 0 && textExtra ? textExtra : null],
            },
            String(val),
          );
        }),
      );
    }),
  );
}

// ── main component ─────────────────────────────────────────────────────────

function ReportPdfDocument({ title, subtitle, period, generatedAt, logoBase64, kpis, sections }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: s.page },
      React.createElement(Header, { logoBase64 }),
      React.createElement(TitleBand, { title, subtitle, period, generatedAt }),
      React.createElement(KpiStrip, { kpis }),
      ...(sections || []).map((section, i) =>
        React.createElement(SectionTable, { key: i, section }),
      ),
      React.createElement(ProfessionalFooter, { generatedDate: generatedAt }),
    ),
  );
}

export { ReportPdfDocument };
