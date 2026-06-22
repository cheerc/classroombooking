/**
 * Api.js.html wiring contract tests — ServerApi method existence & error fallback.
 * Ref: #117 — Verify ServerApi.call method works correctly when google.script
 * is unavailable, matching the error fallback pattern in Api.js.html.
 *
 * Strategy: Parse Api.js.html to extract the ServerApi object structure,
 * then test the error fallback behavior using the mock from frontendMocks.js.
 *
 * Closes #117
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMockServerApi } from '../mocks/frontendMocks.js';

// ─── Parse Api.js.html ────────────────────────────────────────────────────

const apiSource = readFileSync(
  resolve(import.meta.dirname, '../../Api.js.html'),
  'utf-8'
);

/**
 * Extract method names from the ServerApi object literal.
 * Pattern: `methodName: function(...)` or `methodName(...)` shorthand
 */
function extractApiMethods(source) {
  const methods = [];
  // Match `name: function(...)` pattern
  const fnRegex = /(\w+)\s*:\s*function\s*\(([^)]*)\)/g;
  let match;
  while ((match = fnRegex.exec(source)) !== null) {
    const params = match[2].trim();
    methods.push({
      name: match[1],
      arity: params === '' ? 0 : params.split(',').length,
    });
  }
  return methods;
}

const apiMethods = extractApiMethods(apiSource);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Api.js.html contract tests (#117)', () => {
  describe('structural contracts', () => {
    it('should define ServerApi with at least one method', () => {
      expect(apiMethods.length).toBeGreaterThan(0);
    });

    it('should have the "call" method', () => {
      const callMethod = apiMethods.find(m => m.name === 'call');
      expect(callMethod).toBeDefined();
    });

    it('"call" method should accept (functionName, ...args) — arity 2', () => {
      const callMethod = apiMethods.find(m => m.name === 'call');
      expect(callMethod).toBeDefined();
      // function(functionName, ...args) = 2 params
      expect(callMethod.arity).toBe(2);
    });

    it('should contain google.script.run availability check', () => {
      expect(apiSource).toContain("typeof google === 'undefined'");
      expect(apiSource).toContain('google.script');
      expect(apiSource).toContain('google.script.run');
    });

    it('should have error fallback message', () => {
      expect(apiSource).toContain('Cannot connect to the server.');
    });

    it('should use withSuccessHandler and withFailureHandler', () => {
      expect(apiSource).toContain('.withSuccessHandler(');
      expect(apiSource).toContain('.withFailureHandler(');
    });

    it('should return a Promise', () => {
      expect(apiSource).toContain('new Promise');
    });
  });

  describe('mock ServerApi (frontendMocks.js) contract parity', () => {
    it('createMockServerApi should produce an object with "call" method', () => {
      const mock = createMockServerApi();
      expect(typeof mock.call).toBe('function');
    });

    it('mock "call" should reject for unmocked functions', async () => {
      const mock = createMockServerApi();
      await expect(mock.call('nonExistentFn')).rejects.toThrow('not mocked');
    });

    it('mock "call" should resolve with handler result', async () => {
      const mock = createMockServerApi({
        getData: () => ({ schedules: [] }),
      });
      const result = await mock.call('getData');
      expect(result).toEqual({ schedules: [] });
    });

    it('mock "call" should pass arguments to handler', async () => {
      const mock = createMockServerApi({
        saveData: (payload) => ({ success: true, payload }),
      });
      const result = await mock.call('saveData', { data: 'test' });
      expect(result.payload).toEqual({ data: 'test' });
    });

    it('mock "call" should reject when handler throws', async () => {
      const mock = createMockServerApi({
        failingFn: () => { throw new Error('Server error'); },
      });
      await expect(mock.call('failingFn')).rejects.toThrow('Server error');
    });
  });

  describe('Api.js.html ↔ frontendMocks.js consistency', () => {
    it('mock should have same method names as production', () => {
      const mock = createMockServerApi();
      const productionMethodNames = apiMethods.map(m => m.name);
      // The mock should at least have the 'call' method
      for (const name of productionMethodNames) {
        expect(
          typeof mock[name],
          `Mock missing method "${name}" that exists in Api.js.html`
        ).toBe('function');
      }
    });
  });
});
