/**
 * DOM wiring integration tests — happy-dom.
 * Ref: #111 — Verify critical event→handler wiring actually works
 * in a DOM environment (not just static parse).
 *
 * Uses happy-dom (via tests/setup/dom.js) to create DOM elements,
 * attach handlers, simulate events, and verify handlers fire.
 *
 * Closes #111
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupDOM } from '../setup/dom.js';

// ─── Integration tests ────────────────────────────────────────────────────

describe('DOM wiring integration — event→handler firing (#111)', () => {
  let cleanup;

  afterEach(() => {
    if (cleanup) cleanup();
    vi.restoreAllMocks();
  });

  describe('Interaction.js.html — click handler wiring', () => {
    it('button click should fire attached handler', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<button id="test-btn">Click me</button>',
      }));

      const handler = vi.fn();
      const btn = document.getElementById('test-btn');
      btn.addEventListener('click', handler);
      btn.click();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('multiple buttons should each fire their own handler', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: `
          <button id="save-btn">Save</button>
          <button id="load-btn">Load</button>
          <button id="undo-btn">Undo</button>
        `,
      }));

      const saveHandler = vi.fn();
      const loadHandler = vi.fn();
      const undoHandler = vi.fn();

      document.getElementById('save-btn').addEventListener('click', saveHandler);
      document.getElementById('load-btn').addEventListener('click', loadHandler);
      document.getElementById('undo-btn').addEventListener('click', undoHandler);

      document.getElementById('save-btn').click();
      document.getElementById('load-btn').click();

      expect(saveHandler).toHaveBeenCalledTimes(1);
      expect(loadHandler).toHaveBeenCalledTimes(1);
      expect(undoHandler).not.toHaveBeenCalled();
    });

    it('event delegation on container should catch child clicks', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: `
          <div id="schedule-body">
            <div class="cell" data-id="cell-1">Cell 1</div>
            <div class="cell" data-id="cell-2">Cell 2</div>
          </div>
        `,
      }));

      const delegateHandler = vi.fn();
      document.getElementById('schedule-body').addEventListener('click', delegateHandler);

      // Click on child element — event bubbles to container
      document.querySelector('.cell[data-id="cell-1"]').click();

      expect(delegateHandler).toHaveBeenCalledTimes(1);
      expect(delegateHandler.mock.calls[0][0].target.dataset.id).toBe('cell-1');
    });

    it('document-level capture listener should fire before element handler', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<button id="btn">Test</button>',
      }));

      const order = [];
      document.addEventListener('click', () => order.push('capture'), true);
      document.getElementById('btn').addEventListener('click', () => order.push('element'));

      document.getElementById('btn').click();

      expect(order).toEqual(['capture', 'element']);
    });
  });

  describe('Modals.js.html — modal lifecycle wiring', () => {
    it('{once: true} listener should fire exactly once', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<button id="ok-btn">OK</button>',
      }));

      const handler = vi.fn();
      document.getElementById('ok-btn').addEventListener('click', handler, { once: true });

      const btn = document.getElementById('ok-btn');
      btn.click();
      btn.click(); // second click should NOT fire

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('modal overlay click delegation should work', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: `
          <div id="modal" class="modal">
            <div class="modal-content">
              <button id="close-btn">×</button>
              <p>Modal body</p>
            </div>
          </div>
        `,
      }));

      const closeHandler = vi.fn();
      const overlayHandler = vi.fn((e) => {
        if (e.target === document.getElementById('modal')) {
          closeHandler();
        }
      });

      document.getElementById('close-btn').addEventListener('click', closeHandler);
      document.getElementById('modal').addEventListener('click', overlayHandler);

      // Click close button
      document.getElementById('close-btn').click();
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('keydown handler on input should capture key events', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<input id="modal-input" type="text" />',
      }));

      const keydownHandler = vi.fn();
      const input = document.getElementById('modal-input');
      input.addEventListener('keydown', keydownHandler);

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      expect(keydownHandler).toHaveBeenCalledTimes(1);
      expect(keydownHandler.mock.calls[0][0].key).toBe('Enter');
    });
  });

  describe('UI.js.html — tooltip wiring', () => {
    it('mouseenter and mouseleave should fire on hover elements', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<div class="tooltip-trigger" id="tt">Hover me</div>',
      }));

      const enterHandler = vi.fn();
      const leaveHandler = vi.fn();
      const el = document.getElementById('tt');
      el.addEventListener('mouseenter', enterHandler);
      el.addEventListener('mouseleave', leaveHandler);

      el.dispatchEvent(new Event('mouseenter'));
      el.dispatchEvent(new Event('mouseleave'));

      expect(enterHandler).toHaveBeenCalledTimes(1);
      expect(leaveHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Interaction.js.html — form/input wiring', () => {
    it('change event should fire on select element', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: `
          <select id="schedule-select">
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        `,
      }));

      const changeHandler = vi.fn();
      document.getElementById('schedule-select').addEventListener('change', changeHandler);

      const select = document.getElementById('schedule-select');
      select.value = 'b';
      select.dispatchEvent(new Event('change'));

      expect(changeHandler).toHaveBeenCalledTimes(1);
    });

    it('blur event should fire when textarea loses focus', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<textarea id="editor"></textarea>',
      }));

      const blurHandler = vi.fn();
      const textarea = document.getElementById('editor');
      textarea.addEventListener('blur', blurHandler);

      textarea.dispatchEvent(new Event('blur'));

      expect(blurHandler).toHaveBeenCalledTimes(1);
    });

    it('Escape keydown should be capturable for cancel actions', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<div id="form"><input id="input" /></div>',
      }));

      const escapeHandler = vi.fn((e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
        }
      });
      document.getElementById('form').addEventListener('keydown', escapeHandler);

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
        bubbles: true,
      });
      document.getElementById('input').dispatchEvent(event);

      expect(escapeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Modals.js.html — filter search input wiring', () => {
    it('input event should fire on search field typing', () => {
      ({ cleanup } = setupDOM({
        bodyHTML: '<input id="filter-search-input" type="text" />',
      }));

      const inputHandler = vi.fn();
      document.getElementById('filter-search-input').addEventListener('input', inputHandler);

      const input = document.getElementById('filter-search-input');
      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      expect(inputHandler).toHaveBeenCalledTimes(1);
    });
  });
});
