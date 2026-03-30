from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DATA_DIR
from .schemas import AuditEntry, ExecutionRecord, HostRecord, IncidentRecord


DEFAULT_HOSTS = [
    {
        "id": "prod-ssh-gateway",
        "display_name": "Prod SSH Gateway",
        "address": "10.20.0.10",
        "ssh_user": "panal",
        "environment": "production",
        "target_group": "linux-production",
        "tags": ["bastion", "edge"],
        "status": "ready"
    },
    {
        "id": "dmz-web-01",
        "display_name": "DMZ Web 01",
        "address": "10.20.10.21",
        "ssh_user": "panal",
        "environment": "production",
        "target_group": "dmz",
        "tags": ["web", "internet-facing"],
        "status": "ready"
    },
    {
        "id": "security-lab-01",
        "display_name": "Security Lab 01",
        "address": "10.30.0.5",
        "ssh_user": "panal",
        "environment": "staging",
        "target_group": "linux-edge",
        "tags": ["lab", "guardian"],
        "status": "ready"
    }
]


class JsonStateStore:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or DATA_DIR
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._hosts_path = self.data_dir / "hosts.json"
        self._executions_path = self.data_dir / "executions.json"
        self._incidents_path = self.data_dir / "incidents.json"
        self._used_envelopes_path = self.data_dir / "used_envelopes.json"
        self._audit_path = self.data_dir / "audit_log.jsonl"
        self._seed()
        self._hosts = {item["id"]: HostRecord.model_validate(item) for item in self._read_json(self._hosts_path, DEFAULT_HOSTS)}
        self._executions = {
            item["id"]: ExecutionRecord.model_validate(item)
            for item in self._read_json(self._executions_path, [])
        }
        self._incidents = {
            item["id"]: IncidentRecord.model_validate(item)
            for item in self._read_json(self._incidents_path, [])
        }
        self._used_envelopes = set(self._read_json(self._used_envelopes_path, []))

    def _seed(self) -> None:
        if not self._hosts_path.exists():
            self._write_json(self._hosts_path, DEFAULT_HOSTS)
        if not self._executions_path.exists():
            self._write_json(self._executions_path, [])
        if not self._incidents_path.exists():
            self._write_json(self._incidents_path, [])
        if not self._used_envelopes_path.exists():
            self._write_json(self._used_envelopes_path, [])
        if not self._audit_path.exists():
            self._audit_path.write_text("", encoding="utf-8")

    def _read_json(self, path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default

    def _write_json(self, path: Path, data: Any) -> None:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")

    def list_hosts(self) -> list[HostRecord]:
        with self._lock:
            return [host.model_copy(deep=True) for host in self._hosts.values()]

    def get_host(self, host_id: str) -> HostRecord | None:
        with self._lock:
            host = self._hosts.get(host_id)
            return host.model_copy(deep=True) if host else None

    def save_execution(self, record: ExecutionRecord) -> None:
        with self._lock:
            self._executions[record.id] = record
            self._write_json(self._executions_path, [item.model_dump(mode="json") for item in self._executions.values()])

    def get_execution(self, execution_id: str) -> ExecutionRecord | None:
        with self._lock:
            record = self._executions.get(execution_id)
            return record.model_copy(deep=True) if record else None

    def save_incident(self, record: IncidentRecord) -> None:
        with self._lock:
            self._incidents[record.id] = record
            self._write_json(self._incidents_path, [item.model_dump(mode="json") for item in self._incidents.values()])

    def get_incident(self, incident_id: str) -> IncidentRecord | None:
        with self._lock:
            record = self._incidents.get(incident_id)
            return record.model_copy(deep=True) if record else None

    def append_audit(self, entry: AuditEntry) -> None:
        with self._lock:
            with self._audit_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry.model_dump(mode="json"), ensure_ascii=True) + "\n")

    def is_envelope_used(self, signature: str) -> bool:
        with self._lock:
            return signature in self._used_envelopes

    def mark_envelope_used(self, signature: str) -> None:
        with self._lock:
            self._used_envelopes.add(signature)
            self._write_json(self._used_envelopes_path, sorted(self._used_envelopes))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)

