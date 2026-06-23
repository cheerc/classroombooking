import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestableHistoryModule } from '../lib/undoRedoHelpers.js';

describe('Undo/Redo State Integrity (#135)', () => {
  // Helper: create a simple state factory with mutable app state
  function createTestContext(initialState = { classrooms: ['A'], scheduleData: {}, tags: [] }) {
    let appState = structuredClone(initialState);
    const callbacks = {
      onLoadState: vi.fn((state) => {
        appState = structuredClone(state);
      }),
      onUpdateButtons: vi.fn(),
      onCheckDirty: vi.fn(),
      onUpdateCleanSnapshot: vi.fn(),
    };
    const module = createTestableHistoryModule({
      getCurrentState: () => structuredClone(appState),
      ...callbacks,
    });
    return { module, getAppState: () => appState, setAppState: (s) => { appState = s; }, callbacks };
  }

  describe('saveState', () => {
    it('should save initial state to stack', () => {
      const { module } = createTestContext();
      module.saveState();
      expect(module.getStack()).toHaveLength(1);
      expect(module.getIndex()).toBe(0);
    });

    it('should save multiple distinct states', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['A', 'B'], scheduleData: {}, tags: [] });
      module.saveState();
      expect(module.getStack()).toHaveLength(2);
      expect(module.getIndex()).toBe(1);
    });

    it('should dedup identical consecutive states', () => {
      const { module } = createTestContext();
      module.saveState();
      module.saveState(); // Same state
      module.saveState(); // Same state again
      expect(module.getStack()).toHaveLength(1);
      expect(module.getIndex()).toBe(0);
    });

    it('should truncate redo branch on new action', () => {
      const { module, setAppState } = createTestContext();
      // Save 3 states
      module.saveState(); // state 0
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState(); // state 1
      setAppState({ classrooms: ['C'], scheduleData: {}, tags: [] });
      module.saveState(); // state 2

      // Undo twice (back to state 0)
      module.undo();
      module.undo();
      expect(module.getIndex()).toBe(0);

      // New action should truncate the redo branch
      setAppState({ classrooms: ['D'], scheduleData: {}, tags: [] });
      module.saveState();

      expect(module.getStack()).toHaveLength(2); // state 0 + new state D
      expect(module.getIndex()).toBe(1);
      expect(module.canRedo()).toBe(false); // Redo branch truncated
    });

    it('should cap history at 50 entries', () => {
      const { module, setAppState } = createTestContext();
      for (let i = 0; i < 55; i++) {
        setAppState({ classrooms: [`Room-${i}`], scheduleData: {}, tags: [] });
        module.saveState();
      }
      expect(module.getStack()).toHaveLength(50);
      // Index should be at the end
      expect(module.getIndex()).toBe(49);
    });

    it('should shift oldest when exceeding cap', () => {
      const { module, setAppState } = createTestContext();
      for (let i = 0; i < 52; i++) {
        setAppState({ classrooms: [`Room-${i}`], scheduleData: {}, tags: [] });
        module.saveState();
      }
      // The first 2 entries should have been shifted out
      const stack = module.getStack();
      expect(stack[0].classrooms[0]).toBe('Room-2');
      expect(stack[49].classrooms[0]).toBe('Room-51');
    });

    it('should call onUpdateButtons and onCheckDirty', () => {
      const { module, callbacks } = createTestContext();
      module.saveState();
      expect(callbacks.onUpdateButtons).toHaveBeenCalledTimes(1);
      expect(callbacks.onCheckDirty).toHaveBeenCalledTimes(1);
    });
  });

  describe('undo', () => {
    it('should restore previous state', () => {
      const { module, setAppState, getAppState, callbacks } = createTestContext();
      const originalState = { classrooms: ['A'], scheduleData: {}, tags: [] };
      module.saveState(); // state 0 = A
      setAppState({ classrooms: ['A', 'B'], scheduleData: {}, tags: [] });
      module.saveState(); // state 1 = A,B

      module.undo();
      expect(callbacks.onLoadState).toHaveBeenCalledTimes(1);
      expect(getAppState().classrooms).toEqual(['A']);
      expect(module.getIndex()).toBe(0);
    });

    it('should handle consecutive undos', () => {
      const { module, setAppState, getAppState } = createTestContext();
      module.saveState(); // 0: A
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState(); // 1: B
      setAppState({ classrooms: ['C'], scheduleData: {}, tags: [] });
      module.saveState(); // 2: C

      module.undo(); // → 1: B
      expect(getAppState().classrooms).toEqual(['B']);
      module.undo(); // → 0: A
      expect(getAppState().classrooms).toEqual(['A']);
      expect(module.getIndex()).toBe(0);
    });

    it('should not go below index 0 (empty stack boundary)', () => {
      const { module, callbacks } = createTestContext();
      module.saveState(); // Only one state
      module.undo(); // Should be no-op (already at 0)
      expect(callbacks.onLoadState).not.toHaveBeenCalled();
      expect(module.getIndex()).toBe(0);
    });

    it('should not call onLoadState when at boundary', () => {
      const { module, callbacks } = createTestContext();
      module.saveState();
      module.undo();
      module.undo(); // Extra undo at boundary
      module.undo(); // Another extra
      expect(callbacks.onLoadState).not.toHaveBeenCalled();
    });
  });

  describe('redo', () => {
    it('should restore next state after undo', () => {
      const { module, setAppState, getAppState, callbacks } = createTestContext();
      module.saveState(); // 0: A
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState(); // 1: B

      module.undo(); // → 0: A
      expect(getAppState().classrooms).toEqual(['A']);

      module.redo(); // → 1: B
      expect(getAppState().classrooms).toEqual(['B']);
      expect(module.getIndex()).toBe(1);
    });

    it('should handle consecutive redos', () => {
      const { module, setAppState, getAppState } = createTestContext();
      module.saveState(); // 0: A
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState(); // 1: B
      setAppState({ classrooms: ['C'], scheduleData: {}, tags: [] });
      module.saveState(); // 2: C

      module.undo(); // → 1
      module.undo(); // → 0

      module.redo(); // → 1: B
      expect(getAppState().classrooms).toEqual(['B']);
      module.redo(); // → 2: C
      expect(getAppState().classrooms).toEqual(['C']);
    });

    it('should not go beyond stack length (boundary)', () => {
      const { module, setAppState, callbacks } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();

      // Already at end — redo should be no-op
      module.redo();
      expect(callbacks.onLoadState).not.toHaveBeenCalled();
      expect(module.getIndex()).toBe(1);
    });

    it('should not call onLoadState when at end boundary', () => {
      const { module, callbacks } = createTestContext();
      module.saveState();
      module.redo(); // No redo available
      module.redo(); // Extra
      expect(callbacks.onLoadState).not.toHaveBeenCalled();
    });
  });

  describe('undo + redo interleaved', () => {
    it('should maintain state integrity through undo/redo cycles', () => {
      const { module, setAppState, getAppState } = createTestContext();
      const states = [
        { classrooms: ['A'], scheduleData: {}, tags: [] },
        { classrooms: ['B'], scheduleData: {}, tags: ['x'] },
        { classrooms: ['C'], scheduleData: { r1: {} }, tags: ['y'] },
      ];

      // Save all 3 states
      module.saveState(); // 0: A
      setAppState(structuredClone(states[1]));
      module.saveState(); // 1: B
      setAppState(structuredClone(states[2]));
      module.saveState(); // 2: C

      // Undo to B
      module.undo();
      expect(getAppState().classrooms).toEqual(['B']);
      expect(getAppState().tags).toEqual(['x']);

      // Redo to C
      module.redo();
      expect(getAppState().classrooms).toEqual(['C']);
      expect(getAppState().tags).toEqual(['y']);

      // Undo to B again
      module.undo();
      expect(getAppState().classrooms).toEqual(['B']);

      // Undo to A
      module.undo();
      expect(getAppState().classrooms).toEqual(['A']);

      // Redo all the way
      module.redo(); // B
      module.redo(); // C
      expect(getAppState().classrooms).toEqual(['C']);

      // One more redo should be no-op
      module.redo();
      expect(getAppState().classrooms).toEqual(['C']);
    });

    it('should not corrupt stack with rapid undo/redo', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['X'], scheduleData: {}, tags: [] });
      module.saveState();

      // Rapid back and forth
      for (let i = 0; i < 10; i++) {
        module.undo();
        module.redo();
      }
      expect(module.getStack()).toHaveLength(2);
      expect(module.getIndex()).toBe(1);
    });
  });

  describe('resetHistory', () => {
    it('should clear stack and set single entry', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();
      setAppState({ classrooms: ['C'], scheduleData: {}, tags: [] });
      module.saveState();

      expect(module.getStack()).toHaveLength(3);

      module.resetHistory();
      expect(module.getStack()).toHaveLength(1);
      expect(module.getIndex()).toBe(0);
      expect(module.getStack()[0].classrooms).toEqual(['C']); // Current state
    });

    it('should call onUpdateButtons, onUpdateCleanSnapshot, onCheckDirty', () => {
      const { module, callbacks } = createTestContext();
      module.resetHistory();
      expect(callbacks.onUpdateButtons).toHaveBeenCalled();
      expect(callbacks.onUpdateCleanSnapshot).toHaveBeenCalled();
      expect(callbacks.onCheckDirty).toHaveBeenCalled();
    });

    it('should disable undo and redo after reset', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();

      module.resetHistory();
      expect(module.canUndo()).toBe(false);
      expect(module.canRedo()).toBe(false);
    });
  });

  describe('canUndo / canRedo', () => {
    it('canUndo false with empty/single-entry stack', () => {
      const { module } = createTestContext();
      expect(module.canUndo()).toBe(false);
      module.saveState();
      expect(module.canUndo()).toBe(false); // Only 1 entry
    });

    it('canUndo true with multiple entries', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();
      expect(module.canUndo()).toBe(true);
    });

    it('canRedo false at end of stack', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();
      expect(module.canRedo()).toBe(false);
    });

    it('canRedo true after undo', () => {
      const { module, setAppState } = createTestContext();
      module.saveState();
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState();
      module.undo();
      expect(module.canRedo()).toBe(true);
    });
  });

  describe('state isolation (structuredClone)', () => {
    it('saved states should be independent copies', () => {
      const { module, setAppState, getAppState } = createTestContext();
      const shared = { classrooms: ['Shared'], scheduleData: {}, tags: [] };
      setAppState(shared);
      module.saveState();

      // Mutate the original object
      shared.classrooms.push('Mutated');

      // Stack entry should not be affected
      expect(module.getStack()[0].classrooms).toEqual(['Shared']);
    });

    it('undo/redo loaded states should be independent copies', () => {
      const { module, setAppState, getAppState } = createTestContext();
      module.saveState(); // 0: A
      setAppState({ classrooms: ['B'], scheduleData: {}, tags: [] });
      module.saveState(); // 1: B

      module.undo(); // Load state 0
      const loadedState = getAppState();
      loadedState.classrooms.push('Mutated');

      // Redo should still get the original state 1, not affected by mutation
      module.redo();
      expect(getAppState().classrooms).toEqual(['B']);
    });
  });

  describe('complex scheduleData through undo/redo', () => {
    it('should correctly restore complex nested scheduleData', () => {
      const { module, setAppState, getAppState } = createTestContext();
      const state0 = {
        classrooms: ['Room1'],
        scheduleData: {
          Room1: {
            0: [{ id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00' }],
          },
        },
        tags: ['math'],
      };
      const state1 = {
        classrooms: ['Room1', 'Room2'],
        scheduleData: {
          Room1: {
            0: [
              { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00' },
              { id: '2', name: 'Science', timeStart: '09:00', timeEnd: '10:00' },
            ],
          },
          Room2: {
            1: [{ id: '3', name: 'English', timeStart: '10:00', timeEnd: '11:00' }],
          },
        },
        tags: ['math', 'science'],
      };

      setAppState(structuredClone(state0));
      module.saveState();
      setAppState(structuredClone(state1));
      module.saveState();

      // Undo should restore state0
      module.undo();
      const restored = getAppState();
      expect(restored.classrooms).toEqual(['Room1']);
      expect(restored.scheduleData.Room1[0]).toHaveLength(1);
      expect(restored.scheduleData.Room1[0][0].name).toBe('Math');
      expect(restored.scheduleData.Room2).toBeUndefined();

      // Redo should restore state1
      module.redo();
      const redone = getAppState();
      expect(redone.classrooms).toEqual(['Room1', 'Room2']);
      expect(redone.scheduleData.Room1[0]).toHaveLength(2);
      expect(redone.scheduleData.Room2[1][0].name).toBe('English');
    });
  });
});
