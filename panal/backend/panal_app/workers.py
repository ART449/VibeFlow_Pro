from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from random import Random

from .config import settings
from .providers import AdapterRegistry
from .schemas import GuardianAnalysisResponse, HostRecord, NerveStepResponse, StepDefinition


SAFE_VAR_PATTERNS = {
    "source_ip": re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$"),
    "scan_profile": re.compile(r"^(quick|standard|deep)$"),
    "package": re.compile(r"^[a-z0-9._-]+$"),
}


def render_command(template: str, variables: dict[str, str]) -> str:
    command = template
    for key, value in variables.items():
        if key in SAFE_VAR_PATTERNS and not SAFE_VAR_PATTERNS[key].match(str(value)):
            raise ValueError(f"Valor inseguro para {key}")
        command = command.replace("${" + key + "}", str(value))
    if "${" in command:
        raise ValueError("Variables de playbook incompletas")
    return command


def make_telemetry(host: HostRecord) -> dict[str, int | str]:
    seed = int(hashlib.sha256(host.id.encode("utf-8")).hexdigest()[:8], 16)
    rng = Random(seed + int(datetime.now(timezone.utc).timestamp()) // 60)
    return {
        "host_id": host.id,
        "cpu": rng.randint(18, 79),
        "ram": rng.randint(32, 88),
        "load": f"{rng.uniform(0.2, 2.8):.2f}",
    }


async def execute_nerve_step(host: HostRecord, step: StepDefinition, variables: dict[str, str], live_execution: bool) -> NerveStepResponse:
    if step.kind == "telemetry_snapshot":
        telemetry = make_telemetry(host)
        return NerveStepResponse(
            ok=True,
            mode="simulate",
            log={"step": step.id, "message": f"Telemetry snapshot capturado para {host.id}."},
            telemetry=telemetry,
        )

    command = render_command(step.command or "echo noop", variables)
    if not live_execution or not step.live_capable:
        await asyncio.sleep(0.05)
        return NerveStepResponse(
            ok=True,
            mode="simulate",
            log={"step": step.id, "message": f"[SIMULATED] {host.id}: {command}"},
            telemetry=make_telemetry(host) if step.emits_telemetry else None,
        )

    process = await asyncio.create_subprocess_exec(
        settings.ssh_binary,
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        f"{host.ssh_user}@{host.address}",
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    ok = process.returncode == 0
    message = stdout.decode("utf-8", errors="ignore").strip() or stderr.decode("utf-8", errors="ignore").strip()
    return NerveStepResponse(
        ok=ok,
        mode="live",
        log={
            "step": step.id,
            "message": message or f"SSH command finished with rc={process.returncode}",
            "rc": process.returncode,
            "command": command,
        },
        telemetry=make_telemetry(host) if step.emits_telemetry else None,
    )


async def run_guardian_analysis(host: HostRecord, profile: str, adapters: AdapterRegistry) -> GuardianAnalysisResponse:
    result = await adapters.get("A3_GUARDIAN_LOCAL").execute(
        "offline-security-analysis",
        {"host_id": host.id, "profile": profile},
    )
    return GuardianAnalysisResponse(
        ok=True,
        summary=result["summary"],
        findings=result["findings"],
        artifacts=[
            {
                "kind": "guardian-report",
                "host_id": host.id,
                "profile": profile,
                "score": result["score"],
            }
        ],
    )
