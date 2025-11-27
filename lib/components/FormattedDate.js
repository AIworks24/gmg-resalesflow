import { formatDate, formatDateTime, formatDateTimeFull } from '../timeUtils';

/**
 * Component to format dates consistently using server time and user timezone
 * 
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type: 'date', 'datetime', 'datetimeFull'
 * @param {string} className - Optional CSS class
 */
export const FormattedDate = ({ date, format = 'date', className = '' }) => {
  if (!date) return null;

  let formatted;
  switch (format) {
    case 'datetime':
      formatted = formatDateTime(date);
      break;
    case 'datetimeFull':
      formatted = formatDateTimeFull(date);
      break;
    case 'date':
    default:
      formatted = formatDate(date);
      break;
  }

  return <span className={className}>{formatted}</span>;
};

/**
 * Hook to format dates consistently
 * Use this when you need formatted date strings (not components)
 * 
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type: 'date', 'datetime', 'datetimeFull'
 * @returns {string} Formatted date string
 */
export const useFormattedDate = (date, format = 'date') => {
  if (!date) return '';

  switch (format) {
    case 'datetime':
      return formatDateTime(date);
    case 'datetimeFull':
      return formatDateTimeFull(date);
    case 'date':
    default:
      return formatDate(date);
  }
};






