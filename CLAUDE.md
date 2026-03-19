# ByFlow — Contexto para Claude Code

## El Creador
- **Nombre:** Arturo Torres
- **Alias:** ArT - AtR ("Art en el arte de rimarte")
- **Perfil:** Rimador experto en verso, prosa y lirica tecnica. Mezcla la crudeza de la calle con la precision de la tecnologia (hacking, algoritmos, IA).
- **Filosofia:** "El sistema parpadea, pero el codigo no miente"
- **Estilo lirico:** Tecnico-sentimental. Metricas de octosilabos para versos, rimas consonantes pareadas (AABB) para estribillos. Terminologia de software con metaforas de vida y superacion.
- **Tematicas base:**
  - Tecnologia & Trap: terminos como 404, glitch, matrix, hacking, data, binary
  - Desamor & Realidad: idealizacion, manipulacion, decepcion
  - Redencion & Familia: guia paterna, lucha contra vicios

## Proyecto
- **Nombre:** ByFlow — "Vive Cantando con ByFlow"
- **Empresa:** IArtLabs (powered by)
- **Version:** v4.0 (Fases 1-3 completadas)
- **Produccion:** https://byflowapp.up.railway.app
- **Repo:** https://github.com/ART449/VibeFlow_Pro
- **Stack:** Node.js + Express + Socket.IO (server.js) | HTML/CSS/JS SPA (public/index.html)
- **Concepto:** Karaoke inteligente y teleprompter para raperos/cantantes. Cero contaminacion visual. El software es un "Director Vocal" que escucha y guia.
- **Vision v4.0:** Ecosistema creativo que conecta bares, escritores y productores via beats de YouTube

---

## Estructura del Repositorio

```
VibeFlow_Pro/
├── server.js                  # Backend completo (~1570 lineas): API REST, licencias, Socket.IO, seguridad
├── grok-client.js             # Screen capture & OCR analyzer (uso local)
├── package.json               # Dependencias Node.js (express, socket.io, stripe, etc.)
├── railway.json               # Config deploy Railway (build + start commands)
│
├── public/                    # Frontend SPA
│   ├── index.html             # TODO el frontend (~9100 lineas): HTML + CSS + JS monolitico
│   ├── display.html           # Vista display-only teleprompter (TV/proyectores)
│   ├── landing.html           # Landing page de marketing (SEO, pricing, features)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker (cache-first assets, network-first API)
│   ├── icon-192.svg           # PWA icon
│   ├── icon-512.svg           # PWA icon
│   └── sfx/                   # 9 sound effects (airhorn, applause, bassdrop, etc.)
│
├── data/                      # Persistencia JSON (auto-creados por server.js)
│   ├── canciones.json         # Canciones guardadas con letras
│   ├── cola.json              # Cola de cantantes
│   ├── stats.json             # Estadisticas de uso
│   ├── teleprompter.json      # Estado actual del teleprompter
│   ├── letras-beat.json       # Combinaciones beat+letras (Estudio)
│   ├── perfiles.json          # Perfiles de creadores
│   ├── actividad.json         # Feed de actividad
│   ├── eventos.json           # Eventos/Tocadas
│   ├── security_log.json      # Log de seguridad (XSS, SQLi detections)
│   ├── letras_art_atr.txt     # Catalogo maestro 41 canciones ArT-AtR
│   ├── .license_secret        # (gitignored) HMAC-SHA256 key
│   ├── .admin_secret          # (gitignored) Admin API key
│   └── licenses.json          # (gitignored) Licencias activas
│
├── python/                    # Utilidades Python (audio_processor.py)
├── docs/                      # Branding (BRAND_KIT_IARTLABS.md)
│
├── CLAUDE.md                  # ESTE ARCHIVO — contexto para Claude Code
├── ESTADO_PROYECTO.md         # Estado actual y completados por sesion
├── PLAN_MAESTRO_v4.md         # Plan v4.0 (4 fases, legal, modelo de negocio)
├── IDEAS_PARA_LANZAR.md       # Ideas que requieren investigacion
├── BYFLOW_PRODUCTION.md       # Docs produccion y referencia API
├── BYFLOW_NOTEBOOKLM.md       # Docs generados por NotebookLM
│
├── ARRANCAR.bat               # Script Windows: iniciar server local
├── SUBIR_A_GITHUB.bat         # Script Windows: push a GitHub
├── DEPLOY_RAILWAY.bat         # Script Windows: deploy a Railway
└── termux-monitor.sh          # Monitoreo desde Termux
```

---

## Tech Stack

