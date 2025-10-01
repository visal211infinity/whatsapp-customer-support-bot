/**
 * Series configuration mapping
 * Maps series codes to Telegram group usernames
 */
export const seriesMapping = {
  AB001: "wbsd06",
  AB002: "dfhjuuu",
  AB003: "wbsd08",
  // Add more series mappings here
};

/**
 * Get Telegram group username from series code
 * @param {string} seriesCode - The series code (e.g., AB001)
 * @returns {string|null} - Telegram group username or null
 */
export function getTelegramGroup(seriesCode) {
  return seriesMapping[seriesCode.toUpperCase()] || null;
}

/**
 * Check if series code exists
 * @param {string} seriesCode - The series code
 * @returns {boolean}
 */
export function isValidSeries(seriesCode) {
  return seriesCode.toUpperCase() in seriesMapping;
}
