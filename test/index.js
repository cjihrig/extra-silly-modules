'use strict';
const assert = require('node:assert');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const {
  createContext,
  SourceTextModule,
  SyntheticModule
} = require('node:vm');
const {
  createSourceTextModule,
  createSyntheticModule,
  run
} = require('../lib');
const fixturesDir = path.join(__dirname, '..', 'fixtures');

test('can create an instance of SourceTextModule', async () => {
  const fixture = path.join(fixturesDir, 'basic-esm.mjs');
  const context = createContext();
  const mod = await createSourceTextModule(fixture, { context });

  assert(mod instanceof SourceTextModule);
  assert.strictEqual(mod.status, 'unlinked');
  assert.strictEqual(mod.identifier, fixture);
  assert.strictEqual(mod.context, context);
});

test('can create an instance of SyntheticModule', async () => {
  const specifier = 'node:fs';
  const context = createContext();
  const mod = await createSyntheticModule(specifier, { context });

  assert(mod instanceof SyntheticModule);
  assert.strictEqual(mod.status, 'unlinked');
  assert.strictEqual(mod.identifier, specifier);
  assert.strictEqual(mod.context, context);
});

test('can run ES modules', async () => {
  const fixture = path.join(fixturesDir, 'basic-esm.mjs');

  // This fixture increments counters on the context's globalThis.
  let mod = await run(fixture);
  assert.strictEqual(mod.context.basic_esm, 1);
  assert.strictEqual(mod.context.dep_esm, 1);

  // Running the fixture again in the same context increments the counters.
  mod = await run(fixture, { context: mod.context });
  assert.strictEqual(mod.context.basic_esm, 2);
  assert.strictEqual(mod.context.dep_esm, 2);

  // Running the fixture again in a new context yields fresh counters.
  mod = await run(fixture);
  assert.strictEqual(mod.context.basic_esm, 1);
  assert.strictEqual(mod.context.dep_esm, 1);

  // Verify that the outer context is not changed.
  assert.strictEqual(globalThis.basic_esm, undefined);
  assert.strictEqual(globalThis.dep_esm, undefined);
});

test('can run CJS modules', async () => {
  const fixture = path.join(fixturesDir, 'basic-cjs.js');
  const context1 = createContext({ console, require: createRequire(fixture) });
  const context2 = createContext({ console, require: createRequire(fixture) });

  // This fixture increments counters on the context's globalThis.
  let mod = await run(fixture, { context: context1 });
  assert.strictEqual(mod.context.basic_cjs, 1);

  // TODO(cjihrig): This is a bug. dep-cjs.js has the wrong globalThis.
  assert.strictEqual(mod.context.dep_cjs, undefined);
  assert.strictEqual(globalThis.dep_cjs, 1);

  // Running the fixture again in the same context increments the counters.
  mod = await run(fixture, { context: mod.context });
  assert.strictEqual(mod.context.basic_cjs, 2);

  // TODO(cjihrig): Same bug as above.
  assert.strictEqual(mod.context.dep_cjs, undefined);
  assert.strictEqual(globalThis.dep_cjs, 1);

  // Running the fixture again in a new context yields a fresh counter.
  mod = await run(fixture, { context: context2 });
  assert.strictEqual(mod.context.basic_cjs, 1);

  // Verify that the outer context is not changed.
  assert.strictEqual(globalThis.basic_cjs, undefined);

  // TODO(cjihrig): Same bug as above.
  assert.strictEqual(mod.context.dep_cjs, undefined);
  assert.strictEqual(globalThis.dep_cjs, 1);
});
