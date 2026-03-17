# ByFlow — Documento de Contexto Completo para NotebookLM
## Ultima actualizacion: 2026-03-17 | Version: v3.3

---

## 1. QUE ES BYFLOW

ByFlow ("Vive Cantando con ByFlow") es una plataforma web todo-en-uno de karaoke inteligente y entretenimiento en vivo. Creada por Arturo Torres (ArT-AtR), powered by IArtLabs.

**URL Produccion:** https://byflowapp.up.railway.app
**Repo:** https://github.com/ART449/VibeFlow_Pro
**Stack:** Node.js + Express + Socket.IO (backend) | HTML/CSS/JS SPA (frontend)
**Deploy:** Railway (auto-deploy desde GitHub main)

### Modos de operacion:
1. **Karaoke** (GRATIS) — Teleprompter profesional, cola de cantantes, letras sincronizadas LRC, efectos de voz
2. **Musica** (PRO) — Streaming YouTube/SoundCloud/Jamendo, busqueda integrada, auto-play con letras
3. **Bares** (PRO) — Gestion de mesas, promos automaticas, jingle entre canciones, soundboard DJ (9 SFX)
4. **IA Studio** (PRO) — Asistente GFlow DJ IA con Ollama, generador de letras offline, catalogo ArT-AtR

### Filosofia:
- CERO descargas de musica (solo streaming embebido)
- CERO contaminacion visual (interfaz limpia de "Director Vocal")
- Propiedad intelectual: toda letra generada es 50% ArT-AtR / 50% ByFlow (IArtLabs)

---

## 2. ARQUITECTURA TECNICA

### Frontend (public/index.html — ~6000 lineas, SPA)
- Single Page Application pura (HTML/CSS/JS, sin frameworks)
- Welcome screen con 4 cards (glassmorphism, glow, stagger animations)
- setMode() controla que paneles se muestran segun el modo activo
- Teleprompter Engine v2: LRC timestamps, word highlight, progress bar, auto-scroll
- Socket.IO client para sync en tiempo real
- localStorage para settings persistentes (API keys, tema, auto-queue, font size)
- sessionStorage para datos de sesion (historial, roomId)

### Backend (server.js — ~1100 lineas)
- Express con compression (gzip ~75% reduccion)
- Socket.IO con sistema de Rooms (aislamiento por sesion)
- Persistencia JSON (cola.json, mesas.json, teleprompter.json, canciones.json, stats.json)
- Sistema de licencias HMAC-SHA256 con device binding
- Rate limiting (5 intentos/min en activacion)
- Filtro de contenido (35+ palabras prohibidas ES+EN)
- LRCLIB proxy (evita CORS)
- YouTube API proxy (evita exponer key en cliente)
- CORS configurable via env CORS_ORIGINS

### Infraestructura
- Railway (auto-deploy desde GitHub push a main)
- Secrets en .gitignore (.license_secret, .admin_secret, licenses.json)
- Google Cloud Console: YouTube Data API v3 con restriccion de referrer

---

## 3. FEATURES PRINCIPALES (v3.3)

### Teleprompter Inteligente
- Soporta texto plano y formato LRC sincronizado
- Word-by-word highlight con scroll automatico
- Velocidad ajustable (0.5x a 3.0x)
- Sync via Socket.IO rooms (cada dispositivo independiente)
- Busqueda de letras online (LRCLIB) y offline (11 letras ArT-AtR)

### YouTube + Letras (One-Click Flow)
- ytPlayWithLyrics(): reproduce video Y auto-busca letra
- Auto-parse de artista/track desde titulo YouTube
- Limpieza de titulos (quita "Official Video", "Lyrics", etc.)
- Fallback a letras locales de ArT-AtR si LRCLIB no encuentra

### Cola de Cantantes
- Agregar cantante + cancion + mesa
- Drag & drop para reordenar
- activarCantante(): auto-busca en YouTube + carga letra al teleprompter
- Auto-queue: siguiente cantante arranca al terminar (toggle)

### Socket.IO Rooms (v3.3)
- Cada dispositivo genera roomId unico (sessionStorage)
- Remote se une al room del DJ via ?room=XXXX
- Teleprompter/scroll/speed son POR ROOM (aislados)
- Cola/mesas son globales (del venue)
- Badge en topbar muestra room ID, click copia link

