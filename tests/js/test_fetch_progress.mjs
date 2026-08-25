/**
 * Regression test for the web scanner download progress reporting.
 *
 * Executes the real `fetchWithProgress` function body lifted verbatim from
 * `examples/web_scanner/scanner.worker.mjs` inside a stubbed environment
 * (no network, no npm deps). Guards the contract that:
 *   - the manifest-supplied uncompressed size is used as the progress total,
 *   - a compressed response with no manifest size reports loaded-only progress
 *     (total 0) instead of an overshooting "loaded / total",
 *   - reported ratios never exceed 1, and a final completion tick always fires.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(__dirname, '../../examples/web_scanner/scanner.worker.mjs');
const src = readFileSync(WORKER, 'utf8');

function extractFunction(name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Could not find function ${name} in scanner.worker.mjs`);
  let depth = 0;
  let j = src.indexOf('{', start);
  for (; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) { j += 1; break; }
    }
  }
  return src.slice(start, j);
}

// Build a Response-like stub streaming `chunks` (arrays of byte counts) with the
// given headers.
function makeResponse({ headers = {}, chunks = [], hasBody = true }) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v);
  let i = 0;
  const body = hasBody
    ? {
        getReader() {
          return {
            async read() {
              if (i >= chunks.length) return { done: true, value: undefined };
              const n = chunks[i]; i += 1;
              return { done: false, value: new Uint8Array(n) };
            },
          };
        },
      }
    : null;
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    body,
    async arrayBuffer() { return new ArrayBuffer(0); },
    async json() { return {}; },
  };
}

function buildFetchWithProgress(response) {
  const fetch = async () => response;
  const factory = new Function(
    'fetch', 'Blob',
    `${extractFunction('fetchWithProgress')}\nreturn fetchWithProgress;`,
  );
  // Minimal Blob stub returning empty payloads (we only assert on progress).
  const BlobStub = class { constructor() {} async text() { return '{}'; } async arrayBuffer() { return new ArrayBuffer(0); } };
  return factory(fetch, BlobStub);
}

async function run(name, { headers, chunks, expectedSize }, checks) {
  const response = makeResponse({ headers, chunks });
  const fn = buildFetchWithProgress(response);
  const events = [];
  await fn('http://x/asset', 'buffer', (ratio, loaded, total) => events.push({ ratio, loaded, total }), expectedSize);
  try {
    checks(events);
    console.log(`PASS  ${name}`);
    return 0;
  } catch (error) {
    console.error(`FAIL  ${name}: ${error.message}`);
    return 1;
  }
}

const totalBytes = (chunks) => chunks.reduce((a, b) => a + b, 0);

let failures = 0;

// 1. Compressed response WITH a manifest size: total should be the manifest
//    size (not the compressed Content-Length), ratios clamped to <= 1.
failures += await run(
  'manifest size wins over compressed Content-Length',
  { headers: { 'content-encoding': 'gzip', 'content-length': '2800000' }, chunks: [1_000_000, 1_000_000, 1_000_000], expectedSize: 3_000_000 },
  (events) => {
    for (const e of events) assert.ok(e.ratio <= 1, `ratio ${e.ratio} should be <= 1`);
    const last = events.at(-1);
    assert.equal(last.total, 3_000_000, 'total should equal manifest size');
    assert.equal(last.loaded, 3_000_000, 'final loaded should equal streamed bytes');
    assert.equal(last.ratio, 1, 'final ratio should be 1');
  },
);

// 2. Compressed response with NO manifest size: total reported as 0
//    (loaded-only progress), never an overshooting compressed total.
failures += await run(
  'compressed + no manifest size -> loaded-only (total 0)',
  { headers: { 'content-encoding': 'br', 'content-length': '2800000' }, chunks: [1_500_000, 1_500_000], expectedSize: 0 },
  (events) => {
    for (const e of events.slice(0, -1)) assert.equal(e.total, 0, 'mid total should be 0 when size unknown');
    const last = events.at(-1);
    assert.equal(last.total, last.loaded, 'final tick total falls back to loaded');
    assert.equal(last.ratio, 1, 'final ratio should be 1');
  },
);

// 3. Uncompressed response, no manifest size: Content-Length is trustworthy.
failures += await run(
  'uncompressed uses Content-Length',
  { headers: { 'content-length': '3000000' }, chunks: [1_000_000, 1_000_000, 1_000_000], expectedSize: 0 },
  (events) => {
    const last = events.at(-1);
    assert.equal(last.total, 3_000_000, 'total should equal Content-Length');
    assert.equal(last.ratio, 1, 'final ratio should be 1');
    assert.ok(events.some((e) => e.ratio > 0 && e.ratio < 1), 'should report intermediate ratios');
  },
);

// 4. A manifest size slightly under the real streamed bytes must still clamp
//    the ratio at 1 (never report > 100%).
failures += await run(
  'ratio clamps when manifest size is conservative',
  { headers: {}, chunks: [600_000, 600_000], expectedSize: 1_000_000 },
  (events) => {
    for (const e of events) assert.ok(e.ratio <= 1, `ratio ${e.ratio} should clamp to <= 1`);
    assert.equal(events.at(-1).ratio, 1, 'final ratio should be 1');
  },
);

if (failures > 0) {
  console.error(`\n${failures} fetch-progress case(s) failed`);
  process.exit(1);
}
console.log('\nAll fetch-progress cases passed');
