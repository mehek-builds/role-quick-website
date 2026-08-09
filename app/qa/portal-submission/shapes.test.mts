import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { securityCodeFor } from './shapes.ts';

test('controlled security codes follow the observed Greenhouse mixed-case letter shape', () => {
  const first = securityCodeFor('email-1-application');
  const second = securityCodeFor('email-2-application');
  assert.match(first, /^[A-Z]{4}[a-z][A-Z]{3}$/);
  assert.match(second, /^[A-Z]{4}[a-z][A-Z]{3}$/);
  assert.notEqual(first, second);
  assert.equal(securityCodeFor('email-1-application'), first);
});

test('the controlled portal compares the case-sensitive code without visual case coercion', async () => {
  const source = await readFile(new URL('./shape-form.tsx', import.meta.url), 'utf8');
  const securityBranch = source.slice(
    source.indexOf('if (shape === "security-code")'),
    source.indexOf('setPhase("done")', source.indexOf('if (shape === "security-code")')),
  );
  assert.doesNotMatch(securityBranch, /toUpperCase|toLowerCase/);
  const field = source.slice(source.indexOf('id="security_code"'), source.indexOf('/>', source.indexOf('id="security_code"')));
  assert.doesNotMatch(field, /uppercase|lowercase|capitalize/);
});
