from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect

from panal_app.config import settings
from panal_app.execution import ExecutionService, WebSocketHub
from panal_app.indexer import FlowIndexer
from panal_app.playbooks import PlaybookRegistry
from panal_app.policy import PromptAssembler
from panal_app.providers import AdapterRegistry
from panal_app.schemas import ApprovalEnvelope, ApprovalRequest, ApprovalResponse, ExecutionRequest, IntentResolveRequest, IntentResolveResponse, OperatorContext
from panal_app.security import create_dev_jwt, decode_hs256_jwt, extract_bearer_token
from panal_app.storage import JsonStateStore, utcnow


app = FastAPI(title="Panal C2", version="1.0.0")
store = JsonStateStore()
playbooks = PlaybookRegistry()
policy = PromptAssembler()
indexer = FlowIndexer()
adapters = AdapterRegistry()
hub = WebSocketHub()
executor = ExecutionService(store, adapters, hub)


def get_current_claims(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="JWT requerido")
    try:
        return decode_hs256_jwt(token, settings.jwt_secret)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _extract_vars(command: str, playbook_id: str) -> dict[str, Any]:
    vars_payload: dict[str, Any] = {}
    tokens = [token.strip(".,:;") for token in command.split()]
    ips = [token for token in tokens if token.count(".") == 3]
    if playbook_id == "incident.blackhole_source" and ips:
        vars_payload["source_ip"] = ips[0]
    if playbook_id == "host.scan_security":
        if "quick" in command.lower():
            vars_payload["scan_profile"] = "quick"
        elif "deep" in command.lower():
            vars_payload["scan_profile"] = "deep"
        else:
            vars_payload["scan_profile"] = "standard"
    if playbook_id == "host.patch.openssh":
        vars_payload["package"] = "openssh"

    known_hosts = {host.id.lower(): host.id for host in store.list_hosts()}
    matched = [value for key, value in known_hosts.items() if key in command.lower()]
    if matched:
        vars_payload["matched_hosts"] = matched
    return vars_payload


def _issue_envelope(playbook, request: ApprovalRequest) -> ApprovalEnvelope:
    from hashlib import sha256
    import hmac
    import json

    issued_at = utcnow()
    expires_at = issued_at + timedelta(seconds=settings.approval_ttl_seconds)
    execution_id = f"exe_{uuid4().hex[:12]}"
    payload = _canonical_envelope_payload(
        execution_id=execution_id,
        playbook_id=playbook.id,
        playbook_hash=playbook.playbook_hash,
        target_hosts=request.target_hosts,
        vars=request.vars,
        approved_by=request.context.actor,
        issued_at=issued_at,
        expires_at=expires_at,
        justification=request.justification,
    )
    signature = hmac.new(
        settings.approval_secret.encode("utf-8"),
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"),
        sha256,
    ).hexdigest()
    return ApprovalEnvelope(signature=signature, **payload)


def _verify_envelope(envelope: ApprovalEnvelope) -> None:
    from hashlib import sha256
    import hmac
    import json

    if envelope.expires_at < utcnow():
        raise HTTPException(status_code=409, detail="Approval envelope expirado")
    payload = _canonical_envelope_payload(
        execution_id=envelope.execution_id,
        playbook_id=envelope.playbook_id,
        playbook_hash=envelope.playbook_hash,
        target_hosts=envelope.target_hosts,
        vars=envelope.vars,
        approved_by=envelope.approved_by,
        issued_at=envelope.issued_at,
        expires_at=envelope.expires_at,
        justification=envelope.justification,
    )
    signature = hmac.new(
        settings.approval_secret.encode("utf-8"),
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"),
        sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, envelope.signature):
        raise HTTPException(status_code=409, detail="Firma de approval envelope invalida")


def _canonical_envelope_payload(**kwargs: Any) -> dict[str, Any]:
    payload = dict(kwargs)
    payload["issued_at"] = payload["issued_at"].isoformat()
    payload["expires_at"] = payload["expires_at"].isoformat()
    return payload


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "service": settings.app_name,
        "env": settings.env,
        "playbooks": [item.id for item in playbooks.list()],
        "live_execution_enabled": settings.live_execution_enabled,
    }


@app.get("/api/v1/dev-token")
async def dev_token() -> dict[str, str]:
    token = create_dev_jwt(
        {"sub": "arturo", "role": "commander", "scope": "panal:c2"},
        settings.jwt_secret,
        expires_in=3600 * 12,
    )
    return {"token": token}


