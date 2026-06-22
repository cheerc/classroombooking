// Extracted utility functions for testing.
// Ref: JavaScript.html L902-908 — stringToHashCode (djb2 hash, pure, no deps)
// Ref: JavaScript.html L1108-1114 — hexToRgb (hex color → [r,g,b], pure)

/**
 * Converts a string to a numeric hash code using the djb2 algorithm.
 * @param {string} str - The input string to hash.
 * @returns {number} The computed hash code.
 */
export function stringToHashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

/**
 * Converts a hex color string to an RGB array.
 * @param {string} hex - The hex color string (e.g., '#FF0000').
 * @returns {number[]} An array of [r, g, b] values (0-255). Defaults to [255, 255, 255] if input is falsy.
 */
export function hexToRgb(hex) {
  if (!hex) return [255, 255, 255]; // Default to white if color is undefined
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

// Ref: JavaScript.html L858-861 — getShortUserName (email → username, pure)

/**
 * Extracts the username portion from an email address.
 * @param {string} email - The email address (e.g., 'user@example.com').
 * @returns {string} The part before '@', or the original input if falsy or missing '@'.
 */
export function getShortUserName(email) {
  if (!email || email.indexOf('@') === -1) return email;
  return email.split('@')[0];
}

// Ref: JavaScript.html L970-978 — formatTime (time string normalization)
// Production depends on AppConfig.TIME_REGEX; extracted version accepts regex as parameter.

/**
 * Normalizes a time string to HH:MM format.
 * @param {string} timeStr - The time string (e.g., '9:5').
 * @param {RegExp} timeRegex - Regex to validate time format (production: AppConfig.TIME_REGEX).
 * @returns {string} Normalized time string (e.g., '09:05'), or '00:00' if invalid/falsy.
 */
export function formatTime(timeStr, timeRegex) {
  if (!timeStr) return '00:00';
  timeStr = timeStr.trim();
  if (timeRegex.test(timeStr)) {
    const [hours, minutes] = timeStr.split(':');
    return hours.padStart(2, '0') + ':' + minutes.padStart(2, '0');
  }
  return '00:00';
}

// Ref: JavaScript.html L980-988 — formatTimestampForFilename (timestamp → YYYYMMDD_HHmm, pure)

/**
 * Formats a timestamp into a filename-safe string.
 * @param {string|number} timestamp - A value parseable by new Date() (e.g., ISO string or epoch ms).
 * @returns {string} Formatted string like '20260622_1830', or '' if timestamp is falsy.
 */
export function formatTimestampForFilename(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${HH}${mm}`;
}

