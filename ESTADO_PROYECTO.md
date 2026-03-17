# BYFLOW — Estado del Proyecto
## "Vive Cantando con ByFlow" — powered by IArtLabs

**Version:** v3.3
**Fecha:** 2026-03-17
**Produccion:** https://byflowapp.up.railway.app
**Repo:** https://github.com/ART449/VibeFlow_Pro

---

## QUE ES BYFLOW

ByFlow es una plataforma todo-en-uno de karaoke y entretenimiento en vivo.
3 modos principales:

1. **Karaoke** (GRATIS) — Teleprompter, cola de cantantes, letras sincronizadas
2. **Musica** (PRO) — Streaming embebido de YouTube, SoundCloud y Jamendo
3. **Bares** (PRO) — Gestion de mesas, promos, jingle, cola de peticiones
4. **IA** (PRO) — Asistente Ollama para generar letras y sugerir canciones

---

## LO QUE YA ESTA HECHO (v3.0)

### Frontend (public/index.html)
- [x] Welcome screen con seleccion de modo
- [x] Paneles ocultos hasta elegir modo
- [x] Branding ByFlow + "Vive Cantando"
- [x] Teleprompter con letras sincronizadas
- [x] Cola de cantantes con drag & drop
- [x] Catalogo de canciones con busqueda
- [x] Panel de Musica: YouTube embed + SoundCloud + Jamendo
- [x] CERO descargas (politica anti-pirateria estricta)
- [x] Panel de Bares: mesas colapsables, promos editables, jingle
- [x] Cola de mesas pendientes (peticiones de cantantes por mesa)
- [x] Promos automaticas entre canciones con tiempo configurable
- [x] Jingle de transicion (Web Audio API)
- [x] Panel de IA con Ollama (generar letras, sugerir canciones)
- [x] Control remoto via QR
- [x] Seccion legal completa (contacto, licencia, redes IArtLabs)
- [x] Visualizador de audio
- [x] Panel de Configuracion (perfil usuario, apariencia, toggles audio, status API keys)
- [x] Boton de engranaje en topbar para acceso rapido a Settings
- [x] DJ Soundboard en panel Bares: 9 pads SFX (airhorn, aplausos, redoble, scratch, ovacion, campana, sirena, bass drop, woosh)
- [x] setMode() reescrito: oculta TODO, muestra solo lo del modo activo

### Backend (server.js)
- [x] Express + Socket.IO
- [x] CRUD canciones y cola persistente (JSON)
- [x] Sistema de licencias online (HMAC-SHA256 + device binding)
- [x] Generacion de claves VFP-XXXXX-XXXXX-XXXXX-XXXXX
- [x] Admin endpoints protegidos con X-Admin-Key
- [x] Rate limiting en activacion (5 intentos/min)
- [x] Endpoint de descarga ELIMINADO (politica ByFlow)
- [x] Deploy automatico Railway via GitHub push
- [x] **Filtro de contenido** — 35+ palabras prohibidas (ES+EN) con validacion server-side
- [x] **Estadisticas de uso** — GET /api/stats (top canciones, top cantantes, chart 7 dias)
- [x] **LRCLIB proxy** — GET /api/lrclib/search (evita problemas CORS)
- [x] **Tracking de eventos** — cola_add y song_played con persistencia JSON

### Infraestructura
- [x] Railway deployment (auto-deploy desde GitHub main)
- [x] .gitignore protege secretos (license_secret, admin_secret, licenses.json)
- [x] Tag v3.0 en GitHub

---

## COMPLETADO EN SESION 2026-03-16

- [x] **Mobile responsive** — Welcome cards apiladas en columna en mobile (<=900px), tamaños adaptados para <=600px
- [x] **CORS configurable** — server.js lee `CORS_ORIGINS` de env (comma-separated), default permisivo
- [x] **Jamendo search** — Verificado: flujo client_id → busqueda API → play audio funciona correcto
- [x] **SoundCloud embed** — Verificado: redirige a busqueda web → user pega URL → widget embed funciona
- [x] **Welcome screen + transiciones** — Verificado: welcomeSelect() → dismissWelcome() → setMode() con fade-out animado
- [x] **Sistema licencias** — Verificado: checkLicenseStatus, activate, isPremium, PRO badges, token persistente
- [x] **Jingle mejorado** — Tono triangle (mas calido), volumen configurable con slider en Settings, boton Test
- [x] **Welcome screen v2** — 4 cards (Karaoke, Musica, Bares, IA Studio) con glassmorphism, glow effects, stagger animations, ripple touch
- [x] **Gzip compression** — Middleware compression() reduce transferencia ~75% (278KB → 69KB)
- [x] **Cache headers** — Assets estaticos con maxAge 1 dia
- [x] **Toast notifications v2** — Tipos success/error/warning/info con icono, color-coded border, progress bar animada
- [x] **Deploy a produccion** — Verificado en byflowapp.up.railway.app con gzip activo
- [x] **Backup completo** — OneDrive\Backup-ByFlow\VibeFlow_Pro_backup_2026-03-16.zip (195MB)

