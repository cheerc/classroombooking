import { stringToHashCode, hexToRgb, getShortUserName, formatTime, formatTimestampForFilename, sortClassrooms } from '../lib/utilityFunctions.js';
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

// ============================================================
// GAP TURN (Cycle 2) — Adversarial tests by cb-team-impl
// ============================================================

describe('getShortUserName — GAP', () => {
  // GAP-17: Empty string '' is falsy — SPEC tested null/undefined but not ''.
  // '' hits the !email branch (falsy), returns ''. Distinct from null passthrough.
  it('returns empty string for empty string input (falsy branch)', () => {
    expect(getShortUserName('')).toBe('');
  });

  // GAP-18: Multiple @ in email — split('@')[0] returns first segment.
  // Production might encounter malformed data; behavior should be documented.
  it('returns part before first @ when multiple @ signs present', () => {
    expect(getShortUserName('user@domain@extra')).toBe('user');
  });

  // GAP-19: No local part — '@domain.com' → split('@')[0] is ''.
  // Edge case: valid syntax-wise but pathological input.
  it('returns empty string when @ is the first character', () => {
    expect(getShortUserName('@domain.com')).toBe('');
  });

  // GAP-20: Email with special characters (plus-addressing, dots).
  // Production teachers may use these; ensures split doesn't mangle.
  it('preserves special characters in local part', () => {
    expect(getShortUserName('user+tag@domain.com')).toBe('user+tag');
    expect(getShortUserName('first.last@domain.com')).toBe('first.last');
  });

  // GAP-21: Whitespace-only string is truthy, has no @ → passthrough.
  // SPEC never tested truthy-but-meaningless inputs.
  it('passes through whitespace-only string (truthy, no @)', () => {
    expect(getShortUserName('   ')).toBe('   ');
  });
});

describe('formatTime — GAP', () => {
  // GAP-22: Already-padded input — SPEC only tested single-digit hour.
  // Two-digit input should pass through padStart unchanged.
  it('preserves already-padded time "09:05"', () => {
    expect(formatTime('09:05', TIME_REGEX)).toBe('09:05');
  });

  // GAP-23: Two-digit hour — SPEC never tested hours ≥ 10.
  it('handles two-digit hour without double-padding', () => {
    expect(formatTime('10:30', TIME_REGEX)).toBe('10:30');
    expect(formatTime('15:45', TIME_REGEX)).toBe('15:45');
  });

  // GAP-24: Whitespace-padded input — trim() path was never exercised.
  // Production input from GAS forms may have trailing whitespace.
  it('trims whitespace before parsing', () => {
    expect(formatTime('  9:05  ', TIME_REGEX)).toBe('09:05');
    expect(formatTime('\t10:30\t', TIME_REGEX)).toBe('10:30');
  });

  // GAP-25: Midnight boundary — '0:00' is valid (regex allows [01]?[0-9]).
  it('handles midnight "0:00" → "00:00"', () => {
    expect(formatTime('0:00', TIME_REGEX)).toBe('00:00');
  });

  // GAP-26: Max valid time boundary — 23:59.
  it('handles max valid time "23:59"', () => {
    expect(formatTime('23:59', TIME_REGEX)).toBe('23:59');
  });

  // GAP-27: Single-digit minutes — TIME_REGEX requires 2-digit minutes [0-5][0-9].
  // '9:5' does NOT match → returns '00:00'. Documents regex strictness.
  it('rejects single-digit minutes (regex requires 2-digit)', () => {
    expect(formatTime('9:5', TIME_REGEX)).toBe('00:00');
  });

  // GAP-28: Hour 24 boundary — '24:00' is invalid per regex (max [01]?[0-9]|2[0-3]).
  it('rejects hour 24 (out of regex range)', () => {
    expect(formatTime('24:00', TIME_REGEX)).toBe('00:00');
  });

  // GAP-29: Minutes 60 boundary — '12:60' invalid (max [0-5][0-9]).
  it('rejects minutes 60', () => {
    expect(formatTime('12:60', TIME_REGEX)).toBe('00:00');
  });
});

