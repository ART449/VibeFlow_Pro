from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException

from panal_app.config import settings
from panal_app.providers import AdapterRegistry
from panal_app.schemas import GuardianAnalysisRequest
from panal_app.workers import run_guardian_analysis


app = FastAPI(title="Panal Guardian Local", version="1.0.0")
adapters = AdapterRegistry()


def _validate_internal_token(value: str | None) -> None:
    if value != settings.internal_agent_token:
        raise HTTPException(status_code=401, detail="Internal token invalido")


@app.get("/health")
async def health() -> dict[str, object]:
    return {"service": "panal-guardian-local", "provider": "ollama-local"}


@app.post("/internal/analyze")
async def analyze(request: GuardianAnalysisRequest, x_internal_token: str | None = Header(default=None)) -> dict[str, object]:
    _validate_internal_token(x_internal_token)
    response = await run_guardian_analysis(request.host, request.profile, adapters)
    return response.model_dump(mode="json")
