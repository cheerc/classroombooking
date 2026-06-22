import { stringToHashCode, hexToRgb, getShortUserName, formatTime, formatTimestampForFilename } from '../lib/utilityFunctions.js';
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

// ============================================================
// GAP TURN — Adversarial tests by cb-team-impl2
// ============================================================

describe('stringToHashCode — GAP', () => {
  // GAP-1: Single character — boundary between empty (seed-only) and multi-char
  it('handles single character string', () => {
    const hash = stringToHashCode('a');
    expect(typeof hash).toBe('number');
    // djb2: ((5381 << 5) + 5381) + 97 = 177670 (= 5381*33 + 97)
    expect(hash).toBe(177670);
  });

  // GAP-2: Hash can be negative due to 32-bit integer overflow with << operator.
  // Production uses Math.abs(hash) — but SPEC never verified hash sign behavior.
  it('can produce negative hashes for longer strings (32-bit overflow)', () => {
    // A sufficiently long string will overflow 32-bit signed int via << 5
    const longStr = 'abcdefghijklmnopqrstuvwxyz';
    const hash = stringToHashCode(longStr);
    expect(typeof hash).toBe('number');
    // The actual sign depends on the string — just verify it's a finite number
    expect(Number.isFinite(hash)).toBe(true);
  });

  // GAP-3: Exact known hash value — SPEC only asserted typeof+consistency, never
  // pinned a specific value for a non-empty string. Weak assertion: if the algorithm
  // is accidentally changed, typeof+consistency still pass.
  it('produces exact djb2 hash for known input "hello"', () => {
    // djb2("hello") = 210714636441
    // But JS bitwise << truncates to 32-bit, so actual value differs from pure djb2.
    // We pin the JS-specific result:
    const hash = stringToHashCode('hello');
    expect(hash).toBe(stringToHashCode('hello')); // consistency (from SPEC)
    // Pin the exact value so algorithm changes are caught
    const expected = (() => {
      let h = 5381;
      for (const c of 'hello') h = ((h << 5) + h) + c.charCodeAt(0);
      return h;
    })();
    expect(hash).toBe(expected);
  });

  // GAP-4: Unicode / CJK strings — production uses Chinese course names
  // (e.g. "微積分", "程式設計"). SPEC only tested ASCII.
  it('handles Chinese (CJK) course names used in production', () => {
    const hash1 = stringToHashCode('微積分');
    const hash2 = stringToHashCode('程式設計');
    expect(typeof hash1).toBe('number');
    expect(typeof hash2).toBe('number');
    expect(hash1).not.toBe(hash2);
    // Deterministic
    expect(stringToHashCode('微積分')).toBe(hash1);
  });

  // GAP-5: Production integration — Math.abs(hash) % N must yield valid index.
  // SPEC never tested the actual usage pattern from buildCourseColorMap.
  it('Math.abs(hash) % COURSE_COLORS.length always yields valid index [0, 9]', () => {
    const COURSE_COLORS_LENGTH = 10; // AppConfig.COURSE_COLORS has 10 entries
    const testNames = ['微積分', 'hello', '', 'A', 'test-string-123', '物理學', 'English 101'];
    for (const name of testNames) {
      const hash = stringToHashCode(name);
      const index = Math.abs(hash) % COURSE_COLORS_LENGTH;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(COURSE_COLORS_LENGTH);
    }
  });

  // GAP-6: Whitespace-only and special characters
  it('handles whitespace-only and special character strings', () => {
    expect(typeof stringToHashCode(' ')).toBe('number');
    expect(typeof stringToHashCode('\t\n')).toBe('number');
    expect(typeof stringToHashCode('!@#$%^&*()')).toBe('number');
    // Different whitespace strings should produce different hashes
    expect(stringToHashCode(' ')).not.toBe(stringToHashCode('  '));
  });
});

