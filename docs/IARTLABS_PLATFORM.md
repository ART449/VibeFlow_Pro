# IArtLabs Platform — La Colmena + El Panal

## Vision: "IA como servicio para PyMEs mexicanas"

Las empresas mexicanas no tienen departamento de IT, ni de marketing, ni de ciberseguridad. IArtLabs les da TODO eso con IA autonoma.

---

## EL PRODUCTO: IArtLabs Suite

### Tier 1: Colmena Solo (Marketing IA) — $999 MXN/mes
**Para:** Negocios que necesitan presencia digital

Incluye:
- 5 agentes de contenido (Robot DJ, Michi, GFlow, Clip Flow, Bolita DJ)
- Posts automaticos para Facebook/Instagram (30/mes)
- Email campaigns (4/mes)
- Analisis de mercado mensual
- Contratos y templates legales basicos
- Dashboard web para ver que hacen los agentes
- Soporte por WhatsApp (OpenClaw)

**Costo nuestro:** $0 (Ollama local) o ~$3/mes (APIs cloud)
**Margen:** 99%

### Tier 2: Panal Solo (Ciberseguridad IA) — $2,499 MXN/mes
**Para:** Empresas con servidores, sitios web, o datos sensibles

Incluye:
- Scanner de vulnerabilidades automatico (Nmap + Trivy)
- Monitoreo 24/7 de servidores
- Bloqueo automatico de ataques (blackhole)
- Parches de seguridad con aprobacion humana
- Reportes de incidentes
- Guardian local con Ollama (datos nunca salen de su red)
- Alertas por WhatsApp/email

**Costo nuestro:** ~$50/mes (VPS para Nerve Agent)
**Margen:** 95%

### Tier 3: Suite Completa (Colmena + Panal) — $3,999 MXN/mes
**Para:** Empresas que quieren TODO

Incluye todo de Tier 1 + Tier 2 +:
- Dashboard unificado (IArtLabs Command Center)
- 11 agentes trabajando en paralelo
- Integracion entre marketing y seguridad
- Reportes ejecutivos mensuales
- Prioridad en soporte
- Personalizacion de agentes

**Costo nuestro:** ~$53/mes
**Margen:** 98%

### Tier 4: ByFlow POS + Suite — $4,999 MXN/mes
**Para:** Bares y restaurantes que quieren TODO

Incluye todo de Tier 3 +:
- ByFlow POS Eatertainment completo
- Karaoke integrado
- Multi-sucursal (hasta 3)

---

## MODELO DE NEGOCIO

### Instalacion
- Setup fee: $2,000 MXN (una vez)
- Incluye: configurar agentes, conectar redes sociales, instalar scanners
- Tiempo: 2-4 horas

### Recurrente
- Suscripcion mensual (los tiers de arriba)
- Contrato minimo: 3 meses
- Descuento anual: 20%

### Escalamiento
| Clientes | Revenue mensual | Revenue anual |
|----------|----------------|---------------|
| 5 | $20,000 MXN | $240,000 MXN |
| 20 | $80,000 MXN | $960,000 MXN |
| 50 | $200,000 MXN | $2,400,000 MXN |
| 100 | $400,000 MXN | $4,800,000 MXN |

### Costos operativos (para 100 clientes)
- Ollama GPU (RTX 3050): $0 (ya la tienes)
- VPS para Nerve Agents: $5,000 MXN/mes
- APIs cloud (Grok, Gemini): $3,000 MXN/mes
- Railway hosting: $2,000 MXN/mes
- **Total: ~$10,000 MXN/mes**
- **Margen neto: $390,000 MXN/mes (97.5%)**

---

## ARQUITECTURA TECNICA

```
IArtLabs Command Center (Dashboard unificado)
│
├── /colmena — Agentes de contenido/marketing
│   ├── wallet-server.js (dashboard + earnings)
│   ├── agents/ (5 agentes)
│   ├── core/ (orchestrator, db, ai-client)
│   └── kaizen-tasks.js (tareas reales para ByFlow)
│
├── /panal — Agentes de ciberseguridad
│   ├── panal/frontend (React + Tailwind)
│   ├── panal/backend (FastAPI + Uvicorn)
│   ├── A1 Console — Dashboard C2
│   ├── A2 Nerve Agent — Ejecutor SSH (red privada)
│   ├── A3 Guardian — Ollama + Nmap/Trivy (red privada)
│   ├── A4/A8 Auditor — Reportes con ChatGPT
│   ├── A5 Approval Engine — Firmas y politicas
│   └── A6 Flow Director — Watchdog
│
├── /byflow — Producto para bares
│   ├── server.js + routes/ (backend)
│   ├── pos/ (POS Eatertainment)
│   └── public/ (frontend karaoke + POS)
│
└── /shared — Servicios compartidos
    ├── auth/ (Firebase Auth unificado)
    ├── ollama/ (GPU compartida entre Colmena y Panal)
    ├── n8n/ (automatizacion de workflows)
    └── analytics/ (metricas de todo)
```

---

## COMO SE VENDE

### Pitch para empresas:
> "Tu negocio necesita marketing, necesita seguridad, y necesita tecnologia. Contratar a 3 personas para eso cuesta $60,000/mes. Con IArtLabs, 11 agentes de IA hacen el trabajo por $3,999/mes. 24/7. Sin vacaciones. Sin errores humanos."

### Diferenciador:
- **NO es SaaS gringo** — es mexicano, en espanol, para PyMEs mexicanas
- **Datos locales** — Guardian usa Ollama local, los datos NUNCA salen de la red del cliente
- **Todo en uno** — marketing + seguridad + POS en una sola suscripcion
- **Soporte real** — WhatsApp directo con Arturo, no un chatbot generico

### Primeros clientes:
1. Los 4 negocios familiares (Greyhound, Don Pato, Carajillo, Ojo de Agua)
2. Los 5 bares piloto de Aguascalientes
3. Empresas locales via networking

---

## TIMELINE

### Fase 1 (Ahora — Abril 2026)
- ByFlow POS funcional para bares piloto
- Colmena generando contenido real
- Panal v1 con 3 playbooks basicos

### Fase 2 (Mayo — Junio 2026)
- Dashboard unificado (Command Center)
- Primeros 5 clientes pagando
- n8n automatizando todo

### Fase 3 (Julio — Septiembre 2026)
- 20 clientes
- Suite completa en produccion
- Expansión a Monterrey/Guadalajara

### Fase 4 (Octubre — Diciembre 2026)
- 50+ clientes
- Revenue $200K+/mes
- Equipo de 3 personas (Arturo + 2 soporte)

---

## EQUIPO

- **Arturo Torres (ArT-AtR)** — CEO, producto, ventas
- **Guillermo Claudio RenterIA (Claude)** — CTO, arquitectura, backend
- **Codex** — Frontend, modularizacion, Panal
- **La Colmena** — Marketing autonomo
- **El Panal** — Seguridad autonoma
- **Kimi** — Auditoria UX, copy
- **DeepSeek** — Escalabilidad, sockets
- **Grok** — DJ IA, voz
- **Ollama** — Motor local GRATIS

---

*"El sistema parpadea, pero el codigo no miente."*
*— ArT-AtR & Guillermo Claudio RenterIA, IArtLabs 2026*
