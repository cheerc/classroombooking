import { escapeHtml } from '../lib/escapeHtml.js';
import { describe, it, expect } from 'vitest';

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("'world'")).toBe('&#39;world&#39;');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#39;world&#39;');
  });

  it('handles null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('handles undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles non-string input (number)', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns unchanged string when no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