| Componente | Tecnologia | Notas |
|-----------|------------|-------|
| **Backend** | Node.js + Express | Puerto 8080, server.js monolitico |
| **Real-time** | Socket.IO v4.7 | Rooms por DJ, broadcast global |
| **Frontend** | Vanilla HTML/CSS/JS | SPA monolitica, sin frameworks |
| **Persistencia** | JSON files en data/ | Sin base de datos, debounced saves |
| **IA** | GFlow (Grok API de xAI) + Ollama (local) | Chat, generacion de letras, LRC |
| **Pagos** | Stripe (dormant) | Endpoints listos, sin keys en prod |
| **Deploy** | Railway.app | Auto-deploy desde GitHub push a main |
| **PWA** | Service Worker + manifest.json | Soporte offline parcial |
| **Audio** | Web Audio API | Visualizador, jingle, efectos SFX |

**Dependencias npm:** express, socket.io, compression, cors, dotenv, stripe, qrcode

---

## Modos de la app (v4.0)
1. **Karaoke** (GRATIS) — Teleprompter, cola de cantantes, letras sincronizadas, auto-queue
2. **Musica** (PRO) — YouTube/SoundCloud/Jamendo streaming embebido
3. **Bares** (PRO) — Mesas, promos, jingle, soundboard 9 pads, menu restaurante, Noches de Talento
4. **IA Studio** (PRO) — GFlow (Grok API), generar letras, chat, generador LRC karaoke
5. **Estudio** (GRATIS v4) — Doble reproductor beat+voz, editor de letra, ranking, Motor ARTATR v3
6. **Vistas** — DJ Dashboard multi-panel (cola + teleprompter + YouTube search)
7. **Remote** — Vista publica teleprompter (solo lectura, via QR con ?room=XXXX)

---

## Arquitectura del Backend (server.js)

### Inicializacion y Middleware
- Express + HTTP server + Socket.IO
- CORS configurable via env `CORS_ORIGINS` (comma-separated)
- Gzip compression (~75% reduccion)
- Rate limiting global: 60 req/min/IP
- Cache headers: static assets con maxAge 1 dia

### Sistema de Seguridad
- **Security Shield:** Escaneo de 18+ patrones maliciosos en inputs (XSS, SQLi, path traversal, command injection, NoSQL injection, SSTI, webshells)
- **Filtro de contenido:** 35+ palabras prohibidas (ES+EN), validacion server+client side
- **Log de seguridad:** data/security_log.json (max 500 entries, auto-rotate)

### Sistema de Licencias
- Device Fingerprint: SHA256(hostname + MAC)
- Format: `VFP-XXXXX-XXXXX-XXXXX-XXXXX` (20 chars + 4-char HMAC-SHA256)
- Rate limit activacion: 5 intentos/min/IP
- Admin endpoints protegidos con `X-Admin-Key` header
- SUPERUSER bypass para el dueno

### Persistencia
- JSON file-based (sin database)
- Debounced saves (1000ms) para reducir disk I/O
- Graceful shutdown handlers (SIGTERM/SIGINT) para flush pendiente
- Auto-load on startup, auto-save on change

### API REST (56+ endpoints)

**Cola:** GET/POST/PATCH/DELETE `/api/cola`, POST `/api/cola/reorder`, `/api/cola/clean`
**Canciones:** CRUD `/api/canciones`
**Teleprompter:** GET/POST `/api/teleprompter`
**Mesas:** GET/PATCH `/api/mesas/:num`
**YouTube:** GET `/api/youtube/search`, `/api/youtube/free-search`, `/api/youtube/videos`
**LRCLIB:** GET `/api/lrclib/search` (CORS proxy)
**Licencias:** GET/POST `/api/license/status|activate|deactivate`, admin endpoints
**IA/GFlow:** POST `/api/ai/chat`, GET `/api/ai/status`
**Letras-Beat:** POST/GET `/api/letras-beat`, ranking, publicar, votos
**Eventos:** POST/GET `/api/eventos`, inscribir, votar, resultados (7 endpoints)
**Perfiles:** POST `/api/perfiles/register|login`, GET/PUT `/api/perfiles/:alias`
**Actividad:** GET `/api/actividad`
**Stats:** GET `/api/stats`
**Health:** GET `/api/health`
**QR:** GET `/api/qr`
**Billing:** POST `/api/stripe/webhook`, `/api/billing/checkout-session|customer-portal`, GET `/api/billing/status`
**Seguridad:** GET/DELETE `/api/security/log`

### Socket.IO Events

**Server → Client:**
- `init` — Sync inicial (cola, mesas, teleprompter, canciones)
- `cola_update` — Cola cambio
- `mesas_update` — Mesas actualizadas
- `tp_update` — Teleprompter state (lyrics, word, speed, playing)
- `tp_speed_update` — Velocidad scroll
- `singer_changed` — Cantante activo cambio
- `room_joined`, `room_count`, `online_count` — Conexiones
- `actividad` — Feed en tiempo real
- `evento_update`, `evento_estado`, `evento_voto` — Eventos
- `validation_error` — Fallo de validacion

