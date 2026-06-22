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
        // Ratcheted from 25% to actual values minus ~5% buffer (#109).
        // Actuals at time of ratchet: Stmts 60.5%, Branch 69.2%, Funcs 80.3%, Lines 59.9%.
        lines: 55,
        functions: 75,
        branches: 65,
        statements: 55,
      },
    },
  },
});
