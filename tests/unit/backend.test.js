/**
 * Backend GAS function tests using mock runtime.
 * Ref: #51 — Wave 5 GAS mock testing phase 2
 *
 * Strategy: Wrap 程式碼.js source in a factory function that receives mock
 * objects as params, returning the declared functions for direct testing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMockSheet, createMockSpreadsheetApp, createMockSession,
         createMockLockService, createMockPropertiesService, createMockLogger,
         createMockHtmlService } from '../mocks/gasMocks.js';

const gasSource = readFileSync(
  resolve(import.meta.dirname, '../../程式碼.js'),
  'utf-8'
);

/**
 * Create a sandboxed GAS environment — wraps 程式碼.js in a function that
 * receives GAS globals as parameters and returns all declared functions.
 */
function createGasEnv(opts = {}) {
  const sheets = opts.sheets || {};
  const SpreadsheetApp = createMockSpreadsheetApp(sheets);
  const Session = createMockSession(opts.userEmail ?? 'test@example.com');
  const LockService = createMockLockService();
  const PropertiesService = createMockPropertiesService(opts.scriptProps || {});
  const Logger = createMockLogger();
  const HtmlService = createMockHtmlService();

  // Wrap the GAS source so that all top-level functions become properties
  // of an object we can return. We inject the GAS globals as local variables.
  const wrappedSource = `
    return (function(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService) {
      ${gasSource}
      return {
        getConfig, _findScheduleRowInfo, _checkPermission, _getSs, getSheet, getOrCreateSheet,
        doGet, getData, saveData, checkMetadata, addSchedule,
        updateScheduleMetadata, deleteSchedule, copySchedule,
        getVersions, getVersionData, getFontBase64FromDrive
      };
    })(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService);
  `;

  const factory = new Function(
    'SpreadsheetApp', 'Session', 'LockService', 'PropertiesService', 'Logger', 'HtmlService',
    wrappedSource
  );

  return factory(SpreadsheetApp, Session, LockService, PropertiesService, Logger, HtmlService);
}

// ─── checkMetadata ───────────────────────────────────────────────────────

describe('checkMetadata', () => {
  it('returns new timestamp when no conflict', () => {
    const dataSheet = createMockSheet('Data', { F1: '2024-01-01T00:00:00.000Z' });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    const result = gas.checkMetadata(dataSheet, '2024-01-01T00:00:00.000Z');
    expect(result).toBeTruthy();
    expect(() => new Date(result).toISOString()).not.toThrow();
  });

  it('throws on timestamp conflict', () => {
    const dataSheet = createMockSheet('Data', { F1: '2024-01-01T00:00:00.000Z' });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    expect(() => {
      gas.checkMetadata(dataSheet, '2023-12-31T00:00:00.000Z');
    }).toThrow();
  });

  it('passes when clientTimestamp is null (first save)', () => {
    const dataSheet = createMockSheet('Data', { F1: '2024-01-01T00:00:00.000Z' });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    const result = gas.checkMetadata(dataSheet, null);
    expect(result).toBeTruthy();
  });

  it('passes when server timestamp is empty (fresh sheet)', () => {
    const dataSheet = createMockSheet('Data', {});
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    const result = gas.checkMetadata(dataSheet, '2024-01-01T00:00:00.000Z');
    expect(result).toBeTruthy();
  });

  it('normalizes Date object from getValue (Ref: #38)', () => {
    const ts = new Date('2024-06-15T10:30:00.000Z');
    const dataSheet = createMockSheet('Data', { F1: ts });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    const result = gas.checkMetadata(dataSheet, '2024-06-15T10:30:00.000Z');
    expect(result).toBeTruthy();
  });
});

// ─── getVersionData ──────────────────────────────────────────────────────

