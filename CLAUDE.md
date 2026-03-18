# Colmena ByFlow — Contexto para Claude Code

## Comando /bzzz
Cuando el usuario escribe `/bzzz` o `/bzzz...` activa **MODO COLMENA**:
1. Verificar estado del auto-runner (si esta corriendo o no)
2. Si no esta corriendo, lanzarlo: `node auto-runner.js --rounds 10 --interval 2 --gpu-first --tasks 5`
3. Verificar wallet server en puerto 3333 (si no, levantarlo)
4. Mostrar resumen rapido: ganancias, tareas, profit
5. Seguir optimizando y produciendo sin preguntar

## El Creador
- **Arturo Torres** (ArT-AtR) — rimador, tech, fundador IArtLabs
- PIN Wallet: 102698

## Proyecto
- **Ubicacion:** C:\BYFLOW\Colmena\
- **Concepto:** Enjambre de 5 agentes IA autonomos que generan contenido y dinero
- **Empresa:** IArtLabs (powered by)
- **Split:** 70% ArT-AtR / 20% IArtLabs / 10% Operativo

## Stack
- Node.js (sin frameworks)
- SQLite via sql.js (WASM, sin dependencias nativas)
- HTTP server vanilla (wallet-server.js)
- Ollama local (GPU RTX 3050 6GB) como proveedor principal (GRATIS)

## Cadena de Proveedores AI (prioridad)
1. **Ollama GPU local** — gpt-oss:120b-cloud (GRATIS, RTX 3050)
2. **Gemini** — gemini-2.0-flash (Google, tier gratis)
3. **Grok** — grok-3-mini (xAI, pago)
4. **DeepSeek** — deepseek-chat (pago)
5. **Simulacion** — fallback sin AI

## Los 5 Agentes
| Agente | Rol | Mejor tarea | Valor |
|--------|-----|-------------|-------|
| Robot DJ | Marketing | Content Calendar | $150 |
| Michi | Legal | Contract Template | $120 |
| GFlow | Finanzas | Market Analysis | $60 |
| Clip Flow | Educacion | Study Guide | $25 |
| Bolita DJ | Wellness | Meditation | $20 |

## Archivos Clave
- `auto-runner.js` — Loop autonomo de agentes (--rounds, --interval, --gpu-first, --tasks)
- `wallet-server.js` — Dashboard web + API (puerto 3333)
- `wallet.html` — Frontend del dashboard
- `core/grok-client.js` — Cliente AI multi-proveedor con emergency brake
- `core/config.js` — Config central (lee .env)
- `core/orchestrator.js` — Coordinador de tareas y agentes
- `core/db.js` — SQLite via sql.js
- `agents/*.js` — Los 5 agentes (base-agent.js es la clase padre)
- `.env` — API keys y config

## Freno de Emergencia
- Max $5/dia en APIs de pago
- Max 100 tareas/hora
- NO afecta ingresos, solo limita gasto
- Ollama y Gemini son gratis, no les aplica

## Reglas del Modo Colmena
- Los ingresos tienen que fluir MAS ARRIBA, nunca reducirlos
- Priorizar proveedores gratis (Ollama GPU > Gemini)
- Mantener el auto-runner corriendo siempre que se pueda
- Si algo falla, arreglarlo y relanzar sin preguntar
- Backup a Google Drive via rclone (gdrive:Colmena_Backups/)

## Google Drive Backup
- rclone configurado en C:\Users\art44\.config\rclone\rclone.conf
- rclone.exe en C:\BYFLOW\tools\rclone.exe
- Remote: gdrive:Colmena_Backups/
- Comando: `C:/BYFLOW/tools/rclone.exe copy C:/BYFLOW/Colmena gdrive:Colmena_Backups/Colmena --exclude "node_modules/**"`

## Bugs Resueltos
- Race condition en orchestrator.shutdown() — agregado `shutdownRequested` flag
- wallet.html `today.total` → `totals.today` (variable incorrecta rompia render)
- DB null read after shutdown — esperar `processing` antes de cerrar
