from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .config import PLAYBOOK_DIR
from .schemas import PlaybookDefinition


class PlaybookRegistry:
    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or PLAYBOOK_DIR
        self.directory.mkdir(parents=True, exist_ok=True)
        self._playbooks: dict[str, PlaybookDefinition] = {}
        self.reload()

    def reload(self) -> None:
        loaded: dict[str, PlaybookDefinition] = {}
        for path in sorted(self.directory.glob("*.json")):
            raw = json.loads(path.read_text(encoding="utf-8"))
            playbook_hash = hashlib.sha256(
                json.dumps(raw, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            raw["playbook_hash"] = playbook_hash
            playbook = PlaybookDefinition.model_validate(raw)
            loaded[playbook.id] = playbook
        self._playbooks = loaded

    def list(self) -> list[PlaybookDefinition]:
        return [pb.model_copy(deep=True) for pb in self._playbooks.values()]

    def get(self, playbook_id: str) -> PlaybookDefinition | None:
        playbook = self._playbooks.get(playbook_id)
        return playbook.model_copy(deep=True) if playbook else None