## COMPLETADO EN SESION 2026-03-16 (parte 2) — v3.2

### YouTube + Teleprompter integrado
- [x] **ytPlayWithLyrics()** — Un clic reproduce video Y auto-busca letra en LRCLIB
- [x] **Auto-parse artista/track** — Limpieza de titulos YouTube (quita "Official Video", "Lyrics", etc.)
- [x] **YouTube API key actualizada** — `AIzaSyBTFWSrpFCNagcOgPPGt0BZA5A8v5TgT7w` con migracion automatica de key vieja en localStorage

### Auto-queue y historial
- [x] **Auto-queue** — Siguiente cantante arranca automatico al terminar cancion (toggle en Settings)
- [x] **Historial de sesion** — sessionStorage aislado por dispositivo, visible en Settings
- [x] **addToHistory()** — Registra titulo, artista, fuente y timestamp

### Activar cantante = flujo completo
- [x] **activarCantante() mejorado** — Al activar un cantante de la cola: auto-busca en YouTube API + carga letra al teleprompter
- [x] **Fix currentMode check** — `typeof currentMode === 'undefined'` previene ReferenceError antes de setMode()

### Modo Remote limpio
- [x] **Remote = vista publica** — Solo teleprompter + banner "Ahora Canta", sin controles DJ
- [x] **Oculta:** topbar, playerBar, fxBar, vizBar, sidebar, embed container, botones fullscreen/next

### UI/UX fixes
- [x] **Sidebar oculto en Bares/Settings** — Evita overflow horizontal, layout limpio
- [x] **Seccion de precios** — 3 planes (Gratis/$0, PRO Creator/$199 MXN, PRO Venue/$799 MXN) en panel de licencias
- [x] **Fallback letras locales** — Si LRCLIB no encuentra, busca en las 11 letras de ArT-AtR
- [x] **Preview snippets** — Resultados locales muestran fragmento, no letra completa

### Backend / Real-time
- [x] **Contador online** — `io.emit('online_count')` en connect/disconnect, badge en topbar
- [x] **5 licencias PRO de prueba** — Generadas con admin endpoint

### Backup
- [x] **Backup v2** — OneDrive\Backup-ByFlow\VibeFlow_Pro_backup_2026-03-16_v2.zip (3.9MB)

## COMPLETADO EN SESION 2026-03-17 — v3.3

### Aislamiento de sesion (Socket.IO Rooms)
- [x] **Socket.IO Rooms** — Cada dispositivo genera roomId unico en sessionStorage
- [x] **Teleprompter aislado** — Letras, scroll y velocidad son POR ROOM (no globales)
- [x] **Remote via URL** — `?room=XXXX` permite unirse a la sala del DJ
- [x] **room_count** — Muestra usuarios conectados en TU sala, no global
- [x] **Room badge en topbar** — Click copia link de sala para compartir
- [x] **Cola/mesas global** — La cola de cantantes sigue siendo del venue (compartida)
- [x] **getRoom()** — Server crea rooms on-demand, limpieza automatica al desconectar

### Tema claro/oscuro
- [x] **Light theme completo** — CSS variables via `[data-theme="light"]`
- [x] **Toggle funcional** — Settings > Apariencia > Modo oscuro ON/OFF
- [x] **Persistencia** — localStorage guarda preferencia, se carga en loadSettingsState()
- [x] **Meta theme-color** — Actualiza para iOS status bar (oscuro/claro)
- [x] **Cobertura:** topbar, sidebar, panels, cards, inputs, scrollbar, modals, welcome, toast

### Produccion verificada
- [x] **YouTube API referrer fix** — `/*` wildcard en Google Cloud Console
- [x] **CORS_ORIGINS** — Configurado en Railway: `https://byflowapp.up.railway.app`
- [x] **YouTube search en produccion** — Verificado: busqueda "la bamba" retorna resultados
- [x] **Licencias en produccion** — Endpoint `/api/license/status` respondiendo
- [x] **Stats en produccion** — Endpoint `/api/stats` respondiendo

## COMPLETADO EN SESION 2026-03-17 (parte 2) — v3.4

### Pulidota completa (23 fixes)
- [x] **Backend (10 fixes):** rate-limit memory leak, Socket.IO validation, debouncedSave, Stripe route ordering, SIGINT handler, Set O(1) reorder, sanitize AI/YT errors, admin header-only, dead code removal
- [x] **Frontend (10 fixes):** var(--text) dark mode, viewport accessibility, touch targets 36px, input color theme, tp-display sync, legal v3.3, QR alt text, aria-label, word-break
- [x] **JS Logic (3 fixes):** currentMode declared (was implicit global), Jamendo localStorage key fix, AudioContext leak fix in playJingle

