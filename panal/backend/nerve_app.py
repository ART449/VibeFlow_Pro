from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException

from panal_app.config import settings
from panal_app.schemas import NerveStepRequest
from panal_app.workers import execute_nerve_step


app = FastAPI(title="Panal Nerve Agent", version="1.0.0")


def _validate_internal_token(value: str | None) -> None:
    if value != settings.internal_agent_token:
        raise HTTPException(status_code=401, detail="Internal token invalido")


@app.get("/health")
async def health() -> dict[str, object]:
    return {"service": "panal-nerve-agent", "live_execution_enabled": settings.live_execution_enabled}


@app.post("/internal/execute-step")
async def execute_step(request: NerveStepRequest, x_internal_token: str | None = Header(default=None)) -> dict[str, object]:
    _validate_internal_token(x_internal_token)
    response = await execute_nerve_step(request.host, request.step, request.vars, request.live_execution)
    return response.model_dump(mode="json")

