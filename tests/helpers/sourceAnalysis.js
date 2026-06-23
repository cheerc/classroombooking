/**
 * Shared source analysis helpers for static analysis wiring tests.
 *
 * Ref: #107 — P0 Coverage Sprint (extracted from Wave 2/3 pattern)
 *
 * These helpers read JavaScript source files and extract method bodies
 * via brace-balancing for regex-based wiring verification.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Extract the body of a method from an HTML/JS source file.
 * Supports both sync and async method declarations in object literals.
 *
 * @param {string} source - The full source code
 * @param {string} methodName - The method name to find
 * @returns {string|null} The method body including declaration, or null if not found
 */
export function extractMethodBody(source, methodName) {
  const declPattern = new RegExp(
    `${methodName}\\s*:\\s*(?:async\\s+)?function\\s*\\([^)]*\\)\\s*\\{`
  );
  const match = declPattern.exec(source);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }

  return source.substring(match.index, i);
}

/**
 * Check if a code block contains a specific call/reference pattern.
 *
 * @param {string} code - The code block to search
 * @param {string} pattern - Regex pattern string to match
 * @returns {boolean} True if the pattern is found
 */
export function containsCall(code, pattern) {
  return new RegExp(pattern).test(code);
}

/**
 * Extract all ServerApi.call('functionName', ...) invocations from a code block.
 *
 * @param {string} code - The code block to search
 * @returns {string[]} Array of function name strings
 */
export function extractServerApiCalls(code) {
  const calls = [];
  const regex = /ServerApi\.call\(\s*['"](\w+)['"]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    calls.push(match[1]);
  }
  return calls;
}

/**
 * Extract all top-level function names from a GAS source file.
 *
 * @param {string} source - The GAS source code (e.g. 程式碼.js)
 * @returns {string[]} Array of function name strings
 */
export function extractGasFunctionNames(source) {
  const names = [];
  const regex = /^function (\w+)\(/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Load a source file relative to the test's directory.
 *
 * @param {string} dirname - import.meta.dirname of the calling test
 * @param {string} relativePath - Path relative to dirname (e.g. '../../JavaScript.html')
 * @returns {string} File contents as string
 */
export function loadSource(dirname, relativePath) {
  return readFileSync(resolve(dirname, relativePath), 'utf-8');
}

/**
 * Extract all addEventListener event types from a code block.
 *
 * @param {string} code - The code block to search
 * @returns {string[]} Array of event type strings (e.g. ['click', 'change', 'keydown'])
 */
export function extractEventListenerTypes(code) {
  const types = [];
  const regex = /addEventListener\(\s*['"](\w+)['"]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    types.push(match[1]);
  }
  return [...new Set(types)]; // unique
}