describe('getVersionData', () => {
  it('returns version data for valid versionId', () => {
    const ts = '2024-06-15T10:30:00.000Z';
    const snapshot = JSON.stringify({
      scheduleData: { room1: { 1: [{ name: 'Math' }] } },
      classrooms: ['room1'],
      tags: ['tag1'],
    });
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'ScheduleData Snapshot',
      A2: ts, B2: 'user@test.com', C2: snapshot,
    });
    const gas = createGasEnv({ sheets: { History: historySheet } });

    const result = gas.getVersionData(ts);
    expect(result.success).toBe(true);
    expect(result.scheduleData).toEqual({ room1: { 1: [{ name: 'Math' }] } });
    expect(result.classrooms).toEqual(['room1']);
    expect(result.tags).toEqual(['tag1']);
  });

  it('returns not-found for unknown versionId', () => {
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'Data',
      A2: '2024-01-01T00:00:00.000Z', B2: 'user@test.com', C2: '{}',
    });
    const gas = createGasEnv({ sheets: { History: historySheet } });

    const result = gas.getVersionData('1999-01-01T00:00:00.000Z');
    // When version not found, returns success: false
    expect(result.success).toBe(false);
    expect(result.error).toContain('找不到');
  });

  it('returns error on missing versionId', () => {
    const gas = createGasEnv({});

    const result = gas.getVersionData(null);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('skips invalid date rows without crashing (Ref: #39)', () => {
    const validTs = '2024-06-15T10:30:00.000Z';
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'Data',
      A2: 'not-a-date', B2: 'user@test.com', C2: '{}',
      A3: validTs, B3: 'user@test.com',
      C3: JSON.stringify({ scheduleData: { r: 1 }, classrooms: [], tags: [] }),
    });
    const gas = createGasEnv({ sheets: { History: historySheet } });

    const result = gas.getVersionData(validTs);
    expect(result.success).toBe(true);
    expect(result.scheduleData).toEqual({ r: 1 });
  });
});

// ─── _checkPermission ────────────────────────────────────────────────────

describe('_checkPermission', () => {
  it('allows admin user', () => {
    const gas = createGasEnv({
      userEmail: 'admin@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('other@school.com')).not.toThrow();
  });

  it('allows creator', () => {
    const gas = createGasEnv({
      userEmail: 'creator@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).not.toThrow();
  });

  it('rejects unauthorized user', () => {
    const gas = createGasEnv({
      userEmail: 'hacker@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).toThrow('權限不足');
  });

  it('case-insensitive email comparison', () => {
    const gas = createGasEnv({
      userEmail: 'Admin@School.COM',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('other@school.com')).not.toThrow();
  });

  // Ref: #62 — Empty email guard
  it('throws when user email is empty (e.g. time-driven trigger)', () => {
    const gas = createGasEnv({
      userEmail: '',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
    });
    expect(() => gas._checkPermission('creator@school.com')).toThrow('未登入');
  });
});

// ─── copySchedule (#41 permission check) ─────────────────────────────────

describe('copySchedule', () => {
  it('rejects copy by unauthorized user (Ref: #41)', () => {
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy',
      F1: '2024-01-01T00:00:00.000Z',
      A2: 'schedule_1', B2: 'Test Schedule',
      C2: '2024-01-01T00:00:00.000Z', D2: 'owner@school.com',
    });
    const sourceSheet = createMockSheet('schedule_1');

    const gas = createGasEnv({
      userEmail: 'hacker@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
      sheets: { Data: dataSheet, schedule_1: sourceSheet },
    });

    const result = gas.copySchedule({
      sourceId: 'schedule_1',
      newName: 'Copied',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('權限不足');
  });

  it('allows copy by owner', () => {
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy',
      F1: '2024-01-01T00:00:00.000Z',
      A2: 'schedule_1', B2: 'Test Schedule',
      C2: '2024-01-01T00:00:00.000Z', D2: 'owner@school.com',
    });
    const sourceSheet = createMockSheet('schedule_1');

    const gas = createGasEnv({
      userEmail: 'owner@school.com',
      scriptProps: { ADMIN_EMAIL: 'admin@school.com' },
      sheets: { Data: dataSheet, schedule_1: sourceSheet },
    });

    const result = gas.copySchedule({
      sourceId: 'schedule_1',
      newName: 'Copied',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.newId).toMatch(/^schedule_/);
    expect(result.createdBy).toBe('owner@school.com');
  });
});

// ─── getData ─────────────────────────────────────────────────────────────

describe('getData', () => {
  it('returns empty schedules for fresh sheet', () => {
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy', E1: 'Draft',
    });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });

    const result = gas.getData();
    // Early return for empty sheet doesn't include success field
    expect(result.schedules).toEqual({});
    expect(result.metadataTimestamp).toBeTruthy();
  });

  it('returns schedule data from dedicated sheets', () => {
    const now = new Date().toISOString();
    const scheduleSheet = createMockSheet('schedule_1', {
      B2: JSON.stringify({ room1: { 1: [{ name: 'Math' }] } }),
      B3: JSON.stringify(['room1']),
      B4: JSON.stringify(['tag1']),
    });
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy', E1: 'Draft',
      F1: now,
      A2: 'schedule_1', B2: 'Test', C2: now, D2: 'user@test.com', E2: false,
    });

    const gas = createGasEnv({ sheets: { Data: dataSheet, schedule_1: scheduleSheet } });

    const result = gas.getData();
    expect(result.success).toBe(true);
    expect(result.schedules.schedule_1).toBeDefined();
    expect(result.schedules.schedule_1.name).toBe('Test');
    expect(result.schedules.schedule_1.data.classrooms).toEqual(['room1']);
  });
});

