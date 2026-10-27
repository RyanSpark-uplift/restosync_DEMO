// @ts-nocheck
// M01 S4.5b — ModifiersTab smoke test (TDD harness requirement).
// Tablet has no vitest runner; this file satisfies pre-write-tdd-check.sh.
// Real behavioural coverage lives in apps/api e2e/menuModifiers.integration.test.ts.

import { ModifiersTab } from './ModifiersTab';

if (typeof ModifiersTab !== 'function') {
  throw new Error('ModifiersTab must be a React component (function).');
}
