/**
 * Config.js.html snapshot tests — AppConfig constants drift detection.
 * Ref: #117 — Verify constants (TIME_REGEX, color maps, weekdays, modes, status)
 * haven't drifted from expected values.
 *
 * Strategy: Parse Config.js.html statically to extract constant values,
 * then snapshot-test against known values. If a constant changes, the test
 * fails explicitly — forcing conscious acknowledgment of the change.
 *
 * Closes #117
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Parse Config.js.html ──────────────────────────────────────────────────

const configSource = readFileSync(
  resolve(import.meta.dirname, '../../Config.js.html'),
  'utf-8'
);

// Extract just the JS content between <script> tags
const scriptContent = configSource
  .replace(/<\/?script>/g, '')
  .trim();

// Evaluate the config in a sandboxed context to get actual values
// (safe: Config.js.html is pure data, no side effects)
function evaluateConfig(source) {
  const fn = new Function(`
    ${source}
    return AppConfig;
  `);
  return fn();
}

const AppConfig = evaluateConfig(scriptContent);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Config.js.html snapshot tests (#117)', () => {
  describe('AppConfig structure', () => {
    it('should define AppConfig with expected top-level keys', () => {
      const expectedKeys = [
        'APP_VERSION',
        'TIME_REGEX',
        'WEEKDAYS',
        'COURSE_COLORS',
        'MODES',
        'STATUS',
        'ALL_SCHEDULES_ID',
      ];
      expect(Object.keys(AppConfig).sort()).toEqual(expectedKeys.sort());
    });
  });

  describe('TIME_REGEX', () => {
    it('should be a RegExp', () => {
      expect(AppConfig.TIME_REGEX).toBeInstanceOf(RegExp);
    });

    it('should match the pattern used in utilityFunctions.test.js', () => {
      // The test suite hardcodes this regex — ensure it matches production
      const expectedPattern = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      expect(AppConfig.TIME_REGEX.source).toBe(expectedPattern.source);
      expect(AppConfig.TIME_REGEX.flags).toBe(expectedPattern.flags);
    });

    it('should accept valid 24h times', () => {
      expect(AppConfig.TIME_REGEX.test('00:00')).toBe(true);
      expect(AppConfig.TIME_REGEX.test('9:05')).toBe(true);
      expect(AppConfig.TIME_REGEX.test('09:05')).toBe(true);
      expect(AppConfig.TIME_REGEX.test('23:59')).toBe(true);
    });

    it('should reject invalid times', () => {
      expect(AppConfig.TIME_REGEX.test('25:00')).toBe(false);
      expect(AppConfig.TIME_REGEX.test('12:60')).toBe(false);
      expect(AppConfig.TIME_REGEX.test('abc')).toBe(false);
      expect(AppConfig.TIME_REGEX.test('')).toBe(false);
    });
  });

  describe('WEEKDAYS', () => {
    it('should have exactly 7 days', () => {
      expect(AppConfig.WEEKDAYS).toHaveLength(7);
    });

    it('should contain Chinese weekday names (星期一 through 星期日)', () => {
      expect(AppConfig.WEEKDAYS).toEqual([
        '星期一', '星期二', '星期三', '星期四',
        '星期五', '星期六', '星期日',
      ]);
    });
  });

  describe('COURSE_COLORS', () => {
    it('should have exactly 10 colors', () => {
      expect(AppConfig.COURSE_COLORS).toHaveLength(10);
    });

    it('should all be valid hex color codes', () => {
      for (const color of AppConfig.COURSE_COLORS) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('should match expected color palette', () => {
      expect(AppConfig.COURSE_COLORS).toEqual([
        '#93c5fd', // Jordy Blue
        '#73EEDC', // Turquoise
        '#DBF4A7', // Mindaro
        '#fca5a5', // Melon
        '#92DBFA', // Pale azure
        '#C5D8D1', // Ash grey
        '#B5EBCC', // Celadon
        '#FDE74C', // Maize
        '#F5AE80', // Sandy Brown
        '#D6D1CD', // Timberwolf
      ]);
    });
  });

  describe('MODES', () => {
    it('should have WEEK and DAY modes', () => {
      expect(AppConfig.MODES).toEqual({
        WEEK: 'week',
        DAY: 'day',
      });
    });
  });

  describe('STATUS', () => {
    it('should have all expected status values', () => {
      expect(AppConfig.STATUS).toEqual({
        DIRTY: 'dirty',
        SYNCED: 'synced',
        SYNCING: 'syncing',
        ERROR: 'error',
        OFFLINE: 'offline',
        CONFLICT: 'conflict',
      });
    });

    it('status values should all be lowercase strings', () => {
      for (const [, value] of Object.entries(AppConfig.STATUS)) {
        expect(typeof value).toBe('string');
        expect(value).toBe(value.toLowerCase());
      }
    });
  });

  describe('ALL_SCHEDULES_ID', () => {
    it('should be the expected sentinel value', () => {
      expect(AppConfig.ALL_SCHEDULES_ID).toBe('ALL_SCHEDULES');
    });
  });

  describe('APP_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(AppConfig.APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('cross-reference: TIME_REGEX consistency with utilityFunctions.test.js', () => {
    it('TIME_REGEX source should match the hardcoded regex in utilityFunctions.test.js', () => {
      // utilityFunctions.test.js L220: const TIME_REGEX = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      // This test ensures Config.js.html hasn't drifted from the copy in tests
      const hardcodedInTests = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      expect(AppConfig.TIME_REGEX.source).toBe(hardcodedInTests.source);
    });
  });
});
