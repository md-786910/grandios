/**
 * Sanitize name - removes replacement characters (?) caused by encoding issues
 * @param {string} name - The name to sanitize
 * @returns {string} Cleaned name
 */
export const sanitizeName = (name) => {
  if (!name) return "Unknown";
  return name
    .replace(/^\?+\s*/, '')  // Remove ? at start
    .replace(/\s*\?+$/, '')  // Remove ? at end
    .replace(/\?+/g, '')     // Remove remaining ?
    .trim() || "Unknown";
};

/**
 * Format currency in German/Euro format
 * @param {number} value - The value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format date in German format
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString('de-DE');
};