describe('formatTimestampForFilename — GAP', () => {
  // GAP-30: Invalid date string — new Date('not-a-date') → Invalid Date.
  // getFullYear() returns NaN → template produces NaN-containing string.
  // Documents silent failure: no guard against Invalid Date.
  it('produces NaN-containing output for invalid date string (documents bug)', () => {
    const result = formatTimestampForFilename('not-a-date');
    expect(result).toContain('NaN');
  });

  // GAP-31: Epoch number — new Date(ms) is valid. SPEC only tested ISO string.
  it('handles epoch millisecond number', () => {
    const epoch = new Date('2026-01-15T10:30:00+08:00').getTime();
    const result = formatTimestampForFilename(epoch);
    // Verify format pattern YYYYMMDD_HHmm
    expect(result).toMatch(/^\d{8}_\d{4}$/);
    // Verify it matches what Date parses
    const date = new Date(epoch);
    const expected = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });

  // GAP-32: 0 is falsy — !0 is true → returns ''.
  // But new Date(0) is valid (epoch start 1970-01-01).
  // Documents limitation: epoch 0 treated as no-timestamp.
  it('returns empty string for 0 (falsy, documents epoch-0 limitation)', () => {
    expect(formatTimestampForFilename(0)).toBe('');
  });

  // GAP-33: false is falsy → returns ''.
  it('returns empty string for false (falsy)', () => {
    expect(formatTimestampForFilename(false)).toBe('');
  });

  // GAP-34: Single-digit month/day padding — January 5th tests padStart(2, '0').
  // SPEC only tested June (2-digit month). Ensures padding logic works for all months.
  it('pads single-digit month and day', () => {
    const ts = '2026-01-05T08:05:00+08:00';
    const result = formatTimestampForFilename(ts);
    // Compute expected from Date to be timezone-independent (CI runs UTC)
    const date = new Date(ts);
    const expected = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

// ============================================================
// CYCLE 3 SPEC TURN — by cb-team-impl
// ============================================================

describe('sortClassrooms', () => {
  it('sorts classrooms by floor descending then room ascending', () => {
    const input = ['101', '302', '201', '301', '102', '202'];
    const result = sortClassrooms(input);
    // 3xx first (descending hundreds), then within floor ascending
    expect(result).toEqual(['301', '302', '201', '202', '101', '102']);
  });

  it('returns empty array for empty input', () => {
    expect(sortClassrooms([])).toEqual([]);
  });

  it('returns single-element array unchanged', () => {
    expect(sortClassrooms(['205'])).toEqual(['205']);
  });

  it('does not mutate the original array', () => {
    const input = ['201', '101', '301'];
    const original = [...input];
    sortClassrooms(input);
    expect(input).toEqual(original);
  });
});

// ============================================================
// CYCLE 3 GAP TURN — Adversarial tests by cb-team-impl2
// ============================================================

describe('sortClassrooms — GAP', () => {
  // GAP-35: Non-numeric classroom names — regex fallback to '0'.
  // Production data can include names like '音樂教室' from Set keys.
  // All non-numeric names get numA=0 → floor=0, remainder=0 → tied.
  it('handles non-numeric classroom names (CJK) via regex fallback', () => {
    const input = ['音樂教室', '201', '體育館'];
    const result = sortClassrooms(input);
    // '201' → floor 2, remainder 1. Non-numeric → floor 0, remainder 0.
    // 2xx comes first, then 0xx (non-numeric).
    expect(result[0]).toBe('201');
    // The two non-numeric names are tied (both → 0) — order depends on sort stability
    expect(result.slice(1).sort()).toEqual(['體育館', '音樂教室'].sort());
  });

  // GAP-36: Mixed text+number names — 'Room 301' → regex matches '301'.
  it('extracts number from mixed text+number name', () => {
    const input = ['Room 301', 'Room 101', 'Room 201'];
    const result = sortClassrooms(input);
    // 3xx first, then 2xx, then 1xx
    expect(result).toEqual(['Room 301', 'Room 201', 'Room 101']);
  });

  // GAP-37: null in array — .match() throws on null → catch branch.
  // Catch returns classroomList (the original input with null).
  it('returns original array when null element causes error (catch branch)', () => {
    const input = ['301', null, '101'];
    const result = sortClassrooms(input);
    // catch returns classroomList (the original spread fails before sort completes)
    // Actually [...input] succeeds (spread null into array is fine), but
    // null.match() throws TypeError inside sort callback → catch
    expect(result).toEqual(input); // Returns the original input unchanged
  });

  // GAP-38: Non-array input (e.g., null) — spread throws → catch returns [] (|| fallback).
  it('returns empty array for null input (catch branch, || [] fallback)', () => {
    expect(sortClassrooms(null)).toEqual([]);
  });

  // GAP-39: undefined input — spread throws → catch returns [] (|| fallback).
  it('returns empty array for undefined input', () => {
    expect(sortClassrooms(undefined)).toEqual([]);
  });

  // GAP-40: 4-digit room numbers — '1001' → hundreds=10, remainder=1.
  // Different floor semantics than 3-digit rooms. SPEC only tested 1xx-3xx.
  it('handles 4-digit room numbers (floor = hundreds digit)', () => {
    const input = ['1001', '301', '501'];
    const result = sortClassrooms(input);
    // 1001 → floor 10, 501 → floor 5, 301 → floor 3
    // Descending by floor: 1001, 501, 301
    expect(result).toEqual(['1001', '501', '301']);
  });

  // GAP-41: Same floor, same remainder — tied rooms.
  // Sort is stable in modern engines but SPEC doesn't verify this.
  it('handles tied rooms (same number) preserving relative order', () => {
    const input = ['301', '301', '201'];
    const result = sortClassrooms(input);
    // '301' × 2 should both come before '201'
    expect(result[0]).toBe('301');
    expect(result[1]).toBe('301');
    expect(result[2]).toBe('201');
  });

  // GAP-42: Rooms on same floor — tests remainder ordering.
  // SPEC tested mixed floors but never tested > 2 rooms on same floor.
  it('sorts multiple rooms on the same floor by remainder ascending', () => {
    const input = ['310', '305', '301', '315', '303'];
    const result = sortClassrooms(input);
    expect(result).toEqual(['301', '303', '305', '310', '315']);
  });

  // GAP-43: Ground floor (0xx) rooms — hundreds = 0.
  // SPEC never tested rooms below 100.
  it('handles ground floor rooms (0xx, single/double digit)', () => {
    const input = ['50', '201', '5', '10'];
    const result = sortClassrooms(input);
    // 201 → floor 2 (first), then 50 → floor 0 remainder 50,
    // 10 → floor 0 remainder 10, 5 → floor 0 remainder 5
    expect(result).toEqual(['201', '5', '10', '50']);
  });

  // GAP-44: Non-array iterable (string) — spread on string splits chars.
  // 'abc' → [...'abc'] = ['a','b','c'] → each char.match(/\d+/) = null → all map to 0.
  // Documents unexpected behavior with wrong input type.
  it('documents behavior with string input (spread splits chars)', () => {
    const result = sortClassrooms('301');
    // [...'301'] = ['3','0','1'], each is a digit
    // '3' → 3 (floor 0, rem 3), '0' → 0, '1' → 1
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
  });
});
