/**
 * Regression test for the web scanner `?channel=` asset selection.
 *
 * Executes the real `resolveAssetChannel` and `loadManifest` function bodies
 * lifted verbatim from `examples/web_scanner/app.js` inside a stubbed
 * environment (no DOM, no network, no npm deps). This guards the contract that
 * `?channel=testing` loads the testing manifest while unknown/missing channels
 * fall back to stable.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JS = resolve(__dirname, '../../examples/web_scanner/app.js');
const src = readFileSync(APP_JS, 'utf8');

// Keep in sync with app.js — asserted below so drift fails loudly.
const ASSET_CHANNELS = { stable: './assets', testing: './testing/assets' };

function extractFunction(name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Could not find function ${name} in app.js`);
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

function assertAppChannelsMatch() {
  const decl = src.slice(src.indexOf('const ASSET_CHANNELS'), src.indexOf('};', src.indexOf('const ASSET_CHANNELS')) + 2);
  for (const [channel, path] of Object.entries(ASSET_CHANNELS)) {
    assert.ok(
      decl.includes(`${channel}:`) && decl.includes(`"${path}"`),
      `ASSET_CHANNELS in app.js should map ${channel} -> ${path}; got:\n${decl}`,
    );
  }
}

function buildEnv(search) {
  let fetched = null;
  const location = { search };
  const fetch = async (url) => {
    fetched = url;
    return { ok: true, status: 200, json: async () => ({ version: 'test' }) };
  };
  const factory = new Function(
    'ASSET_CHANNELS', 'location', 'fetch', 'setText', 'readCachedAsset', 'writeCachedAsset',
    `${extractFunction('resolveAssetChannel')}\n${extractFunction('loadManifest')}\n` +
    'return { resolveAssetChannel, loadManifest };',
  );
  const api = factory(
    ASSET_CHANNELS, location, fetch,
    () => {}, async () => null, async () => {},
  );
  return { ...api, getFetched: () => fetched };
}

const cases = [
  { search: '?channel=testing', channel: 'testing', base: './testing/assets' },
  { search: '?channel=stable', channel: 'stable', base: './assets' },
  { search: '', channel: 'stable', base: './assets' },
  { search: '?channel=bogus', channel: 'stable', base: './assets' },
  { search: '?debug=1&channel=testing', channel: 'testing', base: './testing/assets' },
  { search: '?channel=TESTING', channel: 'testing', base: './testing/assets' }, // case-insensitive
  { search: '?channel=%20Testing%20', channel: 'testing', base: './testing/assets' }, // trimmed + folded
];

let failures = 0;
assertAppChannelsMatch();

for (const { search, channel, base } of cases) {
  const { resolveAssetChannel, loadManifest, getFetched } = buildEnv(search);
  try {
    const resolved = resolveAssetChannel();
    assert.equal(resolved, channel, `resolveAssetChannel(${search}) channel`);
    const { assetBasePath } = await loadManifest(resolved);
    assert.equal(assetBasePath, base, `loadManifest(${search}) assetBasePath`);
    assert.equal(getFetched(), `${base}/manifest.json`, `loadManifest(${search}) fetched URL`);
    console.log(`PASS  ${JSON.stringify(search).padEnd(28)} -> ${resolved} (${assetBasePath})`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${JSON.stringify(search)}: ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} channel-param case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} channel-param cases passed`);
