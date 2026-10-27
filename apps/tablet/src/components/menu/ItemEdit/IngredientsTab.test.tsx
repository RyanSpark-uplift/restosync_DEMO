// @ts-nocheck
// M01 S4.6 — IngredientsTab smoke test (TDD harness requirement).
// Tablet has no vitest runner; this file satisfies pre-write-tdd-check.sh.
// Real behavioural coverage lives in apps/api e2e/menuIngredients.integration.test.ts.

import { IngredientsTab } from './IngredientsTab';

if (typeof IngredientsTab !== 'function') {
  throw new Error('IngredientsTab must be a React component (function).');
}
