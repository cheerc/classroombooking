import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'text-summary', 'json-summary'],
      // Coverage instrumentation scope:
      // - 程式碼.js: GAS backend (server-side Apps Script)
      // - tests/lib/**/*.js: extracted pure-function modules from .html scriptlets
      //
      // .html files (JavaScript.html, UI.js.html, Interaction.js.html, etc.) are
      // excluded because GAS template <script> tags embedded in HTML includes are
      // not instrumentable by the v8 coverage provider — they are served by the
      // Apps Script runtime, not as standard ES modules. Coverage % therefore
      // reflects only the extracted tests/lib/ modules and 程式碼.js, not the full
      // production JS surface. See #110 for details.
      include: ['程式碼.js', 'tests/lib/**/*.js'],
      thresholds: {
        // Ratcheted from 55/65/75/55 to actual values minus ~3% buffer (#107 P0).
        // Actuals at time of ratchet (2026-06-24): Stmts 70.71%, Branch 77.38%, Funcs 84.94%, Lines 70.06%.
        lines: 67,
        functions: 82,
        branches: 74,
        statements: 67,
      },
    },
  },
});
