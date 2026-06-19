// Extracted date utility functions for testing.
// Ref: #38 (checkMetadata), #39 (getVersionData) — date comparison/validation logic.

export function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return String(value);
}

export function isValidDate(value) {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export function safeToISOString(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
