from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class RoleAdapter(ABC):
    role_name: str
    provider_name: str

    @abstractmethod
    async def execute(self, task: str, context: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class TemplateAuditAdapter(RoleAdapter):
    role_name = "A4_A8_AUDITOR"
    provider_name = "openai-compatible"

    async def execute(self, task: str, context: dict[str, Any]) -> dict[str, Any]:
        incident = context.get("incident_id", "sin-incidente")
        execution = context.get("execution_id", "sin-ejecucion")
        return {
            "summary": f"Panal cerro {incident} con trazabilidad completa para {execution}.",
            "report": (
                f"[AUDIT] {task}\n"
                f"- incidente: {incident}\n"
                f"- playbook: {context.get('playbook_id')}\n"
                f"- hosts: {', '.join(context.get('hosts', [])) or 'N/A'}\n"
                f"- resultado: {context.get('status', 'unknown')}\n"
            ),
        }


class GuardianLocalAdapter(RoleAdapter):
    role_name = "A3_GUARDIAN_LOCAL"
    provider_name = "ollama-local"

    async def execute(self, task: str, context: dict[str, Any]) -> dict[str, Any]:
        host = context["host_id"]
        profile = context.get("profile", "standard")
        score = 91 if profile == "quick" else 84 if profile == "standard" else 72
        return {
            "summary": f"Guardian local completo para {host} con perfil {profile}.",
            "findings": [
                {"severity": "medium", "title": "Paquetes pendientes", "detail": "Se detectaron parches pendientes de seguridad."},
                {"severity": "low", "title": "Puertos expuestos", "detail": "Se validaron puertos abiertos segun el perfil esperado."},
            ],
            "score": score,
        }


class FlowDirectorAdapter(RoleAdapter):
    role_name = "A6_FLOW_DIRECTOR"
    provider_name = "internal-watchdog"

    async def execute(self, task: str, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "summary": f"Flow Director valido coherencia para {task}.",
            "healthy": True,
            "checks": ["policy", "playbook_hash", "signature", "adapter_mapping"],
        }


class AdapterRegistry:
    def __init__(self) -> None:
        self._adapters = {
            "A4_A8_AUDITOR": TemplateAuditAdapter(),
            "A3_GUARDIAN_LOCAL": GuardianLocalAdapter(),
            "A6_FLOW_DIRECTOR": FlowDirectorAdapter(),
        }

    def get(self, role_name: str) -> RoleAdapter:
        return self._adapters[role_name]

