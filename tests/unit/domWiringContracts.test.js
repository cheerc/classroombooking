/**
 * DOM wiring contract tests — .html files addEventListener bindings.
 * Ref: #111 — Verify all addEventListener bindings in production .html files
 * are accounted for (static parse, contract/count approach).
 *
 * Strategy: Parse each .html file's <script> content statically (regex) to
 * extract .addEventListener() calls, then verify counts and event types
 * per file. This catches wiring drift during refactoring without requiring
 * GAS runtime.
 *
 * Closes #111
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Parse .html files statically ──────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Extract all .addEventListener('eventType', ...) calls from file content.
 * Returns an array of { line, eventType, targetSnippet } objects.
 */
function extractAddEventListenerBindings(source) {
  const bindings = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match .addEventListener('eventType' — captures the event type
    const regex = /\.addEventListener\(\s*'([^']+)'/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const eventType = match[1];
      // Extract a short snippet of the target (what's before .addEventListener)
      const before = line.substring(0, match.index).trim();
      const targetSnippet = before.split(/\s+/).pop() || '(unknown)';
      bindings.push({
        line: i + 1,
        eventType,
        targetSnippet,
      });
    }
  }
  return bindings;
}

/**
 * Count event types from bindings array.
 * Returns Map<eventType, count>.
 */
function countEventTypes(bindings) {
  const counts = new Map();
  for (const b of bindings) {
    counts.set(b.eventType, (counts.get(b.eventType) || 0) + 1);
  }
  return counts;
}

// ─── File sources ──────────────────────────────────────────────────────────

const FILES = {
  'Interaction.js.html': readFileSync(resolve(ROOT, 'Interaction.js.html'), 'utf-8'),
  'Modals.js.html': readFileSync(resolve(ROOT, 'Modals.js.html'), 'utf-8'),
  'UI.js.html': readFileSync(resolve(ROOT, 'UI.js.html'), 'utf-8'),
};

// Pre-compute bindings per file
const BINDINGS = {};
const EVENT_COUNTS = {};
for (const [file, source] of Object.entries(FILES)) {
  BINDINGS[file] = extractAddEventListenerBindings(source);
  EVENT_COUNTS[file] = countEventTypes(BINDINGS[file]);
}

// ─── Expected contracts ────────────────────────────────────────────────────
// These counts are verified by grep and represent the contract.
// If a refactoring changes wiring, these must be explicitly updated.

const EXPECTED = {
  'Interaction.js.html': {
    totalBindings: 34,
    eventTypes: {
      click: 27,
      keydown: 3,
      change: 2,
      blur: 1,
      beforeunload: 1,
    },
  },
  'Modals.js.html': {
    totalBindings: 19,
    eventTypes: {
      click: 17,
      keydown: 1,
      input: 1,
    },
  },
  'UI.js.html': {
    totalBindings: 3,
    eventTypes: {
      mouseenter: 1,
      mouseleave: 1,
      click: 1,
    },
  },
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('DOM wiring contracts — .html addEventListener bindings (#111)', () => {
  it('should parse all .html files and find bindings', () => {
    // Sanity: we can parse every file
    for (const [file, bindings] of Object.entries(BINDINGS)) {
      expect(bindings.length, `${file} should have bindings`).toBeGreaterThan(0);
    }
  });

  it('total binding count across all .html files should be 56', () => {
    const total = Object.values(BINDINGS).reduce((sum, b) => sum + b.length, 0);
    expect(total).toBe(56);
  });

  describe.each(Object.keys(EXPECTED))('%s', (file) => {
    const expected = EXPECTED[file];
    const bindings = BINDINGS[file];
    const eventCounts = EVENT_COUNTS[file];

    it(`should have exactly ${expected.totalBindings} addEventListener bindings`, () => {
      expect(bindings.length).toBe(expected.totalBindings);
    });

    it('should have the expected event type distribution', () => {
      const actual = Object.fromEntries(eventCounts);
      expect(actual).toEqual(expected.eventTypes);
    });

    it.each(Object.entries(expected.eventTypes))(
      'should have %i %s event(s)',
      (eventType, expectedCount) => {
        const actualCount = eventCounts.get(eventType) || 0;
        expect(actualCount).toBe(expectedCount);
      }
    );
  });

  describe('JavaScript.html — delegation-only (no direct addEventListener)', () => {
    const jsHtmlSource = readFileSync(resolve(ROOT, 'JavaScript.html'), 'utf-8');
    const jsBindings = extractAddEventListenerBindings(jsHtmlSource);

    it('should have zero direct addEventListener bindings', () => {
      // JavaScript.html only CALLS this.interaction.addEventListeners()
      // which is a method delegation, not a direct .addEventListener() binding
      expect(jsBindings.length).toBe(0);
    });

    it('should delegate to interaction.addEventListeners()', () => {
      expect(jsHtmlSource).toContain('this.interaction.addEventListeners()');
    });
  });

  describe('cross-file consistency', () => {
    it('Interaction.js.html should be the primary event hub (most bindings)', () => {
      const interactionCount = BINDINGS['Interaction.js.html'].length;
      for (const [file, bindings] of Object.entries(BINDINGS)) {
        if (file !== 'Interaction.js.html') {
          expect(
            interactionCount,
            `Interaction.js.html (${interactionCount}) should have more bindings than ${file} (${bindings.length})`
          ).toBeGreaterThan(bindings.length);
        }
      }
    });

    it('click should be the dominant event type in every file', () => {
      for (const [file, counts] of Object.entries(EVENT_COUNTS)) {
        const clickCount = counts.get('click') || 0;
        for (const [eventType, count] of counts) {
          if (eventType !== 'click') {
            expect(
              clickCount,
              `${file}: click (${clickCount}) should >= ${eventType} (${count})`
            ).toBeGreaterThanOrEqual(count);
          }
        }
      }
    });
  });
});
