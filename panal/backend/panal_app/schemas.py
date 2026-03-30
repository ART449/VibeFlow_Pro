from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


PolicyDecision = Literal["allow", "deny", "require_approval"]


class OperatorContext(BaseModel):
    actor: str = "operator"
    actor_role: str = "security_admin"
    source_ip: str = "127.0.0.1"
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    emergency: bool = False
    requested_at: datetime | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class StepDefinition(BaseModel):
    id: str
    kind: str
    label: str
    command: str | None = None
    profile: str | None = None
    live_capable: bool = False
    emits_telemetry: bool = False


class PlaybookDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    intent: str
    risk_level: Literal["low", "medium", "high", "critical"]
    description: str
    vars_schema: dict[str, Any]
    steps: list[StepDefinition]
    rollback: list[StepDefinition]
    approval_policy: dict[str, Any]
    allowed_targets: list[str]
    artifact_policy: dict[str, Any]
    tags: list[str] = Field(default_factory=list)
    playbook_hash: str | None = None


class HostRecord(BaseModel):
    id: str
    display_name: str
    address: str
    ssh_user: str
    environment: str
    target_group: str
    tags: list[str] = Field(default_factory=list)
    status: str = "ready"


class IntentResolveRequest(BaseModel):
    command: str
    context: OperatorContext


class PolicyEvaluationResponse(BaseModel):
    decision: PolicyDecision
    reasons: list[str]
    trusted_ip: bool
    within_hours: bool


class IntentResolveResponse(BaseModel):
    command: str
    normalized_intent: str | None = None
    playbook_id: str | None = None
    decision: PolicyDecision
    extracted_vars: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    deterministic: bool = True
    used_ai: bool = False
    playbook_hash: str | None = None
    reasons: list[str] = Field(default_factory=list)


class ApprovalRequest(BaseModel):
    command: str
    context: OperatorContext
    target_hosts: list[str]
    vars: dict[str, Any] = Field(default_factory=dict)
    justification: str = Field(min_length=5, max_length=400)


class ApprovalEnvelope(BaseModel):
    execution_id: str
    playbook_id: str
    playbook_hash: str
    target_hosts: list[str]
    vars: dict[str, Any]
    approved_by: str
    issued_at: datetime
    expires_at: datetime
    justification: str
    signature: str


class ApprovalResponse(BaseModel):
    decision: PolicyDecision
    reasons: list[str]
    envelope: ApprovalEnvelope


class ExecutionRequest(BaseModel):
    envelope: ApprovalEnvelope
    context: OperatorContext


class ExecutionRecord(BaseModel):
    id: str
    incident_id: str
    playbook_id: str
    playbook_hash: str
    target_hosts: list[str]
    vars: dict[str, Any]
    status: Literal["queued", "running", "succeeded", "failed", "blocked"]
    mode: Literal["simulate", "live"]
    approved_by: str
    created_at: datetime
    updated_at: datetime
    logs: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)


class IncidentRecord(BaseModel):
    id: str
    title: str
    severity: Literal["low", "medium", "high", "critical"]
    status: Literal["open", "remediating", "closed", "blocked"]
    playbook_id: str
    host_ids: list[str]
    summary: str
    created_at: datetime
    updated_at: datetime
    audit_report: str | None = None


class AuditEntry(BaseModel):
    kind: str
    created_at: datetime
    execution_id: str | None = None
    incident_id: str | None = None
    payload: dict[str, Any]


class NerveStepRequest(BaseModel):
    host: HostRecord
    step: StepDefinition
    vars: dict[str, Any] = Field(default_factory=dict)
    live_execution: bool = False


class NerveStepResponse(BaseModel):
    ok: bool
    mode: Literal["simulate", "live"]
    log: dict[str, Any]
    telemetry: dict[str, Any] | None = None


class GuardianAnalysisRequest(BaseModel):
    host: HostRecord
    profile: str = "standard"
    artifact_refs: list[str] = Field(default_factory=list)


class GuardianAnalysisResponse(BaseModel):
    ok: bool
    summary: str
    findings: list[dict[str, Any]]
    artifacts: list[dict[str, Any]]
