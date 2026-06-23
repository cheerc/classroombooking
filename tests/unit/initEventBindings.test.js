/**
 * init() event binding completeness contract tests.
 * Ref: #133 — Verify all binding sites within App.init() (JavaScript.html L45-82)
 *
 * Strategy: Static analysis of JavaScript.html init() method body to verify:
 * 1. Module factory creation (4 modules)
 * 2. Event listener delegation (interaction.addEventListeners)
 * 3. Timer registrations (setInterval, setTimeout)
 * 4. DOM property assignments (versionBadge, currentUserEmail)
 *
 * This catches init() wiring drift during refactoring without requiring
 * GAS runtime or DOM environment.
 *
 * Closes #133
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Parse JavaScript.html init() body ─────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '../..');
const jsHtmlSource = readFileSync(resolve(ROOT, 'JavaScript.html'), 'utf-8');

/**
 * Extract the init() method body from JavaScript.html.
 * The method starts at `init: function () {` and ends at the matching `},`
 * at the same indent level (12 spaces).
 */
function extractInitBody(source) {
  const lines = source.split('\n');
  let startLine = -1;
  let braceDepth = 0;
  let inInit = false;
  const bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find init: function () {
    if (!inInit && /^\s+init:\s*function\s*\(\)\s*\{/.test(line)) {
      startLine = i + 1; // 1-indexed
      inInit = true;
      braceDepth = 1; // opening brace of init
      continue;
    }

    if (inInit) {
      // Count braces to find matching close
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) break;
      bodyLines.push({ line: i + 1, content: line });
    }
  }

  return { startLine, bodyLines, source: bodyLines.map(l => l.content).join('\n') };
}

const initBody = extractInitBody(jsHtmlSource);

// ─── Expected init() binding contracts ─────────────────────────────────────

/**
 * Module factory creation calls expected in init().
 * Each factory takes (this/app) as the sole argument.
 */
const EXPECTED_MODULE_FACTORIES = [
  { property: 'modals', factory: 'createModalModule' },
  { property: 'historyModule', factory: 'createHistoryModule' },
  { property: 'ui', factory: 'createUIModule' },
  { property: 'interaction', factory: 'createInteractionModule' },
];

/**
 * Event listener delegation calls expected in init().
 */
const EXPECTED_DELEGATIONS = [
  'this.interaction.addEventListeners()',
];

/**
 * Timer registrations expected in init().
 */
const EXPECTED_TIMERS = {
  setInterval: 2, // findNextUpcomingClasses + refreshLockHeartbeat
  setTimeout: 1,  // loadDataFromServer delayed start
};

/**
 * DOM/state assignments expected in init().
 */