@app.get("/api/v1/hosts")
async def list_hosts(_claims: dict[str, Any] = Depends(get_current_claims)) -> list[dict[str, Any]]:
    return [host.model_dump(mode="json") for host in store.list_hosts()]


@app.get("/api/v1/policies/evaluate")
async def evaluate_policy(
    command: str = Query(...),
    actor: str = Query("operator"),
    actor_role: str = Query("security_admin"),
    source_ip: str = Query("127.0.0.1"),
    severity: str = Query("medium"),
    emergency: bool = Query(False),
    _claims: dict[str, Any] = Depends(get_current_claims),
) -> dict[str, Any]:
    playbook_id, _, warnings = indexer.resolve(command)
    playbook = playbooks.get(playbook_id) if playbook_id else None
    result = policy.evaluate(
        OperatorContext(actor=actor, actor_role=actor_role, source_ip=source_ip, severity=severity, emergency=emergency),
        playbook,
    )
    return {"playbook_id": playbook_id, "warnings": warnings, **result.model_dump(mode="json")}


@app.post("/api/v1/intents/resolve", response_model=IntentResolveResponse)
async def resolve_intent(request: IntentResolveRequest, _claims: dict[str, Any] = Depends(get_current_claims)) -> IntentResolveResponse:
    playbook_id, normalized_intent, warnings = indexer.resolve(request.command)
    if not playbook_id:
        return IntentResolveResponse(
            command=request.command,
            decision="deny",
            warnings=warnings,
            reasons=["No hay playbook determinista para esta orden."],
        )
    playbook = playbooks.get(playbook_id)
    assert playbook is not None
    extracted_vars = _extract_vars(request.command, playbook_id)
    decision = policy.evaluate(request.context, playbook)
    return IntentResolveResponse(
        command=request.command,
        normalized_intent=normalized_intent,
        playbook_id=playbook_id,
        decision=decision.decision,
        extracted_vars=extracted_vars,
        warnings=warnings,
        playbook_hash=playbook.playbook_hash,
        reasons=decision.reasons,
    )


@app.post("/api/v1/playbooks/{playbook_id}/approve", response_model=ApprovalResponse)
async def approve_playbook(playbook_id: str, request: ApprovalRequest, _claims: dict[str, Any] = Depends(get_current_claims)) -> ApprovalResponse:
    playbook = playbooks.get(playbook_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook no encontrado")

    known_hosts = {host.id for host in store.list_hosts()}
    if any(host_id not in known_hosts for host_id in request.target_hosts):
        raise HTTPException(status_code=400, detail="Uno o mas hosts no existen en el inventario")

    extracted_vars = _extract_vars(request.command, playbook_id)
    merged_vars = {**extracted_vars, **request.vars}
    request.vars = merged_vars
    decision = policy.evaluate(request.context, playbook)
    if decision.decision == "deny":
        raise HTTPException(status_code=403, detail={"reasons": decision.reasons})

    envelope = _issue_envelope(playbook, request)
    return ApprovalResponse(decision=decision.decision, reasons=decision.reasons, envelope=envelope)


@app.post("/api/v1/executions")
async def create_execution(request: ExecutionRequest, _claims: dict[str, Any] = Depends(get_current_claims)) -> dict[str, Any]:
    _verify_envelope(request.envelope)
    playbook = playbooks.get(request.envelope.playbook_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook no encontrado")
    if playbook.playbook_hash != request.envelope.playbook_hash:
        raise HTTPException(status_code=409, detail="Hash de playbook no coincide")
    if playbook.id == "incident.blackhole_source" and "source_ip" not in request.envelope.vars:
        raise HTTPException(status_code=400, detail="source_ip requerido para null routing")

    try:
        execution = await executor.queue_execution(request.envelope, playbook, request.context)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"execution_id": execution.id, "incident_id": execution.incident_id, "status": execution.status}


@app.get("/api/v1/executions/{execution_id}")
async def get_execution(execution_id: str, _claims: dict[str, Any] = Depends(get_current_claims)) -> dict[str, Any]:
    execution = store.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution no encontrada")
    return execution.model_dump(mode="json")


@app.get("/api/v1/incidents/{incident_id}")
async def get_incident(incident_id: str, _claims: dict[str, Any] = Depends(get_current_claims)) -> dict[str, Any]:
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")
    return incident.model_dump(mode="json")


@app.websocket("/ws")
async def websocket_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    try:
        decode_hs256_jwt(token or "", settings.jwt_secret)
    except ValueError:
        await websocket.close(code=4401)
        return

    await hub.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"event": "pong", "payload": {"ok": True}})
    except WebSocketDisconnect:
        hub.disconnect(websocket)
