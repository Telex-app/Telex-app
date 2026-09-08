const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Structural invariants for src/, enforced by walking the require graph.
 *
 * Both rules below were broken in this codebase and nothing failed:
 *   - queues/dlq.service.js required redact() from test/contract/helpers.js.
 *     That made the test tree a runtime dependency of production, in the path
 *     that strips customer phone numbers out of operator-visible DLQ records.
 *   - pricing.service and policyRate required each other, survivable only
 *     because one side hid its require inside a function body.
 *
 * Neither is visible in review or caught by a unit test, because both keep
 * working right up until the build stops shipping test/ or the load order
 * shifts. A graph assertion is the only thing that notices.
 */

const SRC = path.resolve(__dirname, '../src');
const REQUIRE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Every .js file under src/, as absolute paths. */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : (e.name.endsWith('.js') ? [full] : []);
});

/** Resolve a relative specifier the way require() would. */
const resolve = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.js`, path.join(base, 'index.js')].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
};

/**
 * Strip comments before scanning, so a require() inside a JSDoc example is not
 * mistaken for a real edge — common/validation.js documents its own usage that
 * way and would otherwise register as a self-cycle.
 */
const codeOf = (file) => fs.readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const buildGraph = () => {
  const graph = new Map();
  const escapes = [];
  for (const file of walk(SRC)) {
    const deps = [];
    for (const [, spec] of codeOf(file).matchAll(REQUIRE)) {
      const target = resolve(file, spec);
      if (!target) continue; // missing files are the module loader's problem
      if (!target.startsWith(SRC + path.sep)) escapes.push([file, target]);
      else deps.push(target);
    }
    graph.set(file, deps);
  }
  return { graph, escapes };
};

const relative = (p) => path.relative(SRC, p).replace(/\\/g, '/');

test('no file in src/ imports from outside src/', () => {
  const { escapes } = buildGraph();
  const offenders = escapes.map(([from, to]) => `${relative(from)} -> ${path.relative(SRC, to).replace(/\\/g, '/')}`);
  assert.deepEqual(
    offenders,
    [],
    'Production code must not depend on test fixtures, scripts or anything outside src/. '
    + 'A build that ships only src/ would fail at require time.',
  );
});

test('src/ has no circular dependencies', () => {
  const { graph } = buildGraph();
  const state = new Map();
  const cycles = [];
  const stack = [];

  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      if (!state.has(dep)) visit(dep);
      else if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep].map(relative).join(' -> '));
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of graph.keys()) if (!state.has(node)) visit(node);

  assert.deepEqual(
    cycles,
    [],
    'Circular requires force lazy in-function requires and make load order significant.',
  );
});
