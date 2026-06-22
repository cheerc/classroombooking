/**
 * DOM testing setup for happy-dom environment.
 * Ref: #89 — Wave 1B test infrastructure
 *
 * Usage in vitest test files:
 *   // At the top of your test file:
 *   // @vitest-environment happy-dom
 *
 *   // Or import setup helpers:
 *   import { setupDOM, cleanupDOM } from '../setup/dom.js';
 *
 * This module provides helpers for DOM testing in the classroombooking
 * frontend context (GAS HTML scriptlet environment).
 */

/**
 * Sets up a minimal DOM environment with common classroombooking elements.
 * Call in beforeEach() for tests that need DOM interaction.
 *
 * @param {Object} [opts] - Options for DOM setup
 * @param {string} [opts.bodyHTML=''] - Initial body HTML content
 * @param {Object} [opts.globals={}] - GAS template-injected globals to set
 *   (e.g. { IS_ADMIN: true, SCRIPT_USER_EMAIL: 'user@example.com' })
 * @returns {{ cleanup: function }} Cleanup function to call in afterEach()
 */
export function setupDOM({ bodyHTML = '', globals = {} } = {}) {
  // Set body content
  document.body.innerHTML = bodyHTML;

  // Inject GAS template globals (IS_ADMIN, SCRIPT_USER_EMAIL, etc.)
  const injectedKeys = [];
  for (const [key, value] of Object.entries(globals)) {
    globalThis[key] = value;
    injectedKeys.push(key);
  }

  return {
    cleanup: () => {
      document.body.innerHTML = '';
      for (const key of injectedKeys) {
        delete globalThis[key];
      }
    },
  };
}

/**
 * Cleans up DOM state. Call in afterEach() if not using the cleanup
 * function returned by setupDOM().
 */
export function cleanupDOM() {
  document.body.innerHTML = '';
}
