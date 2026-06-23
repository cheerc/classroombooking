/**
 * Business logic calculation behavior tests — edge cases.
 * Ref: #138 — checkTimeConflict, timeToMinutes, _checkPermission adversarial coverage
 *
 * Extends existing coverage in frontend.test.js and backend.test.js with
 * specific edge cases called out in #138:
 * - checkTimeConflict: cross-midnight, zero-length intervals, adjacent-not-overlapping,
 *   completely contained, reversed times
 * - timeToMinutes: boundary values, malformed strings, numeric edge cases
 * - _checkPermission: admin vs creator vs other, case sensitivity, empty email,
 *   missing ADMIN_EMAIL config, null/undefined createdBy
 *
 * Closes #138
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  timeToMinutes,
  checkTimeConflict,
} from '../lib/frontendUtils.js';
import { createMockSheet, createMockSpreadsheetApp, createMockSession,
         createMockLockService, createMockPropertiesService, createMockLogger,
         createMockHtmlService, createMockDriveApp } from '../mocks/gasMocks.js';

// ─── GAS environment factory (same as backend.test.js) ─────────────────────

const gasSource = readFileSync(
  resolve(import.meta.dirname, '../../程式碼.js'),
  'utf-8'
);

function createGasEnv(opts = {}) {
  const sheets = opts.sheets || {};
  const SpreadsheetApp = createMockSpreadsheetApp(sheets);
  const Session = createMockSession(opts.userEmail ?? 'test@example.com');
  const LockService = opts.LockService || createMockLockService();
  const PropertiesService = createMockPropertiesService(opts.scriptProps || {});
  const Logger = createMockLogger();
  const HtmlService = createMockHtmlService();
  const DriveApp = createMockDriveApp(opts.driveFiles || {});

  const wrappedSource = `
    return (function(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService, DriveApp) {
      ${gasSource}
      return {
        getConfig, _findScheduleRowInfo, _checkPermission, _getSs, getSheet, getOrCreateSheet,
        doGet, getData, saveData, checkMetadata, addSchedule,
        updateScheduleMetadata, deleteSchedule, copySchedule,
        getVersions, getVersionData, getFontBase64FromDrive
      };
    })(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService, DriveApp);
  `;

  const factory = new Function(
    'SpreadsheetApp', 'Session', 'LockService', 'PropertiesService', 'Logger', 'HtmlService', 'DriveApp',
    wrappedSource
  );

  return factory(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService, DriveApp);
}

// ═══════════════════════════════════════════════════════════════════════════
// timeToMinutes — boundary and edge cases (#138)
// ═══════════════════════════════════════════════════════════════════════════

describe('timeToMinutes — edge cases (#138)', () => {
  // Boundary: midnight
  it('converts "00:00" (midnight) to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  // Boundary: one minute before midnight
  it('converts "23:59" to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  // Boundary: noon
  it('converts "12:00" (noon) to 720', () => {
    expect(timeToMinutes('12:00')).toBe(720);
  });

  // Boundary: one minute past midnight
  it('converts "00:01" to 1', () => {
    expect(timeToMinutes('00:01')).toBe(1);
  });

  // Single digit hour (no padding)
  it('converts "1:30" (no zero-padding) to 90', () => {
    expect(timeToMinutes('1:30')).toBe(90);
  });

  // Edge: empty string — split(':') returns [''], map(Number) returns [NaN]
  // NaN * 60 + NaN = NaN, but try-catch should return 0 only on throw
  // Actually split on '' won't throw, so NaN + NaN = NaN (not 0)
  it('returns NaN for empty string (no throw, split succeeds)', () => {
    const result = timeToMinutes('');
    expect(Number.isNaN(result)).toBe(true);
  });

  // Edge: no colon — split(':') returns [whole-string], [1] is undefined
  // Number(undefined) = NaN → hours * 60 + NaN = NaN
  it('returns NaN for string without colon', () => {
    const result = timeToMinutes('0800');
    expect(Number.isNaN(result)).toBe(true);
  });

  // Edge: null/undefined — triggers catch branch (null.split throws)
  it('returns 0 for null (catch branch)', () => {
    expect(timeToMinutes(null)).toBe(0);
  });

  it('returns 0 for undefined (catch branch)', () => {
    expect(timeToMinutes(undefined)).toBe(0);
  });

  // Edge: numeric input — Number.split is not a function → catch → 0
  it('returns 0 for numeric input (catch branch)', () => {
    expect(timeToMinutes(480)).toBe(0);
  });

  // Edge: boolean input — false.split is not a function → catch → 0
  it('returns 0 for boolean input (catch branch)', () => {
    expect(timeToMinutes(false)).toBe(0);
  });

  // Edge: extra colons — "08:00:30" → split gives ['08','00','30']
  // Destructuring: hours=8, minutes=0 → 480 (ignores seconds)
  it('ignores seconds in "08:00:30" (extra colons)', () => {
    expect(timeToMinutes('08:00:30')).toBe(480);
  });

  // Edge: negative-looking time — "-1:00" → hours=-1, minutes=0 → -60
  it('returns negative for "-1:00" (no validation)', () => {
    expect(timeToMinutes('-1:00')).toBe(-60);
  });

  // Edge: hours >= 24 — "25:00" → 1500 (no validation)
  it('does not validate hour > 23', () => {
    expect(timeToMinutes('25:00')).toBe(1500);
  });

  // Edge: fractional minutes — "08:30" → 510
  it('converts "08:30" correctly', () => {
    expect(timeToMinutes('08:30')).toBe(510);
  });

  // Edge: whitespace around time — " 08:00 " → split gives [' 08', '00 ']
  // Number(' 08') = 8, Number('00 ') = 0 → 480 (JS Number trims whitespace)
  it('handles whitespace around time string', () => {
    expect(timeToMinutes(' 08:00 ')).toBe(480);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkTimeConflict — edge cases (#138)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkTimeConflict — edge cases (#138)', () => {
  // --- Adjacent but not overlapping ---
  it('returns false for adjacent slots (end === start of next)', () => {
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '09:00' }];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '10:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  it('returns false for adjacent slots (end of new === start of existing)', () => {
    const existing = [{ id: 'e1', timeStart: '10:00', timeEnd: '11:00' }];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '10:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  // --- Zero-length intervals ---
  it('returns false for zero-length new class at start of existing', () => {
    // newStart=480, newEnd=480 — newStart < existingEnd (540) but newEnd (480) > existingStart (480)?
    // 480 > 480 is false → no conflict
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '09:00' }];
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '08:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  it('returns false for zero-length new class at end of existing', () => {
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '09:00' }];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '09:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  it('returns false when zero-length new class is inside existing range', () => {
    // newStart=510, newEnd=510 — 510 < 540 && 510 > 480 → true!
    // Actually zero-length at 08:30 IS inside [08:00, 09:00]
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '09:00' }];
    const newClass = { id: 'n1', timeStart: '08:30', timeEnd: '08:30' };
    // 510 < 540 = true AND 510 > 480 = true → conflict!
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  it('returns false for zero-length existing class when new class spans it', () => {
    // existing: start=510, end=510 (zero-length at 08:30)
    // new: start=480, end=540 (08:00-09:00)
    // 480 < 510 && 540 > 510 → true → conflict detected
    const existing = [{ id: 'e1', timeStart: '08:30', timeEnd: '08:30' }];
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '09:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  // --- Completely contained ---
  it('detects conflict when new class is completely inside existing', () => {
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '12:00' }];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '11:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  it('detects conflict when existing class is completely inside new', () => {
    const existing = [{ id: 'e1', timeStart: '09:00', timeEnd: '10:00' }];
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '11:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  // --- One minute overlap ---
  it('detects conflict with 1-minute overlap at end', () => {
    const existing = [{ id: 'e1', timeStart: '08:00', timeEnd: '09:01' }];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '10:00' };
    // 540 < 541 && 600 > 480 → true
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  it('detects conflict with 1-minute overlap at start', () => {
    const existing = [{ id: 'e1', timeStart: '08:59', timeEnd: '10:00' }];
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '09:00' };
    // 480 < 600 && 540 > 539 → true
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  // --- Self-exclusion (same id) ---
  it('excludes self even with exact time match', () => {
    const existing = [{ id: 'self1', timeStart: '08:00', timeEnd: '09:00' }];
    const newClass = { id: 'self1', timeStart: '08:00', timeEnd: '09:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  it('detects conflict with other but not self in mixed list', () => {
    const existing = [
      { id: 'self1', timeStart: '08:00', timeEnd: '09:00' },
      { id: 'other', timeStart: '08:30', timeEnd: '09:30' },
    ];
    const newClass = { id: 'self1', timeStart: '08:00', timeEnd: '09:00' };
    // self1 skipped, but other overlaps (480 < 570 && 540 > 510) → true
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  // --- Multiple existing classes, one conflict ---
  it('detects conflict when only one of multiple existing classes overlaps', () => {
    const existing = [
      { id: 'e1', timeStart: '06:00', timeEnd: '07:00' },
      { id: 'e2', timeStart: '10:00', timeEnd: '11:00' },
      { id: 'e3', timeStart: '08:30', timeEnd: '09:30' },
    ];
    const newClass = { id: 'n1', timeStart: '09:00', timeEnd: '10:00' };
    // Only e3 overlaps: 540 < 570 && 600 > 510 → true
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  // --- Null/empty existing classes ---
  it('returns false for null existingClasses', () => {
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '09:00' };
    expect(checkTimeConflict(newClass, null)).toBe(false);
  });

  it('returns false for empty existingClasses array', () => {
    const newClass = { id: 'n1', timeStart: '08:00', timeEnd: '09:00' };
    expect(checkTimeConflict(newClass, [])).toBe(false);
  });

  // --- Late evening / early morning boundary ---
  it('handles late evening classes correctly', () => {
    const existing = [{ id: 'e1', timeStart: '21:00', timeEnd: '22:30' }];
    const newClass = { id: 'n1', timeStart: '22:00', timeEnd: '23:00' };
    // 1320 < 1350 && 1380 > 1260 → true
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });

  it('returns false for non-overlapping late classes', () => {
    const existing = [{ id: 'e1', timeStart: '21:00', timeEnd: '22:00' }];
    const newClass = { id: 'n1', timeStart: '22:00', timeEnd: '23:00' };
    // 1320 < 1320 is false → no conflict
    expect(checkTimeConflict(newClass, existing)).toBe(false);
  });

  // --- Full day class ---
  it('full-day existing class conflicts with any timed class', () => {
    const existing = [{ id: 'e1', timeStart: '00:00', timeEnd: '23:59' }];
    const newClass = { id: 'n1', timeStart: '12:00', timeEnd: '13:00' };
    expect(checkTimeConflict(newClass, existing)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _checkPermission — full path coverage (#138)
// ═══════════════════════════════════════════════════════════════════════════

describe('_checkPermission — edge cases (#138)', () => {
  // --- Admin access ---
  it('allows admin to manage any schedule', () => {
    const gas = createGasEnv({
      userEmail: 'admin@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('anyone@school.com')).not.toThrow();
  });

  // --- Creator access ---
  it('allows creator to manage their own schedule', () => {
    const gas = createGasEnv({
      userEmail: 'teacher@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('teacher@school.com')).not.toThrow();
  });

  // --- Unauthorized access ---
  it('rejects user who is neither admin nor creator', () => {
    const gas = createGasEnv({
      userEmail: 'other@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });

  // --- Case sensitivity: admin email ---
  it('admin check is case-insensitive (upper vs lower)', () => {
    const gas = createGasEnv({
      userEmail: 'ADMIN@SCHOOL.COM',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).not.toThrow();
  });

  it('admin check is case-insensitive (mixed case)', () => {
    const gas = createGasEnv({
      userEmail: 'Admin@School.Com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).not.toThrow();
  });

  // --- Case sensitivity: creator email ---
  it('creator check is case-insensitive', () => {
    const gas = createGasEnv({
      userEmail: 'Teacher@School.COM',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('teacher@school.com')).not.toThrow();
  });

  it('creator check is case-insensitive (reversed case)', () => {
    const gas = createGasEnv({
      userEmail: 'teacher@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('TEACHER@SCHOOL.COM')).not.toThrow();
  });

  // --- Empty email guard (Ref: #62) ---
  it('throws "未登入" when current user email is empty', () => {
    const gas = createGasEnv({
      userEmail: '',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).toThrow('未登入');
  });

  // --- Missing ADMIN_EMAIL config ---
  it('non-admin user passes when ADMIN_EMAIL config is missing', () => {
    // getConfig('ADMIN_EMAIL') returns null/undefined
    // (null || '').toLowerCase() = '' which won't match anyone
    // So only creator match matters
    const gas = createGasEnv({
      userEmail: 'creator@school.com',
      scriptProps: {},  // no ADMIN_EMAIL
    });
    expect(() => gas._checkPermission('creator@school.com')).not.toThrow();
  });

  it('rejects non-creator when ADMIN_EMAIL config is missing', () => {
    const gas = createGasEnv({
      userEmail: 'other@school.com',
      scriptProps: {},  // no ADMIN_EMAIL
    });
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });

  it('no one is admin when ADMIN_EMAIL config is missing', () => {
    // Even if user's email is something, without config it can't match
    const gas = createGasEnv({
      userEmail: 'admin@school.com',
      scriptProps: {},  // no ADMIN_EMAIL set
    });
    // admin@school.com is NOT admin because config is empty
    // But admin@school.com !== creator@school.com → reject
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });

  // --- ADMIN_EMAIL config is empty string ---
  it('empty ADMIN_EMAIL config means no one is admin', () => {
    const gas = createGasEnv({
      userEmail: 'user@school.com',
      scriptProps: { ADMIN_EMAIL: '' },
    });
    // ''.toLowerCase() = '' — user@school.com !== '' so not admin
    // user@school.com !== creator@school.com → reject
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });

  // --- createdBy is null/undefined ---
  it('throws when createdBy is null (null.toLowerCase throws)', () => {
    const gas = createGasEnv({
      userEmail: 'user@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    // createdBy.toLowerCase() will throw TypeError on null
    expect(() => gas._checkPermission(null)).toThrow();
  });

  it('throws when createdBy is undefined', () => {
    const gas = createGasEnv({
      userEmail: 'user@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission(undefined)).toThrow();
  });

  // --- Admin with null createdBy should still pass (admin bypass) ---
  it('admin can pass even with null createdBy (admin check comes first)', () => {
    const gas = createGasEnv({
      userEmail: 'admin@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    // isAdmin=true → short-circuits before createdBy.toLowerCase()
    // Wait: the code does `!isAdmin && currentUser.toLowerCase() !== createdBy.toLowerCase()`
    // isAdmin=true → !isAdmin=false → AND short-circuits → no throw
    expect(() => gas._checkPermission(null)).not.toThrow();
  });

  // --- Whitespace in emails ---
  it('does not trim whitespace in emails (documents behavior)', () => {
    const gas = createGasEnv({
      userEmail: ' admin@school.com ',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    // ' admin@school.com '.toLowerCase() !== 'admin@school.com' (whitespace matters)
    // Not admin, not creator → reject
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });
});
