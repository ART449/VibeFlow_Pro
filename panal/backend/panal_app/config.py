from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PACKAGE_DIR = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_DIR / "data"
PLAYBOOK_DIR = PACKAGE_DIR / "playbooks"


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [part.strip() for part in raw.split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("PANAL_APP_NAME", "Panal C2")
    env: str = os.getenv("PANAL_ENV", "development")
    jwt_secret: str = os.getenv("PANAL_JWT_SECRET", "panal-dev-jwt-secret")
    approval_secret: str = os.getenv("PANAL_APPROVAL_SECRET", "panal-dev-approval-secret")
    internal_agent_token: str = os.getenv("PANAL_INTERNAL_AGENT_TOKEN", "panal-internal-token")
    live_execution_enabled: bool = _env_bool("PANAL_ENABLE_LIVE_EXECUTION", False)
    approval_ttl_seconds: int = int(os.getenv("PANAL_APPROVAL_TTL_SECONDS", "600"))
    operator_cidrs: list[str] = None  # type: ignore[assignment]
    nerve_agent_url: str | None = os.getenv("PANAL_NERVE_AGENT_URL")
    guardian_url: str | None = os.getenv("PANAL_GUARDIAN_URL")
    ssh_binary: str = os.getenv("PANAL_SSH_BINARY", "ssh")

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "operator_cidrs",
            _env_list(
                "PANAL_OPERATOR_CIDRS",
                [
                    "127.0.0.1/32",
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "203.0.113.10/32",
                ],
            ),
        )
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PLAYBOOK_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()

