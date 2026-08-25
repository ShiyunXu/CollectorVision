---
library_name: onnxruntime
tags:
  - collectorvision
  - model-registry
  - card-identification
pretty_name: CollectorVision Model Registry
---

# CollectorVision 🃏

**The model hub for [CollectorVision](https://github.com/HanClinto/CollectorVision) —
card identification for collectible card games (MTG, Pokémon, and more).**

This repository is the **registry hub**, not a loadable model. It hosts a single
metadata file, `registry.json`, that points at the individual
model-family repositories where the ONNX weights actually live. Think of it as
the parent folder that ties the project's models together.

> ℹ️ There is no weight file to download here. If your client tried to load this
> repo as a model, point it at one of the family repositories below instead.
>
> 🛠️ `registry.json` is published from the project's bootstrap snapshot at
> `collector_vision/data/model_registry.json`; edit it there, not by hand on the Hub.

## Model families

| Family | Task | Repository | Cadence |
| --- | --- | --- | --- |
| **Cornelius** | Card corner detection (SimCC) | [`HanClinto/cornelius`](https://huggingface.co/HanClinto/cornelius) | Updated frequently |
| **Milo** | Card embedding (ArcFace) | [`HanClinto/milo`](https://huggingface.co/HanClinto/milo) | Updated rarely |

## Channels

`registry.json` exposes two release channels. Each maps a **family** to the
exact model ID that channel currently endorses:

- **`stable`** — the default. What `NeuralCornerDetector()` / `NeuralEmbedder()`
  resolve to unless you ask otherwise.
- **`testing`** — early candidates before they graduate to `stable`.

There is deliberately **no `nightly` channel** — the models don't move that
often, and an empty/stale nightly pointer is worse than none.

## How clients use this repo

```python
from collector_vision import NeuralCornerDetector, NeuralEmbedder

# Latest stable for a family (checks for updates on a 7-day cache timeout):
detector = NeuralCornerDetector(family="cornelius")

# Track the testing channel:
detector = NeuralCornerDetector(family="cornelius", channel="testing")

# Pin an exact, reproducible version (never auto-updates):
embedder = NeuralEmbedder(family="milo", version="1.0.0")
```

Resolution rules:

1. A **pinned** `version` is cached immutably and never auto-updates.
2. A **`channel`** selection refreshes the cached `registry.json` on a ~7-day
   timeout, then resolves the family's endorsed model ID for that channel.
3. Artifacts are always fetched from the **immutable revision** recorded in
   `registry.json` and verified against the recorded **SHA-256** before use.

## `registry.json` structure

- `schema_version` — bumped on incompatible layout changes.
- `channels.<channel>.<family>` → exact model ID (e.g. `cornelius-2.12`).
- `models.<id>` — one record per exact release, carrying `family`, `version`,
  `task`, `architecture`, `input_size`, `repository`, `revision`, `filename`,
  `sha256`, and `size_bytes`.

Splitting `family` and `version` into separate fields lets a client ask for a
plain `"cornelius"` (latest for the family on a channel) or a precise
`"cornelius-2.12"` for reproducible selection.

## Links

- 📦 Project & source: <https://github.com/HanClinto/CollectorVision>
- 🧭 Corner detection weights: <https://huggingface.co/HanClinto/cornelius>
- 🧬 Embedding weights: <https://huggingface.co/HanClinto/milo>

Licensed under AGPL-3.0-or-later, matching the CollectorVision project.
