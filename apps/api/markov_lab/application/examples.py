"""Stable example data shared with the downloadable JSON fixtures."""

import os
from pathlib import Path

from markov_lab.domain.models import ExampleInfo

_DEFAULT = Path(__file__).resolve().parents[4] / "examples"


def examples() -> list[ExampleInfo]:
    directory = Path(os.environ.get("EXAMPLES_DIR", str(_DEFAULT)))
    return [
        ExampleInfo.model_validate_json(p.read_text()) for p in sorted(directory.glob("*.json"))
    ]