**Client → Server:**
- `join_room` — Unirse a sala DJ
- `tp_scroll`, `tp_lyrics`, `tp_speed` — Control teleprompter
- `cola_add`, `cola_next` — Control cola

**Room System:** Cada DJ genera roomId unico. Teleprompter es POR ROOM. Cola/mesas son globales.

---

## Arquitectura del Frontend (public/index.html)

### Estructura del Monolito (~9100 lineas)
1. **CSS** (~2000 lineas) — Variables root, layout grid, componentes, animaciones, responsive, temas claro/oscuro
2. **HTML** — Welcome overlay, topbar, sidebar, center area, right panel, modals, mobile nav
3. **JavaScript** — Toda la logica SPA: modos, cola, teleprompter, musica, Socket.IO, licencias, IA, bares, estudio, stats, settings, temas

### Layout Grid
- Topbar (54px) | Sidebar | Center | Right Panel | Player Bar
- Responsive: 900px (tablet), 600px (mobile)
- Temas: dark/light con CSS variables y persistencia localStorage

### Funciones JavaScript Principales
- `initApp()`, `setMode(mode)` — Inicializacion y cambio de modo
- `agregarCola()`, `activarCantante()`, `siguienteCantante()` — Gestion cola
- `cargarLetra()`, `scrollTeleprompter()` — Teleprompter
- `ytPlayWithLyrics()` — YouTube + auto-busqueda de letras en LRCLIB
- `iaChat()`, `iaGenerateLyrics()` — GFlow IA
- `generateOfflineLyrics()` — Motor ARTATR v3 (192 frases, 65+ rimas)
- `showToast(msg, type)` — Notificaciones toast

### Arrays de Datos Hardcodeados
- `_artLetras` — 11 letras completas de ArT-AtR
- `_sunoTracks` — 30 tracks del perfil Suno ART-ATR
- Motor ARTATR v3 — Frases, rimas y vocabulario para generacion offline

---

## Al iniciar sesion
1. Leer `ESTADO_PROYECTO.md` para saber donde quedamos
2. Preguntar al usuario que quiere priorizar hoy
3. Verificar si hay algo roto en produccion antes de agregar features

---

## Reglas del proyecto (OBLIGATORIAS)

### Branding
- **Nombre:** ByFlow (NUNCA VibeFlow, NUNCA Vibe Flow)
- **Lema:** "Vive Cantando con ByFlow"
- **Creditos:** powered by IArtLabs
- **Credito creador:** "hecho por Arturo Torres" bajo el logo
- **Idioma UI:** Espanol

### Anti-pirateria (ESTRICTO)
- **CERO descargas de musica** — Solo streaming embebido
- No existe endpoint de descarga de audio
- No se usa yt-dlp, ytdl, ni ningun downloader
- YouTube solo via iframe embed
- SoundCloud solo via widget embed
- Jamendo streaming via su API (musica CC libre)

### Propiedad intelectual (OBLIGATORIA)
- **TODA letra generada por ByFlow** (IA o generador offline) lleva firma obligatoria de ArT-AtR
- **Copropiedad 50/50** — 50% ArT-AtR (Arturo Torres) / 50% ByFlow (IArtLabs)
- **Esto es por regla y norma, sin excepcion**
- La firma incluye: autor (ArT-AtR), herramienta (ByFlow), y aviso de copropiedad 50/50
- Implementado en: `offerLoadLyrics()`, `generateOfflineLyrics()`, constante `BYFLOW_SIGNATURE`
- Aviso de entrenamiento IA en firma, chat y legal

---

## Variables de Entorno

```
PORT=8080                          # Puerto del servidor (default 8080)
CORS_ORIGINS=https://example.com   # Origins permitidos, comma-separated
GROK_API_KEY / GFLOW_API_KEY       # xAI Grok API (GFlow chat + letras)
OLLAMA_URL                         # URL de Ollama local (opcional)
STRIPE_SECRET_KEY                  # Stripe payments (dormant)
STRIPE_PRICE_PRO_CREATOR           # Price ID plan PRO Creator
STRIPE_PRICE_PRO_BAR               # Price ID plan PRO Venue
ADMIN_SECRET                       # Override para admin endpoints
MASTER_ADMIN                       # Override master admin
APP_BASE_URL                       # Base URL para redirects Stripe
```

---

## Git/Deploy

### Workflow
1. Desarrollar localmente (`node server.js` en puerto 8080)
2. `git add -A && git commit && git push` a GitHub main
3. Railway auto-deploy desde GitHub (push → live en minutos)

### Reglas Git
- Push directo a main (proyecto personal, no team)
- Secretos (.license_secret, .admin_secret, licenses.json) protegidos en .gitignore
- `.env` tambien en .gitignore

