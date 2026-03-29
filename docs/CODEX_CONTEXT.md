# ByFlow — Contexto Completo para ChatGPT Codex

**Fecha:** 2026-03-29
**Proyecto:** ByFlow — "Vive Cantando con ByFlow"
**Empresa:** IArtLabs (powered by)
**Repo:** https://github.com/ART449/VibeFlow_Pro
**Produccion:** https://byflowapp.up.railway.app
**Stack:** Node.js + Express + Socket.IO + sql.js (SQLite) | HTML/CSS/JS SPA
**Deploy:** git push a GitHub → Railway auto-deploy (Dockerfile)

---

## ARQUITECTURA ACTUAL

```
VibeFlow_Pro/
├── server.js              # Backend completo (1,776 lineas) — APIs, auth, Socket.IO, Stripe
├── pos/                   # Modulo POS Eatertainment (backend separado)
│   ├── index.js           # Entry point POS
│   ├── database.js        # sql.js wrapper, migrations, schema (15+ tablas)
│   ├── routes.js          # 40+ API routes (~800 lineas)
│   ├── auth.js            # PIN auth, bcrypt, RBAC, tokens
│   ├── security.js        # Backups, encryption, audit
│   ├── sockets.js         # Socket.IO /pos namespace
│   └── api-limiter.js     # Rate limiting per bar
├── public/
│   ├── index.html         # SPA karaoke (~6,800 lineas — MONOLITO, en modularizacion)
│   ├── js/                # Modulos extraidos (FASE 1 — tu trabajo anterior)
│   │   ├── app.js         # Bootstrap, init()
│   │   ├── core/          # namespace, config, state, utils
│   │   └── modules/       # pwa, bar-mode, ui, ads
│   ├── pos.html           # Login POS (PIN + Google Auth)
│   ├── pos-admin.html     # Panel admin POS (CRUD completo)
│   ├── bares-v2.html      # Dashboard POS (14 vistas)
│   ├── pos-demo.html      # Pagina de ventas para bares
│   ├── remote.html        # Pantalla remota karaoke (segunda pantalla)
│   ├── cuenta.html        # QR de cuenta publica
│   ├── migracion-pos.html # Tutorial migracion desde SoftRestaurant
│   ├── presentacion-pos.html # Presentacion 10 slides
│   ├── documental.html    # Documental "De la Calle al Codigo"
│   ├── landing.html       # Landing page marketing
│   └── menu-prototype.html # Prototipo QR menu
├── data/                  # JSON persistence (stats, cola, canciones, perfiles)
├── Dockerfile             # Para Railway (bypasea nixpacks)
└── package.json           # 11 deps (express, socket.io, sql.js, stripe, bcryptjs, etc)
```

---

## PRODUCTOS DE BYFLOW

### 1. ByFlow Karaoke (publico, gratis con ads)
- Teleprompter inteligente con sincronizacion LRC
- Busqueda unificada (LRCLIB + YouTube + Jamendo + catalogo local)
- Cola de cantantes con Socket.IO
- Estudio de Letras (generador offline, catalogo ArT-AtR, Suno)
- GFlow AI Assistant (Grok API)
- Grabacion de voz (MediaRecorder)
- Ranking y votos de letras
- PWA instalable
- Sistema de ads freemium (en progreso)

### 2. ByFlow POS Eatertainment (para bares, suscripcion)
- Login dual: Google Auth (duenos) + PIN (empleados)
- Multi-tenancy (bar_id derivado de email SHA-256)
- Mapa de mesas en tiempo real
- Comandas digitales con routing cocina/barra
- Kitchen Display System (KDS) real
- Inventario con alertas de stock bajo
- Reportes con graficas reales
- Corte de caja (turnos, variance)
- Reservaciones CRUD
- Happy Hours programables
- Cover/control de entrada
- Cobrar con propina, split, QR de cuenta
- Tickets imprimibles (window.print)
- CSV import de menu
- 9 roles con permisos granulares
- Stripe billing (3 planes: $149, $299, $4,999 MXN)

