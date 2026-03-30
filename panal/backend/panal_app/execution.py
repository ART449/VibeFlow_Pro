from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

import httpx

from .config import settings
from .providers import AdapterRegistry
from .schemas import (
    AuditEntry,
    ExecutionRecord,
    GuardianAnalysisRequest,
    GuardianAnalysisResponse,
    HostRecord,
    IncidentRecord,
    NerveStepRequest,
    NerveStepResponse,
    OperatorContext,
    PlaybookDefinition,
)
from .storage import JsonStateStore, utcnow
from .workers import execute_nerve_step, run_guardian_analysis


class WebSocketHub:
    def __init__(self) -> None:
        self._connections: list[Any] = []

    async def connect(self, websocket: Any) -> None:
        await websocket.accept()
        self._connections.append(websocket)

    def disconnect(self, websocket: Any) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)

    async def publish(self, event: str, payload: dict[str, Any]) -> None:
        stale: list[Any] = []
        message = {"event": event, "payload": payload}
        for websocket in list(self._connections):
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(websocket)


class ExecutionService:
    def __init__(self, store: JsonStateStore, adapters: AdapterRegistry, hub: WebSocketHub) -> None:
        self.store = store
        self.adapters = adapters
        self.hub = hub

    async def queue_execution(self, envelope, playbook: PlaybookDefinition, context: OperatorContext) -> ExecutionRecord:
        if self.store.is_envelope_used(envelope.signature):
            raise ValueError("Approval envelope ya usado")
        self.store.mark_envelope_used(envelope.signature)

        incident_id = f"inc_{uuid4().hex[:10]}"
        now = utcnow()
        incident = IncidentRecord(
            id=incident_id,
            title=f"{playbook.intent} :: {', '.join(envelope.target_hosts)}",
            severity=playbook.risk_level,
            status="remediating",
            playbook_id=playbook.id,
            host_ids=envelope.target_hosts,
            summary=context.attributes.get("summary", "Incidente creado por flujo Panal."),
            created_at=now,
            updated_at=now,
        )
        self.store.save_incident(incident)

        mode = "live" if settings.live_execution_enabled else "simulate"
        record = ExecutionRecord(
            id=envelope.execution_id,
            incident_id=incident_id,
            playbook_id=playbook.id,
            playbook_hash=playbook.playbook_hash or "",
            target_hosts=envelope.target_hosts,
            vars=envelope.vars,
            status="queued",
            mode=mode,
            approved_by=envelope.approved_by,
            created_at=now,
            updated_at=now,
        )
        self.store.save_execution(record)
        self.store.append_audit(
            AuditEntry(
                kind="execution.created",
                created_at=now,
                execution_id=record.id,
                incident_id=incident_id,
                payload={"playbook_id": playbook.id, "hosts": envelope.target_hosts},
            )
        )
        await self.hub.publish("execution.status", record.model_dump(mode="json"))
        asyncio.create_task(self._run(record.id, incident_id, playbook, context))
        return record

    async def _run(self, execution_id: str, incident_id: str, playbook: PlaybookDefinition, context: OperatorContext) -> None:
        record = self.store.get_execution(execution_id)
        incident = self.store.get_incident(incident_id)
        if not record or not incident:
            return

        record.status = "running"
        record.updated_at = utcnow()
        self.store.save_execution(record)
        await self.hub.publish("execution.status", record.model_dump(mode="json"))

        try:
            for host_id in record.target_hosts:
                host = self.store.get_host(host_id)
                if not host:
                    raise ValueError(f"Host desconocido: {host_id}")
                await self._log(record, incident, {"level": "info", "host_id": host_id, "message": "Inicio de host."})
                for step in playbook.steps:
                    await self._run_step(record, incident, host, step)

            record.status = "succeeded"
            incident.status = "closed"
            audit = await self.adapters.get("A4_A8_AUDITOR").execute(
                "incident-closure",
                {
                    "incident_id": incident.id,
                    "execution_id": record.id,
                    "playbook_id": playbook.id,
                    "hosts": record.target_hosts,
                    "status": record.status,
                },
            )
            incident.audit_report = audit["report"]
            await self.hub.publish(
                "incident.audit",
                {"incident_id": incident.id, "report": audit["report"], "summary": audit["summary"]},
            )
        except Exception as exc:
            record.status = "failed"
            incident.status = "blocked"
            await self._log(record, incident, {"level": "error", "message": str(exc)})
        finally:
            record.updated_at = utcnow()
            incident.updated_at = utcnow()
            self.store.save_execution(record)
            self.store.save_incident(incident)
            self.store.append_audit(
                AuditEntry(
                    kind="execution.finished",
                    created_at=utcnow(),
                    execution_id=record.id,
                    incident_id=incident.id,
                    payload={"status": record.status, "artifacts": len(record.artifacts)},
                )
            )
            await self.hub.publish("execution.status", record.model_dump(mode="json"))

    async def _run_step(self, record: ExecutionRecord, incident: IncidentRecord, host: HostRecord, step) -> None:
        if step.kind == "guardian_scan":
            analysis = await self._guardian_scan(host, step.profile or record.vars.get("scan_profile", "standard"))
            record.artifacts.extend(analysis.artifacts)
            await self._log(record, incident, {"level": "info", "host_id": host.id, "message": analysis.summary})
            return

        response = await self._nerve_step(host, step, record.vars)
        await self._log(record, incident, {"level": "info" if response.ok else "error", "host_id": host.id, **response.log})
        if response.telemetry:
            await self.hub.publish("host.telemetry", response.telemetry)
        if not response.ok:
            raise RuntimeError(f"Paso fallido: {step.id} en {host.id}")

        if step.kind == "telemetry_snapshot":
            record.artifacts.append({"kind": "telemetry", "host_id": host.id, "snapshot": response.telemetry})

        if step.kind == "ssh_command":
            record.artifacts.append({"kind": "command-log", "host_id": host.id, "step": step.id, "mode": response.mode})

    async def _nerve_step(self, host: HostRecord, step, vars_payload: dict[str, Any]) -> NerveStepResponse:
        if settings.nerve_agent_url:
            request = NerveStepRequest(
                host=host,
                step=step,
                vars=vars_payload,
                live_execution=settings.live_execution_enabled,
            )
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{settings.nerve_agent_url.rstrip('/')}/internal/execute-step",
                    headers={"X-Internal-Token": settings.internal_agent_token},
                    json=request.model_dump(mode="json"),
                )
                response.raise_for_status()
                return NerveStepResponse.model_validate(response.json())
        return await execute_nerve_step(host, step, vars_payload, settings.live_execution_enabled)

    async def _guardian_scan(self, host: HostRecord, profile: str) -> GuardianAnalysisResponse:
        if settings.guardian_url:
            request = GuardianAnalysisRequest(host=host, profile=profile)
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{settings.guardian_url.rstrip('/')}/internal/analyze",
                    headers={"X-Internal-Token": settings.internal_agent_token},
                    json=request.model_dump(mode="json"),
                )
                response.raise_for_status()
                return GuardianAnalysisResponse.model_validate(response.json())
        return await run_guardian_analysis(host, profile, self.adapters)

    async def _log(self, record: ExecutionRecord, incident: IncidentRecord, entry: dict[str, Any]) -> None:
        log_entry = {"time": utcnow().isoformat(), **entry}
        record.logs.append(log_entry)
        record.updated_at = utcnow()
        self.store.save_execution(record)
        self.store.append_audit(
            AuditEntry(
                kind="execution.log",
                created_at=utcnow(),
                execution_id=record.id,
                incident_id=incident.id,
                payload=log_entry,
            )
        )
        await self.hub.publish("execution.log", {"execution_id": record.id, "incident_id": incident.id, **log_entry})

