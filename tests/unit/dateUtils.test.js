import { normalizeTimestamp, isValidDate, safeToISOString } from '../lib/dateUtils.js';
import { describe, it, expect } from 'vitest';

describe('normalizeTimestamp', () => {
  it('normalizes Date object to ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normalizeTimestamp(d)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('normalizes ISO string to ISO string', () => {
    expect(normalizeTimestamp('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('both types produce equal output for same timestamp', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    const dateObj = new Date(iso);
    expect(normalizeTimestamp(iso)).toBe(normalizeTimestamp(dateObj));
  });

  it('handles non-string non-Date input', () => {
    expect(normalizeTimestamp(12345)).toBe('12345');
  });
});

describe('isValidDate', () => {
  it('returns false for empty string', () => {
    expect(isValidDate('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidDate(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidDate(undefined)).toBe(false);
  });

  it('returns false for garbage string', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  it('returns true for valid ISO string', () => {
    expect(isValidDate('2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('returns true for date-only string', () => {
    expect(isValidDate('2026-01-01')).toBe(true);
  });
});

describe('safeToISOString', () => {
  it('returns null for invalid date string', () => {
    expect(safeToISOString('bad')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(safeToISOString('')).toBe(null);
  });

  it('returns null for null', () => {
    expect(safeToISOString(null)).toBe(null);
  });

  it('returns null for undefined', () => {
    expect(safeToISOString(undefined)).toBe(null);
  });

  it('returns ISO string for valid date-only input', () => {
    expect(safeToISOString('2026-01-01')).toMatch(/^2026-01-01/);
  });

  it('returns ISO string for valid ISO input', () => {
    expect(safeToISOString('2026-06-01T12:00:00.000Z')).toBe('2026-06-01T12:00:00.000Z');
  });
});