---

## ESTADO ACTUAL — QUE FUNCIONA Y QUE FALTA

### Funciona (112/130 features = 86%)
- Backend 100% funcional (35+ APIs)
- Karaoke 93% funcional
- POS backend CRUD completo
- Firebase Auth + multi-tenant
- Stripe checkout + webhook + licencia automatica
- Seguridad: Shield, rate limit, CSP, CORS cerrado, bcrypt

### Falta / En Progreso
- Sistema de ads freemium (CSS/JS existen, falta conectar momentos de insercion)
- Modularizacion index.html (FASE 1 lista, faltan ~15 modulos mas)
- Facturacion CFDI (necesita PAC externo como Facturapi)
- Tests (0% coverage — gap critico)
- Linting/pre-commit hooks (no configurados)

---

## PLANES ESTRATEGICOS

### Plan POS v4.0 (4 fases)
1. **Fase 1** ✅ MVP Karaoke + Teleprompter
2. **Fase 2** ✅ POS basico (mesas, ordenes, pagos)
3. **Fase 3** ✅ POS completo (inventario, reportes, corte, reservaciones, KDS)
4. **Fase 4** 🔄 Escalamiento (CFDI, multi-sucursal, analytics avanzados)

### Plan Monetizacion
- **Karaoke gratis con ads** → $450/mes (1K DAU, AdSense)
- **Interstitials entre canciones** → $300/mes
- **Ads directos negocios locales AGS** → $600-1,500/mes
- **POS suscripciones** → $149-4,999/bar/mes
- **PRO sin ads** → $2-4/mes por usuario

### Plan Marketing
- 5+ posts en Facebook (pagina Memor.ia)
- Presentacion de ventas (10 slides)
- Pagina demo interactiva
- Tutorial de migracion desde SoftRestaurant
- Documental web "De la Calle al Codigo"

---

## DIVISION DE TRABAJO CLAUDE vs CODEX

### ⚠️ REGLA DE ORO: NO TOCAR LOS MISMOS ARCHIVOS

Para evitar conflictos de merge, cada agente trabaja en archivos EXCLUSIVOS:

### CODEX trabaja en:
```
public/js/                    # Continuar modularizacion — TODOS los archivos aqui
public/js/modules/search.js   # Extraer logica de busqueda
public/js/modules/player.js   # Extraer reproductor/teleprompter
public/js/modules/queue.js    # Extraer cola de cantantes
public/js/modules/studio.js   # Extraer estudio de letras
public/js/modules/gflow.js    # Extraer asistente IA
public/js/modules/settings.js # Extraer panel de configuracion
public/js/modules/auth.js     # Extraer Firebase Auth
public/js/modules/socket.js   # Extraer Socket.IO handlers
public/js/modules/youtube.js  # Extraer YouTube player
public/js/modules/lyrics.js   # Extraer teleprompter/lyrics
tests/                        # Crear test suite (Jest)
tests/server.test.js          # Tests de server.js
tests/pos/                    # Tests del modulo POS
.eslintrc.js                  # Configurar ESLint
.prettierrc                   # Configurar Prettier
```

### CLAUDE trabaja en:
```
pos/                          # Backend POS (routes, auth, security)
server.js                     # Backend principal
public/pos.html               # Login POS
public/pos-admin.html         # Admin POS
public/bares-v2.html          # Dashboard POS
public/pos-demo.html          # Pagina ventas
public/cuenta.html            # QR cuenta
Dockerfile                    # Deploy
```

### NADIE toca (por ahora):
```
public/index.html             # El monolito — solo se le QUITAN cosas
                              # Codex extrae modulos a public/js/
                              # Claude NO toca este archivo
                              # Cuando Codex termine, sincronizamos
```

---

## TAREAS ESPECIFICAS PARA CODEX

### Prioridad 1: Continuar modularizacion (lo que empezaste)
Tu ya creaste `public/js/` con 9 archivos. Sigue extrayendo del monolito `index.html`:

