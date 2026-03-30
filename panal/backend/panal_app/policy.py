from __future__ import annotations

import ipaddress
from datetime import datetime
from zoneinfo import ZoneInfo

from .config import settings
from .schemas import OperatorContext, PlaybookDefinition, PolicyEvaluationResponse


ROLE_TIERS = {
    "observer": 10,
    "auditor": 20,
    "security_analyst": 40,
    "security_admin": 80,
    "commander": 100,
}

RISK_WEIGHT = {"low": 10, "medium": 40, "high": 70, "critical": 100}


class PromptAssembler:
    def __init__(self) -> None:
        self._cidrs = [ipaddress.ip_network(item, strict=False) for item in settings.operator_cidrs]

    def _trusted_ip(self, source_ip: str) -> bool:
        ip_obj = ipaddress.ip_address(source_ip)
        return any(ip_obj in cidr for cidr in self._cidrs)

    def evaluate(self, context: OperatorContext, playbook: PlaybookDefinition | None = None) -> PolicyEvaluationResponse:
        reasons: list[str] = []
        trusted_ip = self._trusted_ip(context.source_ip)
        now = context.requested_at or datetime.now(ZoneInfo("America/Mexico_City"))
        within_hours = 6 <= now.hour <= 22
        requested_risk = playbook.risk_level if playbook else context.severity
        role_tier = ROLE_TIERS.get(context.actor_role, 0)

        if role_tier == 0:
            return PolicyEvaluationResponse(
                decision="deny",
                reasons=["Rol desconocido para operaciones Panal."],
                trusted_ip=trusted_ip,
                within_hours=within_hours,
            )

        if not trusted_ip and RISK_WEIGHT[requested_risk] >= RISK_WEIGHT["high"]:
            return PolicyEvaluationResponse(
                decision="deny",
                reasons=["La IP de origen no pertenece al perimetro confiable para acciones de alto impacto."],
                trusted_ip=trusted_ip,
                within_hours=within_hours,
            )

        if playbook and playbook.id == "incident.blackhole_source" and not context.emergency:
            return PolicyEvaluationResponse(
                decision="deny",
                reasons=["El null-routing solo se autoriza en modo de emergencia."],
                trusted_ip=trusted_ip,
                within_hours=within_hours,
            )

        if playbook and playbook.id == "host.scan_security" and role_tier >= ROLE_TIERS["security_analyst"]:
            reasons.append("Escaneo permitido por politica de observabilidad controlada.")
            return PolicyEvaluationResponse(
                decision="allow",
                reasons=reasons,
                trusted_ip=trusted_ip,
                within_hours=within_hours,
            )

        if role_tier < ROLE_TIERS["security_admin"] and RISK_WEIGHT[requested_risk] >= RISK_WEIGHT["medium"]:
            return PolicyEvaluationResponse(
                decision="deny",
                reasons=["El rol actual no tiene privilegios para acciones de remediacion."],
                trusted_ip=trusted_ip,
                within_hours=within_hours,
            )

        if not within_hours and not context.emergency:
            reasons.append("Fuera de horario operativo; se exige aprobacion humana.")

        reasons.append("La accion requiere aprobacion firmada antes de ejecutarse.")
        return PolicyEvaluationResponse(
            decision="require_approval",
            reasons=reasons,
            trusted_ip=trusted_ip,
            within_hours=within_hours,
        )

