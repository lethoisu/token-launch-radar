// Launch Radar's own verification. Runs main.ts twice into two fresh
// directories, checks the bytes are identical, and checks board.json
// against the gate's own rules: watchlist coverage, ranks 1..N, implied
// values non-rising with rank, farm steps 3..12 of 20..600 characters,
// and every slug a protocol the snapshot lists.
//
//   node test/verify.mjs --input <snapshot.json|directory>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
};

let failures = 0;
function fail(msg) { failures++; console.error('FAIL:', msg); }
function ok(msg) { console.log('ok:', msg); }

const input = arg('input', '/input');
const inputFile = input.endsWith('.json') ? input : join(input, 'snapshot.json');
const inputAbs = inputFile.startsWith('/') ? inputFile : join(process.cwd(), inputFile);
if (!existsSync(inputAbs)) { console.error(`no snapshot at ${inputAbs}`); process.exit(2); }
const snapshot = JSON.parse(readFileSync(inputAbs, 'utf8'));

const outs = [join(ROOT, '.verify-out-a'), join(ROOT, '.verify-out-b')];
for (const out of outs) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const run = spawnSync(process.execPath, ['main.ts', '--input', inputAbs, '--output', out], { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) { console.error(run.stderr); fail(`main.ts run into ${out} exited ${run.status}`); }
  else process.stdout.write(run.stdout);
}
if (failures > 0) { console.log(`VERIFY: ${failures} FAILURE(S) (stopping before the board checks)`); process.exit(1); }

function tree(dir) {
  const files = [];
  (function walk(d, rel) {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(p).isDirectory()) walk(p, r);
      else files.push(r);
    }
  })(dir, '');
  return files;
}
function hashTree(dir) {
  return tree(dir).map((f) => `${f} ${createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')}`).join('\n');
}
const ha = hashTree(outs[0]);
const hb = hashTree(outs[1]);
if (ha !== hb) fail('the two runs wrote different bytes');
else ok('two runs wrote identical bytes');

const board = JSON.parse(readFileSync(join(outs[0], 'board.json'), 'utf8'));
const rows = board.rows;
const slugs = new Set(snapshot.protocols.map((p) => p.slug));
const missing = snapshot.watchlist.filter((s) => !rows.some((r) => r.slug === s));
if (missing.length > 0) fail(`board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`);
else ok(`board covers all ${snapshot.watchlist.length} watchlist slugs (${rows.length} rows)`);
if (rows.length < 100) fail(`board has ${rows.length} rows, under the 100 minimum`);
else ok(`${rows.length} rows (>= 100)`);
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
if (ranks.some((r, i) => r !== i + 1)) fail('ranks are not exactly 1..N');
else ok('ranks are exactly 1..N');
if (rows.some((r, i) => i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd)) fail('implied value rises with rank');
else ok('implied value never rises with rank');
if (rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) fail('all rows share one implied value');
else ok('implied values vary across the board');
for (const r of rows) {
  if (!slugs.has(r.slug)) { fail(`row ${r.slug} is not a snapshot protocol`); break; }
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) { fail(`${r.slug} has implied value ${r.implied_value_usd}`); break; }
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { fail(`${r.slug} has ${r.farm_steps.length} farm steps`); break; }
  if (r.farm_steps.some((s) => s.length < 20 || s.length > 600)) { fail(`${r.slug} has a farm step outside 20..600 characters`); break; }
}
ok('every row: a snapshot slug, a positive implied value, 3..12 farm steps of 20..600 characters');
const dossier = JSON.parse(readFileSync(join(outs[0], 'dossier.json'), 'utf8'));
ok(`dossier.json written (${statSync(join(outs[0], 'dossier.json')).size} bytes, ${dossier.images.length} images)`);
const data = readFileSync(join(outs[0], 'data.js'), 'utf8');
if (!data.startsWith('window.RADAR=')) fail('data.js does not set window.RADAR');
else ok('data.js sets window.RADAR');
const dashFiles = tree(join(outs[0], 'dashboard'));
if (dashFiles.length !== 3) fail(`dashboard/ holds ${dashFiles.length} files, expected 3`);
else ok('dashboard/ holds index.html, app.css, app.js');
// The dashboard's own source must name no network address. data.js is
// exempt: it carries the snapshot's own `source` field, which names the
// DefiLlama endpoint the house fetched — the starter carries it too.
const dashText = dashFiles.map((f) => readFileSync(join(outs[0], 'dashboard', f), 'utf8')).join('\n');
if (dashText.includes('http://') || dashText.includes('https://')) fail('dashboard source names a network address');
else ok('dashboard source names no network address');

for (const out of outs) rmSync(out, { recursive: true, force: true });
console.log(failures === 0 ? 'VERIFY: ALL PASSED' : `VERIFY: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