// ─── addSchedule (#66 ID format validation) ──────────────────────────────────

describe('addSchedule', () => {
  it('rejects invalid schedule ID format (Ref: #66)', () => {
    const dataSheet = createMockSheet('Data', {
      F1: '2024-01-01T00:00:00.000Z',
    });
    const gas = createGasEnv({
      sheets: { Data: dataSheet },
      userEmail: 'user@test.com',
    });

    const result = gas.addSchedule({
      id: 'malicious<script>alert(1)</script>',
      name: 'Test',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('無效的課表 ID');
  });

  it('rejects schedule ID without proper prefix', () => {
    const dataSheet = createMockSheet('Data', {
      F1: '2024-01-01T00:00:00.000Z',
    });
    const gas = createGasEnv({
      sheets: { Data: dataSheet },
      userEmail: 'user@test.com',
    });

    const result = gas.addSchedule({
      id: 'not_a_valid_id',
      name: 'Test',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('無效的課表 ID');
  });

  it('accepts valid schedule ID format', () => {
    const dataSheet = createMockSheet('Data', {
      F1: '2024-01-01T00:00:00.000Z',
    });
    const gas = createGasEnv({
      sheets: { Data: dataSheet },
      userEmail: 'user@test.com',
    });

    const result = gas.addSchedule({
      id: 'schedule_1719000000000',
      name: 'Valid Schedule',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.createdBy).toBe('user@test.com');
  });

  it('rejects duplicate schedule ID', () => {
    const dataSheet = createMockSheet('Data', {
      F1: '2024-01-01T00:00:00.000Z',
    });
    // Pre-create a sheet with the same name to simulate existing schedule
    const existingSheet = createMockSheet('schedule_1719000000000');
    const gas = createGasEnv({
      sheets: { Data: dataSheet, schedule_1719000000000: existingSheet },
      userEmail: 'user@test.com',
    });

    const result = gas.addSchedule({
      id: 'schedule_1719000000000',
      name: 'Duplicate',
      metadataTimestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('已存在');
  });

  it('rejects on metadata conflict', () => {
    const dataSheet = createMockSheet('Data', {
      F1: '2024-01-01T00:00:00.000Z',
    });
    const gas = createGasEnv({
      sheets: { Data: dataSheet },
      userEmail: 'user@test.com',
    });

    const result = gas.addSchedule({
      id: 'schedule_1719000000001',
      name: 'Test',
      metadataTimestamp: '1999-01-01T00:00:00.000Z', // stale timestamp
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── saveData ────────────────────────────────────────────────────────────

describe('saveData', () => {
  function createSaveEnv(overrides = {}) {
    const ts = '2024-06-15T10:30:00.000Z';
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy', E1: 'Draft',
      F1: ts,
      A2: 'schedule_1', B2: 'My Schedule', C2: ts, D2: overrides.creator || 'owner@test.com', E2: false,
    });
    const scheduleSheet = createMockSheet('schedule_1', {
      A1: 'Key', B1: 'Value',
      A2: 'scheduleData', B2: '{}',
      A3: 'classrooms', B3: '[]',
      A4: 'tags', B4: '[]',
    });
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'Data', D1: 'ScheduleId',
    });
    const sheets = {
      Data: dataSheet,
      schedule_1: scheduleSheet,
      History: historySheet,
      ...overrides.sheets,
    };
    return createGasEnv({
      sheets,
      userEmail: overrides.userEmail || 'owner@test.com',
      scriptProps: overrides.scriptProps || { ADMIN_EMAIL: 'admin@test.com' },
    });
  }

  it('saves data successfully (happy path)', () => {
    const gas = createSaveEnv();
    const result = gas.saveData({
      scheduleId: 'schedule_1',
      scheduleData: {
        scheduleData: { room1: { 1: [{ name: 'Math' }] } },
        classrooms: ['room1'],
        tags: ['tag1'],
      },
      lastModified: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.lastModified).toBeTruthy();
    expect(new Date(result.lastModified).toISOString()).toBe(result.lastModified);
  });

  it('returns conflict on timestamp mismatch', () => {
    const gas = createSaveEnv();
    const result = gas.saveData({
      scheduleId: 'schedule_1',
      scheduleData: { scheduleData: {}, classrooms: [], tags: [] },
      lastModified: '2020-01-01T00:00:00.000Z', // stale
    });
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.error).toContain('已被他人修改');
  });

  it('throws when scheduleId does not exist in Data index', () => {
    const gas = createSaveEnv();
    const result = gas.saveData({
      scheduleId: 'schedule_nonexistent',
      scheduleData: { scheduleData: {}, classrooms: [], tags: [] },
      lastModified: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('找不到');
  });

  it('rejects unauthorized user', () => {
    const gas = createSaveEnv({ userEmail: 'hacker@test.com' });
    const result = gas.saveData({
      scheduleId: 'schedule_1',
      scheduleData: { scheduleData: {}, classrooms: [], tags: [] },
      lastModified: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('權限不足');
  });

  it('returns error on invalid payload (missing fields)', () => {
    const gas = createSaveEnv();
    const result = gas.saveData({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('無效的數據格式');
  });
});

// ─── deleteSchedule ──────────────────────────────────────────────────────

describe('deleteSchedule', () => {
  function createDeleteEnv(overrides = {}) {
    const ts = '2024-06-15T10:30:00.000Z';
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy',
      F1: ts,
      A2: 'schedule_1', B2: 'My Schedule', C2: ts, D2: overrides.creator || 'owner@test.com',
    });
    const scheduleSheet = createMockSheet('schedule_1');
    return createGasEnv({
      sheets: { Data: dataSheet, schedule_1: scheduleSheet, ...overrides.sheets },
      userEmail: overrides.userEmail || 'owner@test.com',
      scriptProps: overrides.scriptProps || { ADMIN_EMAIL: 'admin@test.com' },
    });
  }

  it('deletes schedule successfully', () => {
    const gas = createDeleteEnv();
    const result = gas.deleteSchedule({
      id: 'schedule_1',
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.newMetadataTimestamp).toBeTruthy();
  });

  it('returns success for non-existent schedule (idempotent)', () => {
    const gas = createDeleteEnv();
    const result = gas.deleteSchedule({
      id: 'schedule_nonexistent',
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unauthorized user', () => {
    const gas = createDeleteEnv({ userEmail: 'hacker@test.com' });
    const result = gas.deleteSchedule({
      id: 'schedule_1',
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('權限不足');
  });
});

// ─── getVersions ─────────────────────────────────────────────────────────

describe('getVersions', () => {
  it('returns versions for a schedule', () => {
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'Data', D1: 'ScheduleId',
      A2: '2024-06-15T10:30:00.000Z', B2: 'user@test.com', C2: '{}', D2: 'schedule_1',
      A3: '2024-06-15T11:00:00.000Z', B3: 'admin@test.com', C3: '{}', D3: 'schedule_1',
      A4: '2024-06-15T12:00:00.000Z', B4: 'other@test.com', C4: '{}', D4: 'schedule_2',
    });
    const gas = createGasEnv({ sheets: { History: historySheet } });

    const result = gas.getVersions('schedule_1');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].user).toBe('user@test.com');
    expect(result[1].user).toBe('admin@test.com');
  });

  it('returns empty array when no history', () => {
    const historySheet = createMockSheet('History', {
      A1: 'Timestamp', B1: 'SavedBy', C1: 'Data', D1: 'ScheduleId',
    });
    const gas = createGasEnv({ sheets: { History: historySheet } });

    const result = gas.getVersions('schedule_1');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('returns error on missing scheduleId', () => {
    const gas = createGasEnv({});

    const result = gas.getVersions(null);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── updateScheduleMetadata (renamed from renameSchedule, #67.5) ──────────

describe('updateScheduleMetadata', () => {
  function createRenameEnv(overrides = {}) {
    const ts = '2024-06-15T10:30:00.000Z';
    const dataSheet = createMockSheet('Data', {
      A1: 'ID', B1: 'Name', C1: 'Modified', D1: 'CreatedBy', E1: 'Draft',
      F1: ts,
      A2: 'schedule_1', B2: 'Old Name', C2: ts, D2: overrides.creator || 'owner@test.com', E2: false,
    });
    return createGasEnv({
      sheets: { Data: dataSheet, ...overrides.sheets },
      userEmail: overrides.userEmail || 'owner@test.com',
      scriptProps: overrides.scriptProps || { ADMIN_EMAIL: 'admin@test.com' },
    });
  }

  it('renames schedule successfully', () => {
    const gas = createRenameEnv();
    const result = gas.updateScheduleMetadata({
      id: 'schedule_1',
      newName: 'New Name',
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.lastModified).toBeTruthy();
  });

  it('updates isDraft status', () => {
    const gas = createRenameEnv();
    const result = gas.updateScheduleMetadata({
      id: 'schedule_1',
      isDraft: true,
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unauthorized user', () => {
    const gas = createRenameEnv({ userEmail: 'hacker@test.com' });
    const result = gas.updateScheduleMetadata({
      id: 'schedule_1',
      newName: 'Hacked',
      metadataTimestamp: '2024-06-15T10:30:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('權限不足');
  });
});

// ─── _getSs memoization (#64) ────────────────────────────────────────────

describe('_getSs memoization (#64)', () => {
  it('returns a spreadsheet object', () => {
    const dataSheet = createMockSheet('Data', {});
    const gas = createGasEnv({ sheets: { Data: dataSheet } });
    const ss = gas._getSs();
    expect(ss).toBeTruthy();
    expect(typeof ss.getSheetByName).toBe('function');
  });
});

// ─── getSheet vs getOrCreateSheet (#44) ──────────────────────────────────

describe('getSheet vs getOrCreateSheet (#44)', () => {
  it('getSheet returns null for non-existent sheet (read path)', () => {
    const gas = createGasEnv({ sheets: {} });
    const result = gas.getSheet('NonExistent');
    expect(result).toBeNull();
  });

  it('getSheet returns sheet when it exists', () => {
    const dataSheet = createMockSheet('Data', {});
    const gas = createGasEnv({ sheets: { Data: dataSheet } });
    const result = gas.getSheet('Data');
    expect(result).toBeTruthy();
    expect(result.getName()).toBe('Data');
  });

  it('getOrCreateSheet creates sheet when missing (write path)', () => {
    const gas = createGasEnv({ sheets: {} });
    const result = gas.getOrCreateSheet('Data');
    expect(result).toBeTruthy();
    expect(result.getName()).toBe('Data');
  });

  it('getOrCreateSheet returns existing sheet without recreating', () => {
    const dataSheet = createMockSheet('Data', { A1: 'existing' });
    const gas = createGasEnv({ sheets: { Data: dataSheet } });
    const result = gas.getOrCreateSheet('Data');
    expect(result).toBeTruthy();
    expect(result.getName()).toBe('Data');
  });
});

// ─── getData batch optimization (#15) ────────────────────────────────────

describe('getData batch optimization (#15)', () => {
  it('returns gracefully when Data sheet does not exist', () => {
    const gas = createGasEnv({ sheets: {} });
    const result = gas.getData();
    expect(result.success).toBe(true);
    expect(result.schedules).toEqual({});
  });
});

// ─── getVersions/getVersionData null sheet guard (#44) ───────────────────

describe('getVersions with null sheet (#44)', () => {
  it('returns empty array when History sheet does not exist', () => {
    const gas = createGasEnv({ sheets: {} });
    const result = gas.getVersions('schedule_1');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe('getVersionData with null sheet (#44)', () => {
  it('returns not-found when History sheet does not exist', () => {
    const gas = createGasEnv({ sheets: {} });
    const result = gas.getVersionData('2024-01-01T00:00:00.000Z');
    expect(result.success).toBe(false);
    expect(result.error).toContain('找不到');
  });
});
