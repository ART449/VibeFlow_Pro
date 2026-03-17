# BYFLOW v4.0 — Plan Maestro "Ecosistema Creativo"
## Documento completo de planificacion — 2026-03-17

---

## 1. VISION GENERAL

ByFlow evoluciona de app de karaoke a **ecosistema que conecta bares, escritores y productores** usando beats de YouTube como puente.

### La idea central (brainstorm DeepSeek + Claude)
- **Doble reproductor sincronizado:** YouTube (beat) + ByFlow (voz del usuario)
- **Un solo boton PLAY** que controla ambos
- **100% legal:** El beat se reproduce en iframe de YouTube (no se extrae audio)
- **Conexion escritor-productor:** Cada letra guarda metadata del beat (canal YT, URL)
- **Disclaimer automatico** con credito al productor
- **Ranking de mejores letras** con votos de la comunidad
- **Bares como escenario fisico:** Noches de talento, beat battles, scouting

### Por que es unico
- Netflix no invento el cine, invento la forma de verlo
- ByFlow no inventa los beats, inventa la forma de vivir la escritura sobre ellos
- Es el puente que falta entre productores (tienen beats sin letristas) y escritores (tienen letras sin beats)

---

## 2. ESTADO ACTUAL (v3.4)

### Lo que ya funciona
- Karaoke con teleprompter y letras sincronizadas (LRCLIB)
- Cola de cantantes con drag & drop
- YouTube/SoundCloud/Jamendo streaming (CERO descargas)
- Panel de Bares: mesas, promos, jingle, soundboard DJ
- IA Studio con Ollama (generar letras, sugerir canciones)
- Control remoto via QR + Socket.IO rooms
- Sistema de licencias (HMAC-SHA256 + device binding)
- Light/dark theme
- Tutorial interactivo (5 pasos)
- Sidebars y player-bar colapsables
- Landing page de marketing
- Panel Vistas (DJ Dashboard)

### Stack tecnico
- **Frontend:** HTML/CSS/JS SPA (public/index.html ~6700 lineas)
- **Backend:** Node.js + Express + Socket.IO (server.js ~1400 lineas)
- **Data:** JSON files (cola, canciones, stats, teleprompter)
- **Deploy:** Railway (auto-deploy desde GitHub main)
- **Produccion:** https://byflowapp.up.railway.app

### Lo que NO existe todavia
- No hay getUserMedia ni MediaRecorder (grabacion de voz)
- No hay sistema de beats/productores
- No hay ranking ni votos
- No hay perfiles de creador
- No hay eventos/tocadas

---

## 3. FASES DE IMPLEMENTACION

### FASE 0 — Bugs y UX criticos [COMPLETADA]
- [x] Cola de cantantes accesible en mobile (modal centrado)
- [x] FX sliders custom (una fila, thumbs con glow, Firefox support)
- [x] Estados vacios con mensajes de guia
- [x] Consistencia idioma (Config → Ajustes)
- [x] Player-bar colapsable + botones premium rediseñados
- [x] Topbar: 3 modos principales + dropdown "Mas"
- [x] Fix: sidebar/right-panel no se muestran en mobile (isMobile check)

### FASE 1 — Doble Reproductor "Beat + Voz" [SIGUIENTE]

#### 1.1 Arquitectura
- YouTube Player (beat): Ya existe via YouTube IFrame API
- ByFlow Player (voz): NUEVO — getUserMedia() + Web Audio API
- Control maestro: Un solo PLAY sincroniza ambos
- Sincronizacion: player.getCurrentTime() de YT + buffer 200-300ms

#### 1.2 Interfaz "Estudio de Beats"
- Nueva pestana o nuevo modo
- Layout: Reproductor YouTube (beat) + Editor de letra + boton grabar
- Disclaimer: "Beat por: [Canal YT] — Apoya al productor"