### Landing Page de marketing
- [x] **public/landing.html** — Pagina completa de marketing con hero, features, pricing, testimoniales
- [x] **Ruta vanity** — /landing sirve la pagina sin .html
- [x] **SEO** — Meta tags, OpenGraph, responsive, scroll animations
- [x] **Pricing** — 3 planes (Gratis/PRO Creator $199/PRO Venue $799)

### Panel Vistas (DJ Dashboard)
- [x] **Nuevo modo "vistas"** — Dashboard multi-panel para DJs
- [x] **Layout 3 columnas** — Cola + Teleprompter + YouTube Search
- [x] **Sincronizacion en tiempo real** — Cola refleja colaCache, now-singing con pulso
- [x] **YouTube search integrado** — vpSearch() busca y vpPlay() reproduce
- [x] **Responsive** — Columna unica en mobile, grid 3 cols en desktop
- [x] **Boton en topbar + mobile-nav** — Acceso rapido al dashboard

### Herramientas Claude Code instaladas
- [x] **GSD (Get-Shit-Done)** — 38 commands + 15 agents
- [x] **Everything-Claude-Code** — Core profile + 16 skills + 14 commands + 6 agents
- [x] **claude-mem** — Memoria persistente entre sesiones
- [x] **CLI-Anything** — 5 commands para generar CLIs
- [x] **UI-UX Pro Max** — Skill de diseno

## PENDIENTES (siguiente sesion)

### Prioridad ALTA
- [ ] Test end-to-end licencias en produccion (activar clave PRO, verificar features desbloqueadas)
- [ ] Backup v3 a OneDrive con todos los cambios de esta sesion
- [ ] Stripe checkout real en landing page (pago PRO online)
- [ ] Redes sociales + email de contacto en footer landing (pendiente datos de Arturo)

### Prioridad MEDIA
- [ ] Sesion QR mesa sin registro
- [ ] Spotify search integration (requiere API key)
- [ ] Convertir SVG icons a PNG para full PWA compatibility
- [ ] Panel Vistas: agregar controles de player (play/pause/next) en el dashboard

### Prioridad BAJA
- [ ] Testimoniales reales en landing page
- [ ] MASTER_ADMIN env var en Railway

---

## FEATURES PORTADOS DEL PROYECTO PYTHON v7.3

| Feature | Origen | Estado |
|---------|--------|--------|
| Filtro de contenido (35+ palabras ES+EN) | byflow_v73_backend.py | ✅ Implementado |
| Estadisticas de uso (top songs/singers) | byflow_v73_backend.py | ✅ Implementado |
| LRCLIB proxy server-side | byflow_v73_backend.py | ✅ Implementado |
| Design system mode-based gradients | frontend/index.html v7.1 | ✅ Implementado |
| WebSocket rooms por bar | byflow_v73_backend.py | ✅ Implementado v3.3 |
| Spotify search integration | byflow_v73_backend.py | ⏳ Pendiente (requiere API key) |
| Sesion QR mesa sin registro | byflow_v73_backend.py | ⏳ Pendiente |

---

## OTROS PROYECTOS BYFLOW EN PARALELO

### Stem Engine v0.3 (en desarrollo con ChatGPT)
- Motor de separacion de pistas con Demucs
- Transcripcion MIDI con Basic Pitch (import lazy)
- Analisis BPM, tonalidad, acordes
- Cache por hash, WebSocket progreso
- **NUEVO v0.3:** Pipeline beatbox → MIDI → arreglo
  - Deteccion de golpes de beatbox (kick, snare, hihat, clap, tom)
  - Clasificacion heuristica de percusion
  - Cuantizacion a rejilla temporal
  - Exportacion MIDI de bateria
  - Generacion de preview WAV
  - Endpoint POST /api/beatbox/jobs/{job_id}/arrange (16/32/64 compases)
  - Waveform JSON para frontend (picos de audio original, mix, stems)
  - Health endpoint mas completo
- **Siguiente:** v0.4 — Grabador beatbox en frontend, editor secuenciador, boton "Convertir a beat"
- Clasificacion heuristica, no entrenada con voz del usuario todavia
- Ubicacion: C:\Users\art44\OneDrive\Documentos\GitHub\byflow\

### Backend Byflow v7.3 (Python/FastAPI)
- API con JWT auth, WebSocket rooms por bar
- Sistema de mesas por QR (sesion de invitado)
- Filtro de palabras obscenas en nombres
- Cola de peticiones en tiempo real
- Ubicacion: C:\Users\art44\OneDrive\Documentos\GitHub\byflow\byflow\backend\
- Pendiente: migrar a Railway o conectar con el server.js actual

---

## COMO RETOMAR

1. Abrir terminal en C:\BYFLOW\VibeFlow_Pro
2. `git log --oneline -5` para ver ultimos cambios
3. Leer este archivo para recordar donde quedamos
4. El preview local corre en puerto 3333 (node server.js)
5. Para deploy: git add -A && git commit && git push

---

*Ultima actualizacion: 2026-03-17 — ByFlow v3.3*
