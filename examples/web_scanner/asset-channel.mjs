// Shared asset-channel resolution for the deployed web pages (scanner, playground,
// screen-capture monitor). A single source of truth avoids the channel maps drifting
// apart across the three static entry points.
//
// `?channel=testing` loads from the testing bundle deployed alongside the stable one;
// anything else (including no param) resolves to the stable bundle.

// Path to each channel's asset directory (contains manifest.json + model files),
// resolved relative to the page/worker that consumes it.
export const ASSET_CHANNELS = {
  stable: "./assets",
  testing: "./testing/assets",
};

// Root of each channel's deployed bundle, i.e. the parent of its assets/ directory.
// Used for sibling files such as bundle-metadata.json.
export const CHANNEL_ROOTS = {
  stable: ".",
  testing: "./testing",
};

export function resolveAssetChannel(
  search = typeof location !== "undefined" ? location.search : "",
) {
  const requested = (new URLSearchParams(search).get("channel") ?? "stable")
    .trim()
    .toLowerCase();
  return Object.hasOwn(ASSET_CHANNELS, requested) ? requested : "stable";
}
