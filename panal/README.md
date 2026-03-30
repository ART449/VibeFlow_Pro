# Panal

Panal es una consola de operacion y remediacion Zero-Trust separada de ByFlow. Vive en el mismo workspace, pero no comparte runtime, rutas ni identidad con ByFlow.

## Piezas

- `backend/c2_app.py`: API publica endurecida, ABAC, approval engine, audit y WebSocket.
- `backend/nerve_app.py`: ejecutor privado para pasos de playbook y SSH controlado.
- `backend/guardian_app.py`: analisis offline local para escaneo y clasificacion sensible.
- `frontend/`: consola React + Tailwind + Chart.js para C2.

## Playbooks v1

- `host.scan_security`
- `host.patch.openssh`
- `incident.blackhole_source`

## Arranque local

### Backend C2

```bash
cd panal/backend
uvicorn c2_app:app --host 0.0.0.0 --port 8008 --reload
```

### Nerve Agent

```bash
cd panal/backend
uvicorn nerve_app:app --host 0.0.0.0 --port 8010 --reload
```

### Guardian Local

```bash
cd panal/backend
uvicorn guardian_app:app --host 0.0.0.0 --port 8011 --reload
```

### Frontend

```bash
cd panal/frontend
npm install
npm run dev
```

## Pruebas backend

```bash
cd panal/backend
python -m unittest tests.test_panal_backend
```

## Variables utiles

- `PANAL_JWT_SECRET`
- `PANAL_APPROVAL_SECRET`
- `PANAL_INTERNAL_AGENT_TOKEN`
- `PANAL_ENABLE_LIVE_EXECUTION`
- `PANAL_NERVE_AGENT_URL`
- `PANAL_GUARDIAN_URL`
- `PANAL_OPERATOR_CIDRS`

## Nota operativa

La ejecucion real por SSH queda desactivada por default. Para activarla se requiere `PANAL_ENABLE_LIVE_EXECUTION=true`, hosts validos en inventario y approval envelope firmado.

