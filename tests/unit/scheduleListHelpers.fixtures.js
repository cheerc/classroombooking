/**
 * Fixture factories for #131 handleScheduleListClick branch tests.
 * Follows established pattern from stateHelpers.fixtures.js (makeSaveCtx, makeEditCtx).
 */
import { vi } from 'vitest';

/**
 * Creates a schedule list context (App state) for testing.
 * @param {object} overrides - Override any default property.
 */
export function makeScheduleListCtx(overrides = {}) {
  return {
    schedules: overrides.schedules ?? {
      schedule_1: {
        name: '測試課表一',
        createdBy: 'test@example.com',
        isDraft: false,
        data: { scheduleData: [{ id: 'c1', name: '數學' }], classrooms: ['101'], tags: [] },
      },
      schedule_2: {
        name: '測試課表二',
        createdBy: 'test@example.com',
        isDraft: true,
        data: { scheduleData: [], classrooms: [], tags: [] },
      },
    },
    scheduleLastModified: overrides.scheduleLastModified ?? {
      schedule_1: '2024-01-01T00:00:00.000Z',
      schedule_2: '2024-01-01T00:00:00.000Z',
    },
    activeScheduleId: overrides.activeScheduleId ?? 'schedule_1',
    activeMetadataTimestamp: overrides.activeMetadataTimestamp ?? '2024-01-01T00:00:00.000Z',
  };
}

/**
 * Creates injected dependencies for schedule list helpers.
 * Matches the DI pattern used in scheduleListHelpers.js.
 * @param {object} handlerOverrides - Override specific ServerApi handlers.
 */
export function makeScheduleListDeps(handlerOverrides = {}) {
  return {
    ServerApi: {
      call: vi.fn(async (fnName, ...args) => {
        const handlers = {
          updateScheduleMetadata: () => ({
            success: true,
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
            lastModified: '2024-01-01T00:01:00.000Z',
          }),
          deleteSchedule: () => ({
            success: true,
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
          }),
          copySchedule: () => ({
            success: true,
            newId: 'schedule_new_' + Date.now(),
            createdBy: 'test@example.com',
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
            lastModified: '2024-01-01T00:01:00.000Z',
            isDraft: false,
          }),
          ...handlerOverrides,
        };
        const handler = handlers[fnName];
        if (!handler) throw new Error(`Unmocked function: ${fnName}`);
        return handler(...args);
      }),
    },
    modals: {
      showScheduleEditor: vi.fn().mockResolvedValue(null),
      showConfirm: vi.fn().mockResolvedValue(false),
      showPrompt: vi.fn().mockResolvedValue(null),
    },
    ui: {
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
      showNotification: vi.fn(),
      renderScheduleList: vi.fn(),
      updateScheduleSelect: vi.fn(),
    },
    loadSchedule: vi.fn(),
  };
}
