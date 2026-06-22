/**
 * Elements.js.html contract tests — AppElements DOM ID mapping.
 * Ref: #117 — Verify element factory data (DOM ID lookups, property names)
 *
 * Strategy: Parse Elements.js.html statically to extract the property → DOM ID
 * mapping from AppElements, then verify:
 * 1. All property names are unique
 * 2. All DOM IDs are unique (no duplicate getElementById calls)
 * 3. The property count matches expected
 * 4. Naming conventions are consistent (camelCase properties, kebab-case IDs)
 *
 * Closes #117
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Parse Elements.js.html ────────────────────────────────────────────────

const elementsSource = readFileSync(
  resolve(import.meta.dirname, '../../Elements.js.html'),
  'utf-8'
);

/**
 * Extract property → DOM ID mappings from AppElements object literal.
 * Pattern: `propertyName: document.getElementById('dom-id')`
 */
function extractElementMappings(source) {
  const mappings = [];
  const regex = /(\w+)\s*:\s*document\.getElementById\(\s*'([^']+)'\s*\)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    mappings.push({
      property: match[1],
      domId: match[2],
    });
  }
  return mappings;
}

const elementMappings = extractElementMappings(elementsSource);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Elements.js.html contract tests (#117)', () => {
  it('should parse AppElements and find element mappings', () => {
    expect(elementMappings.length).toBeGreaterThan(0);
  });

  it('should have the expected number of element mappings', () => {
    // Counted from the source: 92 getElementById calls
    // If this number changes, someone added/removed an element — intentional drift detection
    expect(elementMappings.length).toBe(92);
  });

  it('all property names should be unique', () => {
    const propertyNames = elementMappings.map(m => m.property);
    const duplicates = propertyNames.filter(
      (name, i) => propertyNames.indexOf(name) !== i
    );
    expect(duplicates).toEqual([]);
  });

  it('all DOM IDs should be unique (no duplicate getElementById calls)', () => {
    const domIds = elementMappings.map(m => m.domId);
    const duplicates = domIds.filter(
      (id, i) => domIds.indexOf(id) !== i
    );
    expect(duplicates).toEqual([]);
  });

  it('property names should be camelCase', () => {
    const nonCamelCase = elementMappings.filter(m => {
      // camelCase: starts with lowercase, no hyphens/underscores
      return !/^[a-z][a-zA-Z0-9]*$/.test(m.property);
    });
    expect(nonCamelCase.map(m => m.property)).toEqual([]);
  });

  it('DOM IDs should be kebab-case', () => {
    const nonKebab = elementMappings.filter(m => {
      // kebab-case: lowercase letters, digits, and hyphens
      return !/^[a-z][a-z0-9-]*$/.test(m.domId);
    });
    expect(nonKebab.map(m => m.domId)).toEqual([]);
  });

  describe('known element groups should be present', () => {
    const propertySet = new Set(elementMappings.map(m => m.property));

    it('should have view mode elements', () => {
      expect(propertySet.has('viewModeWeekBtn')).toBe(true);
      expect(propertySet.has('viewModeDayBtn')).toBe(true);
      expect(propertySet.has('viewSortSelector')).toBe(true);
    });

    it('should have schedule manager elements', () => {
      expect(propertySet.has('scheduleSelect')).toBe(true);
      expect(propertySet.has('manageSchedulesBtn')).toBe(true);
      expect(propertySet.has('scheduleManagerModal')).toBe(true);
    });

    it('should have loading/notification elements', () => {
      expect(propertySet.has('loadingOverlay')).toBe(true);
      expect(propertySet.has('loadingText')).toBe(true);
      expect(propertySet.has('notification')).toBe(true);
    });

    it('should have filter elements', () => {
      expect(propertySet.has('showFilterBtn')).toBe(true);
      expect(propertySet.has('filterModal')).toBe(true);
      expect(propertySet.has('filterApply')).toBe(true);
    });

    it('should have modal elements (confirm, prompt, help)', () => {
      expect(propertySet.has('confirmModal')).toBe(true);
      expect(propertySet.has('promptModal')).toBe(true);
      expect(propertySet.has('helpModal')).toBe(true);
    });

    it('should have PDF elements', () => {
      expect(propertySet.has('printToPdfBtn')).toBe(true);
      expect(propertySet.has('pdfOptionsModal')).toBe(true);
      expect(propertySet.has('pdfPaperSize')).toBe(true);
    });

    it('should have copy course modal elements', () => {
      expect(propertySet.has('copyCourseModal')).toBe(true);
      expect(propertySet.has('copyTargetClassroom')).toBe(true);
      expect(propertySet.has('copyCourseConfirm')).toBe(true);
    });
  });

  describe('property ↔ DOM ID naming consistency', () => {
    it('DOM ID should be derivable from property name (camelCase → kebab-case)', () => {
      // Verify that for most elements, the DOM ID is a kebab-case version
      // of the property name (e.g., loadingOverlay → loading-overlay)
      const mismatches = [];
      for (const { property, domId } of elementMappings) {
        // Convert camelCase to kebab-case for comparison
        const expectedId = property
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
          .toLowerCase();

        if (expectedId !== domId) {
          mismatches.push({ property, domId, expectedId });
        }
      }
      // Many elements intentionally abbreviate (e.g., Btn suffix in property
      // name not present in DOM ID: viewModeWeekBtn → view-mode-week)
      // Allow up to 15 mismatches for this pattern
      expect(
        mismatches.length,
        `Too many naming mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`
      ).toBeLessThanOrEqual(15);
    });
  });
});
