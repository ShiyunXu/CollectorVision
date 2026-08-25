/**
 * Regression test for the web scanner `?channel=` asset selection.
 *
 * `resolveAssetChannel` / `ASSET_CHANNELS` now live in the shared
 * `examples/web_scanner/asset-channel.mjs` module (single source of truth for
 * the scanner, playground, and monitor pages), so they are imported and tested
 * directly. `loadManifest` still lives in `app.js` and is lifted verbatim into a
 * stubbed environment. This guards the contract that `?channel=testing` loads
 * the testing manifest while unknown/missing channels fall back to stable, and
 * that all three deployed entry points consume the shared resolver.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_CHANNELS, CHANNEL_ROOTS, resolveAssetChannel } from '../../examples/web_scanner/asset-channel.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, '../../examples/web_scanner');
const APP_JS = resolve(WEB, 'app.js');
const src = readFileSync(APP_JS, 'utf8');

// The shared module must map the channels the deployed bundles expect.
assert.deepEqual(ASSET_CHANNELS, { stable: './assets', testing: './testing/assets' });
assert.deepEqual(CHANNEL_ROOTS, { stable: '.', testing: './testing' });

// Every deployed entry point must consume the shared resolver (no drift).
for (const file of ['app.js', 'applet_example.js', 'screen_capture_monitor.js']) {
  const text = readFileSync(resolve(WEB, file), 'utf8');
  assert.ok(
    /from ['"]\.\/asset-channel\.mjs['"]/.test(text),
    `${file} should import from ./asset-channel.mjs`,
  );
}

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

function buildLoadManifest() {
  let fetched = null;
  const fetch = async (url) => {
    fetched = url;
    return { ok: true, status: 200, json: async () => ({ version: 'test' }) };
  };
  const factory = new Function(
    'ASSET_CHANNELS', 'fetch', 'setText', 'readCachedAsset', 'writeCachedAsset',
    `${extractFunction('loadManifest')}\nreturn loadManifest;`,
  );
  const loadManifest = factory(
    ASSET_CHANNELS, fetch,
    () => {}, async () => null, async () => {},
  );
  return { loadManifest, getFetched: () => fetched };
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

for (const { search, channel, base } of cases) {
  const { loadManifest, getFetched } = buildLoadManifest();
  try {
    const resolved = resolveAssetChannel(search);
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
