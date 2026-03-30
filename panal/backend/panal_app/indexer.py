from __future__ import annotations

import re


INJECTION_PATTERNS = [
    re.compile(r"ignore\s+previous", re.I),
    re.compile(r"\{\{.*\}\}", re.I),
    re.compile(r"\$\{.*\}", re.I),
    re.compile(r";\s*(rm|curl|wget|bash|sh)\b", re.I),
]


class FlowIndexer:
    def resolve(self, command: str) -> tuple[str | None, str | None, list[str]]:
        text = command.strip()
        lowered = text.lower()
        warnings: list[str] = []

        for pattern in INJECTION_PATTERNS:
            if pattern.search(text):
                warnings.append("Se detecto contenido con forma de inyeccion; el request queda en modo defensivo.")

        if any(term in lowered for term in ["openssh", "ssh patch", "parche de emergencia", "patch ssh"]):
            return "host.patch.openssh", "Remediar OpenSSH", warnings

        if any(term in lowered for term in ["blackhole", "null route", "fuerza bruta", "brute force", "bloquea ip"]):
            return "incident.blackhole_source", "Aislar origen hostil", warnings

        if any(term in lowered for term in ["scan", "escanea", "nmap", "trivy", "security posture"]):
            return "host.scan_security", "Escanear postura de seguridad", warnings

        warnings.append("No existe playbook determinista para esta intencion.")
        return None, None, warnings