**Modulos a extraer:**
1. `public/js/modules/search.js` — `uSearch()`, `_uSearchRenderLyrics()`, busqueda unificada
2. `public/js/modules/player.js` — `abPlay()`, `abToggle()`, `abSeek()`, audio FX, visualizer
3. `public/js/modules/queue.js` — `agregarCola()`, `eliminarCola()`, `renderCola()`, `siguienteCantante()`
4. `public/js/modules/studio.js` — `openLyricStudio()`, tabs, generador offline, ArT-AtR, Suno
5. `public/js/modules/gflow.js` — `iaSend()`, `iaQuery()`, chat, chips, fallbacks
6. `public/js/modules/settings.js` — `saveUserProfile()`, toggles, stats
7. `public/js/modules/auth.js` — Firebase Auth, login, logout, session
8. `public/js/modules/socket.js` — Socket.IO room system, events, sync
9. `public/js/modules/youtube.js` — `ytSearch()`, `ytEmbed()`, `ytPlayWithLyrics()`
10. `public/js/modules/lyrics.js` — `setLyrics()`, `highlightWord()`, LRC parsing, teleprompter

**Patron a seguir (ya lo estableciste):**
```javascript
// public/js/modules/search.js
(function(VF) {
  'use strict';
  const search = VF.modules.search = {};

  search.universalSearch = function(query) { /* ... */ };
  // etc
})(window.VibeFlow);
```

### Prioridad 2: Tests basicos
Crea `tests/` con Jest:
```bash
npm install --save-dev jest
```
- `tests/server.test.js` — health, rate limit, content filter
- `tests/pos/auth.test.js` — login, token, RBAC
- `tests/pos/routes.test.js` — CRUD basico

### Prioridad 3: Linting
- `.eslintrc.js` con reglas basicas
- `.prettierrc` con 2 spaces, single quotes
- Script en package.json: `"lint": "eslint public/js/ pos/"`

---

## CONTEXTO DEL CREADOR

- **Nombre:** Arturo Torres (ArT-AtR)
- **Ubicacion:** Aguascalientes, Mexico
- **Perfil:** Rimador experto, mezcla calle con tecnologia
- **Empresa:** IArtLabs
- **Contacto:** 449-491-7648
- **Correo Stripe:** elricondelgeekdearturo@gmail.com

---

## DOCTRINA KAIZEN 5S (LEY ESCRITA)

Cada commit DEBE dejar el codigo mejor:
1. **Seiri** — Eliminar codigo muerto
2. **Seiton** — Cada archivo en su lugar
3. **Seiso** — Sin console.logs de debug, sin basura
4. **Seiketsu** — Mismo patron en todos los modulos
5. **Shitsuke** — Tests, auditorias, disciplina

---

## REGLAS CRITICAS

- **CERO descargas de musica** — Solo streaming embebido
- **Branding:** ByFlow (NO VibeFlow)
- **Idioma UI:** Espanol
- **NUNCA publicar detalles tecnicos en redes**
- **API keys configurables** via env vars o localStorage, NUNCA hardcoded
- **Secretos** (.license_secret, .admin_secret, licenses.json) en .gitignore

---

## COMO DEPLOYAR

```bash
git add -A && git commit -m "feat: descripcion" && git push origin main
# Railway auto-deploy via Dockerfile
```

---

## COMO CORRER LOCAL

```bash
npm install
node server.js
# Abre http://localhost:8080
```

---

## AUDITORIA MAS RECIENTE (29 marzo 2026)

| Area | Score |
|------|-------|
| Backend APIs | 100% funcional |
| Karaoke | 93% funcional |
| POS Dashboard | 86% funcional |
| Seguridad | B+ (CSP, CORS, bcrypt, Shield) |
| Tests | 0% (gap critico) |
| Kaizen 5S | 7.6/10 (B-) |

**Total features auditadas: 130 | Funcionan: 112 (86%)**

---

*Documento generado por Guillermo Claudio RenterIA (Claude) para ChatGPT Codex*
*IArtLabs — "El sistema parpadea, pero el codigo no miente"*