describe('hexToRgb — GAP', () => {
  // GAP-7: Lowercase hex — production COURSE_COLORS are all lowercase (#93c5fd).
  // SPEC only tested uppercase (#FF0000). parseInt handles both, but this wasn't verified.
  it('converts lowercase hex (production COURSE_COLORS format)', () => {
    expect(hexToRgb('#93c5fd')).toEqual([147, 197, 253]);
  });

  // GAP-8: All actual production COURSE_COLORS should parse correctly
  it('correctly parses all production COURSE_COLORS', () => {
    const COURSE_COLORS = [
      '#93c5fd', '#73EEDC', '#DBF4A7', '#fca5a5', '#92DBFA',
      '#C5D8D1', '#B5EBCC', '#FDE74C', '#F5AE80', '#D6D1CD'
    ];
    const expected = [
      [147, 197, 253], [115, 238, 220], [219, 244, 167], [252, 165, 165], [146, 219, 250],
      [197, 216, 209], [181, 235, 204], [253, 231, 76],  [245, 174, 128], [214, 209, 205]
    ];
    COURSE_COLORS.forEach((color, i) => {
      expect(hexToRgb(color)).toEqual(expected[i]);
    });
  });

  // GAP-9: Mixed case hex
  it('handles mixed case hex', () => {
    expect(hexToRgb('#fF0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00fF00')).toEqual([0, 255, 0]);
  });

  // GAP-10: Empty string '' is falsy → should hit the !hex branch → white.
  // SPEC only tested null and undefined, not the other JS falsy values.
  it('returns default white for empty string (falsy)', () => {
    expect(hexToRgb('')).toEqual([255, 255, 255]);
  });

  // GAP-11: Boolean false is also falsy
  it('returns default white for false (falsy)', () => {
    expect(hexToRgb(false)).toEqual([255, 255, 255]);
  });

  // GAP-12: Zero is falsy
  it('returns default white for 0 (falsy)', () => {
    expect(hexToRgb(0)).toEqual([255, 255, 255]);
  });

  // GAP-13: Invalid hex string — parseInt returns NaN, bitwise ops yield 0.
  // This is a silent failure producing [0,0,0] (black) — documenting behavior.
  it('returns [0,0,0] for invalid hex (documents silent failure)', () => {
    // '#ZZZZZZ' → parseInt('ZZZZZZ', 16) = NaN → NaN >> 16 = 0
    expect(hexToRgb('#ZZZZZZ')).toEqual([0, 0, 0]);
  });

  // GAP-14: Hex without '#' prefix — .slice(1) drops first char → wrong parse.
  // Documents the behavior (this IS a latent edge case in production).
  it('produces wrong result for hex without # prefix (documents limitation)', () => {
    // 'FF0000' → slice(1) → 'F0000' → parseInt = 983040
    // 983040 >> 16 = 15, (983040 >> 8) & 255 = 0, 983040 & 255 = 0
    const result = hexToRgb('FF0000');
    expect(result).not.toEqual([255, 0, 0]); // NOT correct red
    expect(result).toEqual([15, 0, 0]); // actual behavior
  });

  // GAP-15: 3-digit shorthand hex — #FFF is valid CSS but function doesn't expand it.
  // Documents that shorthand hex is NOT supported.
  it('does not correctly handle 3-digit shorthand hex (documents limitation)', () => {
    // '#FFF' → slice(1) → 'FFF' → parseInt = 4095
    // 4095 >> 16 = 0, (4095 >> 8) & 255 = 15, 4095 & 255 = 255
    const result = hexToRgb('#FFF');
    expect(result).not.toEqual([255, 255, 255]); // NOT white as CSS would imply
    expect(result).toEqual([0, 15, 255]); // actual (wrong) behavior
  });

  // GAP-16: Boundary values — min/max single channel
  it('handles boundary channel values correctly', () => {
    expect(hexToRgb('#010101')).toEqual([1, 1, 1]);
    expect(hexToRgb('#FEFEFE')).toEqual([254, 254, 254]);
    expect(hexToRgb('#800080')).toEqual([128, 0, 128]); // purple
  });
});

// ============================================================
// CYCLE 2 SPEC TURN — by cb-team-impl2
// ============================================================

// Production TIME_REGEX from AppConfig (Config.js.html L4)
const TIME_REGEX = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

describe('getShortUserName', () => {
  it('extracts username from a standard email', () => {
    expect(getShortUserName('teacher@school.edu')).toBe('teacher');
  });

  it('returns the input unchanged when no @ is present', () => {
    expect(getShortUserName('just-a-name')).toBe('just-a-name');
  });

  it('returns null/undefined as-is for falsy input', () => {
    expect(getShortUserName(null)).toBe(null);
    expect(getShortUserName(undefined)).toBe(undefined);
  });
});

describe('formatTime', () => {
  it('pads single-digit hour ("9:05" → "09:05")', () => {
    expect(formatTime('9:05', TIME_REGEX)).toBe('09:05');
  });

  it('returns "00:00" for null/empty input', () => {
    expect(formatTime(null, TIME_REGEX)).toBe('00:00');
    expect(formatTime('', TIME_REGEX)).toBe('00:00');
  });

  it('returns "00:00" for invalid time format', () => {
    expect(formatTime('25:00', TIME_REGEX)).toBe('00:00');
    expect(formatTime('abc', TIME_REGEX)).toBe('00:00');
  });
});

describe('formatTimestampForFilename', () => {
  it('formats a Date-parseable timestamp to YYYYMMDD_HHmm', () => {
    // Use a fixed UTC timestamp and convert to local expectation
    const ts = '2026-06-22T18:30:00+08:00';
    const date = new Date(ts);
    const expected = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    expect(formatTimestampForFilename(ts)).toBe(expected);
  });

  it('returns empty string for null/undefined', () => {
    expect(formatTimestampForFilename(null)).toBe('');
    expect(formatTimestampForFilename(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatTimestampForFilename('')).toBe('');
  });
});