const EXPECTED_ASSIGNMENTS = [
  { target: 'AppElements.versionBadge.textContent', pattern: /AppElements\.versionBadge\.textContent/ },
  { target: 'this.currentUserEmail', pattern: /this\.currentUserEmail\s*=/ },
];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('init() event binding contracts (#133)', () => {
  it('should find the init() method body', () => {
    expect(initBody.startLine).toBeGreaterThan(0);
    expect(initBody.bodyLines.length).toBeGreaterThan(5);
  });

  describe('module factory creation', () => {
    it.each(EXPECTED_MODULE_FACTORIES)(
      'should create $property via $factory(this)',
      ({ property, factory }) => {
        const pattern = new RegExp(`this\\.${property}\\s*=\\s*${factory}\\(this\\)`);
        expect(
          initBody.source,
          `Expected this.${property} = ${factory}(this) in init()`
        ).toMatch(pattern);
      }
    );

    it('should create exactly 4 module factories', () => {
      const factoryPattern = /this\.\w+\s*=\s*create\w+Module\(this\)/g;
      const matches = initBody.source.match(factoryPattern) || [];
      expect(matches.length).toBe(4);
    });

    it('module creation should happen before addEventListeners', () => {
      // Find line numbers for last factory and addEventListeners
      const factoryLines = initBody.bodyLines.filter(l =>
        /create\w+Module\(this\)/.test(l.content)
      );
      const delegationLine = initBody.bodyLines.find(l =>
        l.content.includes('addEventListeners()')
      );

      expect(factoryLines.length).toBe(4);
      expect(delegationLine).toBeDefined();

      const lastFactoryLine = Math.max(...factoryLines.map(l => l.line));
      expect(
        delegationLine.line,
        'addEventListeners() must come after all module creation'
      ).toBeGreaterThan(lastFactoryLine);
    });
  });

  describe('event listener delegation', () => {
    it.each(EXPECTED_DELEGATIONS)(
      'should call %s',
      (delegation) => {
        expect(initBody.source).toContain(delegation);
      }
    );

    it('should have exactly one addEventListeners delegation', () => {
      const count = (initBody.source.match(/\.addEventListeners\(\)/g) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('timer registrations', () => {
    it(`should register ${EXPECTED_TIMERS.setInterval} setInterval timers`, () => {
      const count = (initBody.source.match(/setInterval\s*\(/g) || []).length;
      expect(count).toBe(EXPECTED_TIMERS.setInterval);
    });

    it(`should register ${EXPECTED_TIMERS.setTimeout} setTimeout timers`, () => {
      const count = (initBody.source.match(/setTimeout\s*\(/g) || []).length;
      expect(count).toBe(EXPECTED_TIMERS.setTimeout);
    });

    it('should have a 60-second interval for upcoming class check', () => {
      expect(initBody.source).toMatch(/setInterval\(.*60\s*\*\s*1000/s);
    });

    it('should have a 10-second interval for lock heartbeat', () => {
      expect(initBody.source).toMatch(/setInterval\(.*refreshLockHeartbeat.*10000/s);
    });

    it('should have a 500ms delayed loadDataFromServer', () => {
      // setTimeout with loadDataFromServer and 500ms delay
      expect(initBody.source).toMatch(/setTimeout\(.*loadDataFromServer.*500/s);
    });

    it('findNextUpcomingClasses should be in the periodic interval', () => {
      expect(initBody.source).toContain('this.findNextUpcomingClasses()');
    });

    it('renderScheduleTable should conditionally re-render in the interval', () => {
      expect(initBody.source).toContain('this.ui.renderScheduleTable()');
    });
  });

  describe('DOM/state assignments', () => {
    it.each(EXPECTED_ASSIGNMENTS)(
      'should assign $target',
      ({ target, pattern }) => {
        expect(
          initBody.source,
          `Expected ${target} assignment in init()`
        ).toMatch(pattern);
      }
    );

    it('should set versionBadge to AppConfig.APP_VERSION', () => {
      expect(initBody.source).toMatch(
        /AppElements\.versionBadge\.textContent\s*=\s*`版本\s*\$\{AppConfig\.APP_VERSION\}`/
      );
    });

    it('should derive currentUserEmail via getShortUserName', () => {
      expect(initBody.source).toContain('this.getShortUserName(');
    });

    it('should reference SCRIPT_USER_EMAIL for email initialization', () => {
      expect(initBody.source).toContain('SCRIPT_USER_EMAIL');
    });
  });

  describe('init() structural invariants', () => {
    it('should not have direct addEventListener calls (delegates to modules)', () => {
      // init() should NOT call .addEventListener() directly — it delegates
      const directBindings = (initBody.source.match(/\.addEventListener\(/g) || []).length;
      expect(
        directBindings,
        'init() should delegate event binding via interaction.addEventListeners()'
      ).toBe(0);
    });

    it('should not have direct onclick assignments (delegates to modules)', () => {
      const onclickAssignments = (initBody.source.match(/\.onclick\s*=/g) || []).length;
      expect(onclickAssignments).toBe(0);
    });

    it('loadDataFromServer should have .catch error handler', () => {
      expect(initBody.source).toMatch(/loadDataFromServer\(\)\.catch/);
    });

    it('today-check conditional should compare against currentDayIndex', () => {
      expect(initBody.source).toContain('this.currentDayIndex === todayIndex');
    });

    it('should check for DAY view mode before conditional re-render', () => {
      expect(initBody.source).toContain('AppConfig.MODES.DAY');
    });
  });

  describe('comprehensive binding inventory', () => {
    // This test enumerates ALL side-effectful operations in init()
    // to serve as a complete change-detection contract.
    it('should have exactly the expected set of side-effectful operations', () => {
      const operations = {
        moduleCreations: (initBody.source.match(/this\.\w+\s*=\s*create\w+Module\(this\)/g) || []).length,
        addEventListeners: (initBody.source.match(/\.addEventListeners\(\)/g) || []).length,
        setIntervals: (initBody.source.match(/setInterval\s*\(/g) || []).length,
        setTimeouts: (initBody.source.match(/setTimeout\s*\(/g) || []).length,
        domAssignments: (initBody.source.match(/AppElements\.\w+\.\w+\s*=/g) || []).length,
        stateAssignments: (initBody.source.match(/this\.currentUserEmail\s*=/g) || []).length,
      };

      expect(operations).toEqual({
        moduleCreations: 4,
        addEventListeners: 1,
        setIntervals: 2,
        setTimeouts: 1,
        domAssignments: 1,
        stateAssignments: 1,
      });
    });
  });
});
