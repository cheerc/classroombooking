import { stringToHashCode, hexToRgb } from '../lib/utilityFunctions.js';
import { describe, it, expect } from 'vitest';

describe('stringToHashCode', () => {
  it('returns a deterministic hash for a known string', () => {
    const hash = stringToHashCode('hello');
    expect(typeof hash).toBe('number');
    // Same input must always produce same output
    expect(stringToHashCode('hello')).toBe(hash);
  });

  it('returns consistent results for the same input', () => {
    const input = 'test-string-123';
    expect(stringToHashCode(input)).toBe(stringToHashCode(input));
  });

  it('returns different hashes for different strings', () => {
    expect(stringToHashCode('abc')).not.toBe(stringToHashCode('xyz'));
  });

  it('handles empty string', () => {
    const hash = stringToHashCode('');
    expect(typeof hash).toBe('number');
    // djb2 with no iterations returns the initial seed
    expect(hash).toBe(5381);
  });
});

describe('hexToRgb', () => {
  it('converts #FF0000 (red) correctly', () => {
    expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
  });

  it('converts #00FF00 (green) correctly', () => {
    expect(hexToRgb('#00FF00')).toEqual([0, 255, 0]);
  });

  it('converts #0000FF (blue) correctly', () => {
    expect(hexToRgb('#0000FF')).toEqual([0, 0, 255]);
  });

  it('converts #FFFFFF (white) correctly', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
  });

  it('converts #000000 (black) correctly', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('returns default white [255, 255, 255] for null', () => {
    expect(hexToRgb(null)).toEqual([255, 255, 255]);
  });

  it('returns default white [255, 255, 255] for undefined', () => {
    expect(hexToRgb(undefined)).toEqual([255, 255, 255]);
  });
});
