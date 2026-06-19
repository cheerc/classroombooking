// Extracted from Modals.js.html — pure escapeHtml utility for testing.
// Ref: #4 — Global HTML escape utility to prevent stored XSS via innerHTML interpolation.
// Escapes the 5 critical characters: & < > " '
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