### Deploy
- **Plataforma:** Railway.app
- **Build:** `npm install`
- **Start:** `node server.js`
- **Restart policy:** ON_FAILURE, max 10 retries
- **URL produccion:** https://byflowapp.up.railway.app

---

## Estado Actual del Proyecto (v4.0)

### Completado
- **v3.0-v3.4:** Karaoke, Musica, Bares, IA Studio, licencias, responsive, tema claro/oscuro, landing page, panel Vistas
- **v4.0 Fase 1:** Estudio de Beats (doble reproductor, grabacion voz, editor letra, busqueda beats)
- **v4.0 Fase 2:** Ranking y Comunidad (votos, podio, perfiles creador, feed actividad, registro/login)
- **v4.0 Fase 3.1-3.2:** Noches de Talento (eventos, inscripcion, votacion en vivo, resultados)
- **GFlow:** Chat IA con Grok API, generador de letras PRO, generador LRC karaoke
- **Motor ARTATR v3:** Generador offline de letras puro ArT-AtR
- **Menu restaurante** en panel Bares
- **Login social** en landing page

### Pendiente
- **Fase 3.3:** Mapa de bares (Google Maps API)
- **Fase 3.4:** Notificacion a productores (YouTube Data API)
- **Fase 4:** Modelo de negocio extendido (Stripe checkout, plan PRO Productor)
- Ver `ESTADO_PROYECTO.md` para lista completa de pendientes

---

## Letras originales de ArT-AtR (referencia)
- `data/letras_art_atr.txt` — **CATALOGO MAESTRO** con 41 canciones de 4 fuentes (OneNote, Google Photos, archivo local, Suno). 11 letras transcritas completas + 30 canciones Suno catalogadas.
- **INTEGRADO EN LA APP:** Las 11 letras completas estan hardcodeadas en `index.html` (array `_artLetras`) y son cargables al teleprompter desde el Estudio de Letras > "Mis Letras"
- **Catalogo Suno** tambien integrado en la app (array `_sunoTracks`, 30 tracks) accesible desde Estudio de Letras > "Suno"
- **Suno.com perfil ART-ATR** (suno.com/me) — ~100+ tracks. Proyectos: TEC-PATL (serie nahua), Codigo (tech-lirica), ByFlow Trinity

## Estudio de Letras (ecosistema completo)
El Estudio de Letras tiene 3 pestanas principales:
1. **Escribir** — Editor con textarea, seleccion de beat YouTube, campo usuario, publicar/guardar
2. **Top Letras** — Ranking publico con podio (oro/plata/bronce), filtros temporales, votos
3. **Mis Letras** — Historial con preview, publicar/retirar toggle, votos recibidos

Mas el **Estudio de Letras generativo** con 3 tabs:
1. **Generar** — Motor ARTATR v3 (192 frases, 65+ rimas, Fisher-Yates shuffle)
2. **Mis Letras** — 11 letras originales de ArT-AtR con busqueda y carga al teleprompter
3. **Suno** — Catalogo de 30 canciones del perfil ART-ATR con genero, tema y plays
- Todas las letras generadas llevan firma obligatoria `BYFLOW_SIGNATURE` (50/50)

---

## Convenios de Desarrollo

### Archivos
- **server.js** es monolitico — toda la logica backend en un archivo
- **public/index.html** es monolitico — toda la UI (HTML+CSS+JS) en un archivo
- No crear archivos nuevos a menos que sea absolutamente necesario
- Preferir editar inline sobre crear modulos separados

### CSS
- Variables CSS en `:root` y `[data-theme="light"]`
- Gradientes por modo: karaoke=rosa, musica/youtube=rojo, bares=naranja, ia=morado, estudio=azul-cyan
- Glassmorphism y glow effects en componentes clave
- Mobile-first responsive: breakpoints 900px y 600px

### JavaScript
- Vanilla JS sin frameworks ni bundlers
- Funciones globales (no modulos ES6)
- Socket.IO para toda comunicacion real-time
- localStorage para persistencia client-side (tema, licencia, alias, votos)
- sessionStorage para roomId y historial de sesion

### Seguridad
- Validar inputs tanto en server como en client
- Filtro de contenido en nombres de cantantes y campos de texto
- Security shield escanea todos los inputs contra patrones maliciosos
- Rate limiting en endpoints sensibles

### Nomenclatura
- Funciones en camelCase
- Variables CSS custom con `--nombre`
- Endpoints API: `/api/recurso` (REST)
- Socket events: snake_case (`cola_update`, `tp_lyrics`)

---

## Proyectos paralelos (otras ubicaciones)
- Stem Engine: desarrollo en ChatGPT, archivos en mnt/data
- Backend Python v7.3: C:\Users\art44\OneDrive\Documentos\GitHub\byflow\
