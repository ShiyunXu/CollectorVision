"""Download and verify model artifacts declared by the CollectorVision registry."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from collector_vision.model_registry import ModelSpec, load_model_registry, open_hf_url


def resolve_registered_model(
    family: str,
    *,
    task: str,
    version: str | None = None,
    channel: str = "stable",
    cache_dir: Path | None = None,
    offline: bool = False,
) -> Path:
    """Resolve a family/channel selection to a verified compatible local model."""
    registry = load_model_registry(cache_dir=cache_dir, offline=offline)
    model = registry.get_model(family=family, version=version, channel=channel)
    if model.task != task:
        raise ValueError(f"Model {model.id!r} has task {model.task!r}; expected {task!r}")
    return resolve_model_artifact(model, cache_dir=cache_dir, offline=offline)


def resolve_model_artifact(
    model: ModelSpec,
    *,
    cache_dir: Path | None = None,
    offline: bool = False,
) -> Path:
    """Return a verified local ONNX path for a registry model.

    The artifact is cached by its SHA-256 digest, so exact model releases never
    overwrite one another. Downloads use the direct Hugging Face ``resolve`` URL
    via ``urllib.request`` — no optional dependency is required for any use.
    """
    root = cache_dir or _default_cache_dir()
    destination = root / "models" / model.sha256 / model.filename

    if destination.exists():
        _verify_sha256(destination, model.sha256)
        return destination

    if offline:
        raise FileNotFoundError(
            f"Model {model.id!r} is not cached at {destination}. "
            "Disable offline mode to download it."
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    _download_from_hub(model, destination)
    _verify_sha256(destination, model.sha256)
    return destination


def _default_cache_dir() -> Path:
    base = Path(os.environ.get("COLLECTORVISION_CACHE", "~/.cache/collectorvision"))
    return base.expanduser()


def _hub_resolve_url(model: ModelSpec) -> str:
    return f"https://huggingface.co/{model.repository}/resolve/{model.revision}/{model.filename}"


def _download_from_hub(model: ModelSpec, destination: Path) -> None:
    """Download a model artifact from its immutable Hugging Face revision.

    Fetches the direct ``resolve`` URL with ``urllib.request`` and writes to a
    temporary file before an atomic replace, so an interrupted download never
    leaves a partial file at the cache destination.
    """
    url = _hub_resolve_url(model)
    temp_path = destination.with_suffix(destination.suffix + ".download")
    try:
        with open_hf_url(url, timeout=60) as response, temp_path.open("wb") as handle:
            for chunk in iter(lambda: response.read(1 << 20), b""):
                handle.write(chunk)
        temp_path.replace(destination)
    finally:
        temp_path.unlink(missing_ok=True)


def _verify_sha256(path: Path, expected: str) -> None:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        raise ValueError(
            f"Model artifact checksum mismatch for {path}: expected {expected}, got {actual}"
        )