#### 1.3 Backend — Guardar letra + beat
- POST /api/letras-beat — Guarda relacion letra-beat
- GET /api/letras-beat — Listar (con paginacion)
- GET /api/letras-beat/ranking — Top por votos
- POST /api/letras-beat/:id/voto — Votar
- Nuevo JSON: data/letras-beat.json

#### 1.4 Grabacion de voz
- getUserMedia({ audio: true }) para microfono
- MediaRecorder para grabar sesion
- Audio en memoria (Blob) — NO se sube al servidor
- Usuario re-escucha localmente

#### 1.5 Busqueda filtrada de beats
- Reusar ytSearch() con filtro "type beat", "instrumental", "free beat"
- Nombre del canal siempre visible

### FASE 2 — Ranking y Comunidad
- Sistema de votos (1 voto por IP por letra, rate limit 20/hora)
- Ranking publico: Top letras por semana/mes/todos
- Perfil de creador: nombre, alias, bio, letras publicadas, stats

### FASE 3 — Bares + Eventos Locales
- "Noches de Talento" en panel Bares
- Eventos: fecha, hora, tema, max participantes
- Escritores se inscriben con letra+beat
- Publico vota en vivo
- Futuro: Mapa de bares (Google Maps API)
- Futuro: Notificacion a productores (YouTube Data API + OAuth)

### FASE 4 — Modelo de negocio extendido
| Plan | Precio | Incluye |
|------|--------|---------|
| Gratis | $0 | Karaoke, 3 beats/dia, ver ranking |
| PRO Creator | $199 MXN | Beats ilimitados, perfil destacado |
| PRO Venue | $799 MXN | Todo + bares + eventos |
| PRO Productor | $149 MXN (nuevo) | Reclamar beats, ver usos, contactar |

---

## 4. ASPECTO LEGAL

### Doble reproductor — Por que es legal
1. El beat se reproduce en el iframe NATIVO de YouTube (no se extrae audio)
2. La voz se graba por separado en Web Audio API
3. NO se mezclan los audios (el usuario escucha ambos por separado)
4. Disclaimer obligatorio con credito al canal del productor
5. Cumple 100% con YouTube ToS y API Policies

### Cita de Google:
"API Clients must not modify or replace the text, images, information, or other content of the search results returned by those Services."

ByFlow no modifica el beat. Solo lo reproduce en su reproductor nativo.

---

## 5. PREGUNTAS PENDIENTES (para Arturo)

1. ¿El "Estudio de Beats" es un modo nuevo o va dentro del panel de Musica?
2. ¿La grabacion de voz se guarda para re-escuchar o es solo en vivo?
3. ¿El ranking de letras es publico o privado?

---

## 6. EQUIPO DE DESARROLLO

### Humano
- **Arturo Torres (ArT-AtR)** — Creador, vision, direccion

### IAs (La Colmena)
- **Claude (Anthropic)** — Arquitectura principal, frontend/backend, deployment
- **DeepSeek** — Brainstorm ecosistema, Socket.IO rooms, escalabilidad
- **ChatGPT** — Stem Engine v0.3, pipeline beatbox→MIDI
- **Gemini** — IA settings integration

---

## 7. ARCHIVOS CLAVE

- `public/index.html` — Frontend SPA completo
- `server.js` — Backend Express + Socket.IO
- `data/cola.json` — Cola de cantantes
- `data/canciones.json` — Catalogo de canciones
- `data/stats.json` — Estadisticas de uso
- `data/teleprompter.json` — Estado del teleprompter
- `public/landing.html` — Landing page marketing
- `ESTADO_PROYECTO.md` — Estado del proyecto
- `CLAUDE.md` — Instrucciones para Claude
- `PLAN_MAESTRO_v4.md` — Este documento

---

*Generado: 2026-03-17 — ByFlow v4.0 Plan Maestro*
*Claude (Anthropic) + DeepSeek + Arturo Torres (ArT-AtR)*
