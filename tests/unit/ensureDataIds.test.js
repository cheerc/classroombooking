import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureDataIds, generateUniqueId } from '../lib/dataIdHelpers.js';

describe('ensureDataIds Idempotency (#137)', () => {
  // Deterministic ID generator for testing
  let idCounter;
  function deterministicId() {
    return `test-id-${++idCounter}`;
  }

  beforeEach(() => {
    idCounter = 0;
  });

  describe('adding IDs to items without them', () => {
    it('should add ID to a single item without id', () => {
      const data = {
        Room1: {
          0: [{ name: 'Math', timeStart: '08:00', timeEnd: '09:00' }],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('test-id-1');
    });

    it('should add IDs to multiple items without ids', () => {
      const data = {
        Room1: {
          0: [
            { name: 'Math', timeStart: '08:00', timeEnd: '09:00' },
            { name: 'Science', timeStart: '09:00', timeEnd: '10:00' },
          ],
          1: [
            { name: 'English', timeStart: '10:00', timeEnd: '11:00' },
          ],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('test-id-1');
      expect(result.Room1[0][1].id).toBe('test-id-2');
      expect(result.Room1[1][0].id).toBe('test-id-3');
    });

    it('should add IDs across multiple classrooms', () => {
      const data = {
        Room1: {
          0: [{ name: 'Math' }],
        },
        Room2: {
          0: [{ name: 'Art' }],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('test-id-1');
      expect(result.Room2[0][0].id).toBe('test-id-2');
    });
  });

  describe('preserving existing IDs (idempotency)', () => {
    it('should not change items that already have IDs', () => {
      const data = {
        Room1: {
          0: [{ id: 'existing-1', name: 'Math' }],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('existing-1');
      // deterministicId should NOT have been called
      expect(idCounter).toBe(0);
    });

    it('should be idempotent — multiple calls yield same result', () => {
      const data = {
        Room1: {
          0: [{ name: 'Math' }],
        },
      };
      // First call adds IDs
      ensureDataIds(data, deterministicId);
      const idAfterFirst = data.Room1[0][0].id;

      // Reset counter
      idCounter = 100;

      // Second call should not change existing IDs
      ensureDataIds(data, deterministicId);
      expect(data.Room1[0][0].id).toBe(idAfterFirst);
      // Counter should not have advanced (no new IDs generated)
      expect(idCounter).toBe(100);
    });

    it('should be idempotent after three consecutive calls', () => {
      const data = {
        Room1: {
          0: [{ name: 'A' }, { name: 'B' }],
          1: [{ name: 'C' }],
        },
      };
      ensureDataIds(data, deterministicId);
      const snapshot1 = JSON.stringify(data);

      ensureDataIds(data, deterministicId);
      const snapshot2 = JSON.stringify(data);

      ensureDataIds(data, deterministicId);
      const snapshot3 = JSON.stringify(data);

      expect(snapshot1).toBe(snapshot2);
      expect(snapshot2).toBe(snapshot3);
    });
  });

  describe('mixed — partial IDs', () => {
    it('should only add IDs to items missing them', () => {
      const data = {
        Room1: {
          0: [
            { id: 'keep-me', name: 'Math' },
            { name: 'Science' }, // No id
          ],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('keep-me');
      expect(result.Room1[0][1].id).toBe('test-id-1');
    });

    it('should handle mix across classrooms and days', () => {
      const data = {
        Room1: {
          0: [{ id: 'r1d0', name: 'A' }],
          1: [{ name: 'B' }], // No id
        },
        Room2: {
          0: [{ name: 'C' }], // No id
          2: [{ id: 'r2d2', name: 'D' }],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0].id).toBe('r1d0');
      expect(result.Room1[1][0].id).toBe('test-id-1');
      expect(result.Room2[0][0].id).toBe('test-id-2');
      expect(result.Room2[2][0].id).toBe('r2d2');
    });
  });

  describe('edge cases', () => {
    it('should return {} for null input', () => {
      expect(ensureDataIds(null, deterministicId)).toEqual({});
    });

    it('should return {} for undefined input', () => {
      expect(ensureDataIds(undefined, deterministicId)).toEqual({});
    });

    it('should return {} for falsy input (empty string)', () => {
      expect(ensureDataIds('', deterministicId)).toEqual({});
    });

    it('should return {} for falsy input (0)', () => {
      expect(ensureDataIds(0, deterministicId)).toEqual({});
    });

    it('should handle empty scheduleData object', () => {
      const data = {};
      const result = ensureDataIds(data, deterministicId);
      expect(result).toEqual({});
      expect(idCounter).toBe(0);
    });

    it('should handle classroom with no days', () => {
      const data = { Room1: {} };
      const result = ensureDataIds(data, deterministicId);
      expect(result).toEqual({ Room1: {} });
      expect(idCounter).toBe(0);
    });

    it('should handle empty day array', () => {
      const data = { Room1: { 0: [] } };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0]).toEqual([]);
      expect(idCounter).toBe(0);
    });

    it('should skip null classroom values gracefully', () => {
      const data = { Room1: null, Room2: { 0: [{ name: 'A' }] } };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1).toBeNull();
      expect(result.Room2[0][0].id).toBe('test-id-1');
    });

    it('should skip non-array day values gracefully', () => {
      const data = {
        Room1: {
          0: 'not-an-array',
          1: [{ name: 'A' }],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0]).toBe('not-an-array');
      expect(result.Room1[1][0].id).toBe('test-id-1');
    });

    it('should skip null items in day array', () => {
      const data = {
        Room1: {
          0: [null, { name: 'A' }, null],
        },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result.Room1[0][0]).toBeNull();
      expect(result.Room1[0][1].id).toBe('test-id-1');
      expect(result.Room1[0][2]).toBeNull();
    });
  });

  describe('ID format (generateUniqueId)', () => {
    it('should generate non-empty string IDs', () => {
      const id = generateUniqueId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs on consecutive calls', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateUniqueId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with base-36 characters', () => {
      const id = generateUniqueId();
      // base-36 = [0-9a-z]
      expect(id).toMatch(/^[0-9a-z]+$/);
    });
  });

  describe('mutation behavior', () => {
    it('should mutate the input object in place', () => {
      const data = {
        Room1: { 0: [{ name: 'A' }] },
      };
      const result = ensureDataIds(data, deterministicId);
      expect(result).toBe(data); // Same reference
      expect(data.Room1[0][0].id).toBe('test-id-1');
    });

    it('should return the same reference as input', () => {
      const data = { Room1: { 0: [{ id: 'x', name: 'A' }] } };
      const result = ensureDataIds(data, deterministicId);
      expect(result).toBe(data);
    });
  });
});