### Tema Claro/Oscuro (v3.3)
- CSS variables via [data-theme="light"]
- Toggle en Settings > Apariencia
- Persistencia en localStorage
- Cobertura completa: topbar, sidebar, panels, cards, inputs, modals

### Sistema de Licencias
- 3 tiers: Gratis/$0, PRO Creator/$199 MXN, PRO Venue/$799 MXN
- Activacion online con clave VFP-XXXXX-XXXXX-XXXXX-XXXXX
- Device binding (fingerprint del navegador)
- Admin endpoints protegidos con X-Admin-Key

### Modo Remote
- Vista publica: solo teleprompter + banner "Ahora Canta"
- Sin controles DJ (oculta topbar, playerBar, fxBar, sidebar, embed)
- Se une al room del DJ via URL con ?room=XXXX

### Estudio de Letras
- 3 pestanas: Generar | Mis Letras | Suno
- Engine offline v2: 192 frases, 65+ rimas, Fisher-Yates shuffle
- 11 letras originales de ArT-AtR con busqueda y preview
- 30 tracks del catalogo Suno de ART-ATR
- Firma obligatoria BYFLOW_SIGNATURE (50/50)

### Panel Bares
- Gestion de mesas colapsables
- Promos automaticas entre canciones
- Jingle configurable (Web Audio API, tono triangle)
- Soundboard DJ: 9 pads SFX

### Estadisticas
- GET /api/stats: top canciones, top cantantes, chart 7 dias
- Panel visual en Settings
- Tracking: cola_add, song_played con persistencia JSON

---

## 4. SEGURIDAD

- API keys NO hardcodeadas — configurables via localStorage + Settings
- Filtro de contenido server+client side (35+ palabras ES+EN)
- Rate limiting en endpoints sensibles
- CORS configurable (CORS_ORIGINS env var)
- Secrets en .gitignore
- YouTube API con restriccion de referrer en Google Cloud Console
- Sin endpoints de descarga de audio (anti-pirateria)

---

## 5. CREADOR — ArT-AtR (Arturo Torres)

- Rimador experto en verso, prosa y lirica tecnica
- Mezcla crudeza callejera con precision tecnologica (hacking, IA, algoritmos)
- Filosofia: "El sistema parpadea, pero el codigo no miente"
- Estilo: tecnico-sentimental, octosilabos, rimas consonantes AABB
- Tematicas: Tecnologia & Trap, Desamor & Realidad, Redencion & Familia
- Perfil Suno: ~100+ tracks (TEC-PATL, Codigo, ByFlow Trinity)
- Canciones clave: SENTIDO PERDIDO, LA BACHA, El Alma (Tributo a Mama), ITZTLI, EL TABLERO DE JUDAS

---

## 6. MONETIZACION

| Plan | Precio | Features |
|------|--------|----------|
| Gratis | $0 | Karaoke basico, teleprompter, cola |
| PRO Creator | $199 MXN/mes | YouTube, IA, letras sync, auto-queue |
| PRO Venue | $799 MXN/mes | Todo + Bares, mesas, promos, soundboard, multi-room |

---

## 7. HISTORIAL DE VERSIONES

- **v3.0** (2026-03-16) — SPA completa, 4 modos, teleprompter, cola, bares, IA, licencias
- **v3.1** (2026-03-16) — Estadisticas, LRCLIB proxy, filtro contenido, design system
- **v3.2** (2026-03-16) — YouTube+letras one-click, auto-queue, historial, remote limpio, precios
- **v3.3** (2026-03-17) — Socket.IO rooms (aislamiento), tema claro/oscuro, YouTube API en produccion

---

## 8. PENDIENTES

### Alta prioridad
- Test end-to-end licencias PRO en produccion
- Landing page publica para marketing/redes

### Media prioridad
- PWA + Service Worker
- Panel Vistas (multi-view dashboard)

### Baja prioridad
- Sesion QR mesa sin registro
- Spotify search integration
- Convertir SVG icons a PNG

---

## 9. PROYECTOS PARALELOS

- **Stem Engine v0.3** — Separacion de pistas Demucs, pipeline beatbox→MIDI→arreglo
- **Backend Python v7.3** — FastAPI con JWT, WebSocket rooms, filtro obscenidades
- **Perfil Suno ART-ATR** — 100+ tracks en suno.com/me

---

*Documento generado automaticamente para NotebookLM — ByFlow v3.3 — 2026-03-17*
