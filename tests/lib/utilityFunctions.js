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
