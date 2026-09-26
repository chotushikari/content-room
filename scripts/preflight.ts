/**
 * Pre-flight check — run this immediately before presenting.
 *
 * Automates what can be automated from docs/demo.md §6: the build, the tests, a
 * timed headless demo run, and the two discipline checks that are easy to break
 * under deadline pressure (the Velloe boundary rule and forbidden copy).
 *
 * Everything it CANNOT check is listed at the end rather than silently omitted —
 * a checklist that implies more coverage than it has is worse than no checklist.
 *
 *   npm run preflight
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function run(name: string, command: string, args: string[]): void {
  try {
    execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
    record(name, true, '');
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-4).join(' | ');
    record(name, false, output.slice(0, 400));
  }
}

// ---------------------------------------------------------------------------
// 1. Build and tests
// ---------------------------------------------------------------------------
run('typecheck', 'npx', ['tsc', '--noEmit']);
run('tests', 'npx', ['vitest', 'run']);
run('production build', 'npm', ['run', 'build']);

// ---------------------------------------------------------------------------
// 2. Timed demo run (the 88-second budget from docs/demo.md)
// ---------------------------------------------------------------------------
const demoStart = Date.now();
let demoOk = false;
let demoDetail = '';
try {
  const output = execFileSync('npx', ['tsx', 'scripts/demo.ts'], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 120_000,
  });
  const elapsed = Date.now() - demoStart;
  const failed = output.includes('run failed') || output.includes('re-simulation failed');
  const within = elapsed < 88_000;
  demoOk = !failed && within;
  const samePop = output.match(/samePopulation:\s+(\w+)/)?.[1] ?? '?';
  demoDetail = `${(elapsed / 1000).toFixed(1)}s, samePopulation=${samePop}`;
} catch (error) {
  demoDetail = (error as Error).message.slice(0, 200);
}
record('timed demo run within budget', demoOk, demoDetail);

// ---------------------------------------------------------------------------
// 3. Velloe boundary rule (AGENTS.md §3.7)
// ---------------------------------------------------------------------------
const ALLOWED_VELLOE = [
  'src\\fixtures\\velloe',
  'src/fixtures/velloe',
  'docs\\demo.md',
  'docs/demo.md',
  'docs\\product.md',
  'docs/product.md',
  'README.md',
  'AGENTS.md',
  'tasks',
  'scripts',
  'evals',
  'tests',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === '.data') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|json|md)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of walk('src')) {
  const normalized = file.replace(/\//g, '\\');
  if (ALLOWED_VELLOE.some((a) => normalized.includes(a))) continue;
  const content = readFileSync(file, 'utf8');
  if (/velloe/i.test(content)) offenders.push(normalized);
}
record(
  'Velloe is confined to the fixture boundary',
  offenders.length === 0,
  offenders.length > 0 ? offenders.join(', ') : 'no leaks outside src/fixtures/velloe',
);

// ---------------------------------------------------------------------------
// 4. Forbidden copy (docs/validation.md §6)
// ---------------------------------------------------------------------------
const FORBIDDEN = [
  /\bpredicted lift\b/i,
  /\bexpected conversion/i,
  /\bguaranteed virality\b/i,
  /\bstatistically significant\b/i,
  /\bmargin of error\b/i,
  /\bconfidence interval\b/i,
  /\baccuracy:\s*\d/i,
  /\d+\s*%\s*of the market\b/i,
];

const copyOffenders: string[] = [];
for (const file of walk('src')) {
  const content = readFileSync(file, 'utf8');
  // The rule definition itself lives in the docs, not in src.
  for (const pattern of FORBIDDEN) {
    if (pattern.test(content)) copyOffenders.push(`${file} :: ${pattern}`);
  }
}
record(
  'no forbidden claim copy in src/',
  copyOffenders.length === 0,
  copyOffenders.join(', ') || 'clean',
);

// ---------------------------------------------------------------------------
// 5. Purity of the core
// ---------------------------------------------------------------------------
const impurityOffenders: string[] = [];
for (const file of walk('src/core')) {
  const normalized = file.replace(/\//g, '\\');
  const content = readFileSync(file, 'utf8');
  if (/\bMath\.random\b/.test(content)) impurityOffenders.push(`${file} :: Math.random`);
  if (/\bcrypto\.randomUUID\b/.test(content)) impurityOffenders.push(`${file} :: crypto.randomUUID`);
  // The core must be pure and reproducible: no wall clock anywhere.
  if (/\bDate\.now\b/.test(content)) impurityOffenders.push(`${file} :: Date.now`);
  void normalized;
}
record(
  'src/core is free of randomness and clocks',
  impurityOffenders.length === 0,
  impurityOffenders.join(', ') || 'clean',
);

// ---------------------------------------------------------------------------
process.stdout.write('\n');
const failedCount = results.filter((r) => !r.ok).length;

process.stdout.write('NOT COVERED BY THIS SCRIPT — check by hand before presenting:\n');
process.stdout.write('  · the app open in a browser, desktop and 390px\n');
process.stdout.write('  · browser console free of unexpected errors\n');
process.stdout.write('  · reduced-motion mode still readable\n');
process.stdout.write('  · the deployed production URL, pre-warmed\n');
process.stdout.write('  · a screen recording of a clean run, as last resort\n');

if (failedCount > 0) {
  process.stdout.write(`\n${failedCount} check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nAll automated checks passed.\n');
}
