# Changelog

## Unreleased

- Model artifact downloads now use the direct Hugging Face `resolve` URL via `urllib.request`, matching the registry fetch and the GitHub Actions workflow. The `huggingface_hub` package is no longer required to download model weights (it remains an optional dependency for catalog resolution). Hugging Face requests now send a descriptive `User-Agent`, avoiding intermittent HTTP 403 responses that the default `Python-urllib` agent triggers from cloud/CI IP ranges.
- Default corner detection now uses Cornelius 2.12 from Hugging Face, superseding 1.221 with the new global-token SimCC detector. This keeps the rotated-card quality fix tracked in [issue #24](https://github.com/HanClinto/CollectorVision/issues/24), where soft-argmax averaging could place corners between competing peaks.
- The Python library and generated web scanner assets now share the same bundled `collector_vision/weights/cornelius.onnx` default, so web scanner refreshes will publish Cornelius 2.12 automatically.
