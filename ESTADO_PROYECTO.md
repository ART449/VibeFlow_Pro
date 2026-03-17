# BYFLOW — Estado del Proyecto
## "Vive Cantando con ByFlow" — powered by IArtLabs

**Version:** v3.1
**Fecha:** 2026-03-13
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

## PENDIENTES (siguiente sesion)

### Prioridad ALTA
- [ ] Configurar en Railway: `CORS_ORIGINS=https://byflowapp.up.railway.app`
- [ ] Test end-to-end licencias en produccion (generar clave admin, activar, verificar PRO)
- [ ] Integrar landing page de ChatGPT al repo (landing/index.html)

### Prioridad MEDIA
- [ ] Tema claro/oscuro toggle (CSS variables ya preparadas por Kimi)
- [ ] Socket.IO rooms por venue (arquitectura DeepSeek lista)
- [ ] Modelo de monetizacion: Free / PRO Creator $199/mes / Venue $799-1499/mes

### Prioridad BAJA
- [x] ~~Estadisticas de uso (canciones mas pedidas, horas pico)~~ — IMPLEMENTADO v3.1
- [ ] PWA + Service Worker (propuesta DeepSeek pendiente)

---

## FEATURES PORTADOS DEL PROYECTO PYTHON v7.3

| Feature | Origen | Estado |
|---------|--------|--------|
| Filtro de contenido (35+ palabras ES+EN) | byflow_v73_backend.py | ✅ Implementado |
| Estadisticas de uso (top songs/singers) | byflow_v73_backend.py | ✅ Implementado |
| LRCLIB proxy server-side | byflow_v73_backend.py | ✅ Implementado |
| Design system mode-based gradients | frontend/index.html v7.1 | ✅ Implementado |
| WebSocket rooms por bar | byflow_v73_backend.py | ⏳ Pendiente |
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

1. Abrir terminal en C:\BYFLOW\VibeFlow_Pro\VibeFlow_Pro
2. `git log --oneline -5` para ver ultimos cambios
3. Leer este archivo para recordar donde quedamos
4. El preview local corre en puerto 3333 (node server.js)
5. Para deploy: git add -A && git commit && git push

---

*Ultima actualizacion: 2026-03-16 — ByFlow v3.1*
