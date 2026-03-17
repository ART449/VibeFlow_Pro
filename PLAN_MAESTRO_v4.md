# BYFLOW v4.0 — Plan Maestro "Ecosistema Creativo"
## Restructurado: 2026-03-17 | Equipo: ArT-AtR + Claude + DeepSeek

---

## 1. VISION

ByFlow evoluciona de **app de karaoke** a **ecosistema que conecta bares, escritores y productores** usando beats de YouTube como puente legal.

- **Lema:** "Vive Cantando con ByFlow"
- **Nuevo lema ecosistema:** "Escribe. Suena. Conecta."
- **Diferenciador:** ByFlow no inventa los beats, inventa la forma de vivir la escritura sobre ellos
- **El puente:** Productores tienen beats sin letristas. Escritores tienen letras sin beats. ByFlow los conecta.

---

## 2. DECISIONES TOMADAS (brainstorm DeepSeek + Claude)

| Pregunta | Decision | Razon |
|----------|----------|-------|
| Donde va el Estudio de Beats? | **Modo nuevo** (no pestana) | Es el corazon de v4, merece su propio espacio. Mobile-nav: "Karaoke" / "Estudio" |
| La grabacion de voz se guarda? | **Si, por plan** | Gratis=solo sesion. PRO=permanente. Crea deseo de upgrade + portafolio |
| Ranking publico o privado? | **Publico con moderacion** | El autor elige publicar. Siempre visible: escritor + productor. Construye comunidad |

---

## 3. ESTADO ACTUAL (v3.4)

### Funcional
- Karaoke con teleprompter y letras sincronizadas (LRCLIB)
- Cola de cantantes con drag & drop
- YouTube/SoundCloud/Jamendo streaming (CERO descargas)
- Panel de Bares: mesas, promos, jingle, soundboard DJ
- IA Studio con Ollama
- Control remoto via QR + Socket.IO rooms
- Licencias HMAC-SHA256 + device binding
- Light/dark theme, tutorial, sidebars colapsables
- Landing page, Panel Vistas (DJ Dashboard)

### Stack
- Frontend: HTML/CSS/JS SPA (public/index.html ~6700 lineas)
- Backend: Node.js + Express + Socket.IO (server.js ~1400 lineas)
- Data: JSON files | Deploy: Railway auto-deploy
- Produccion: https://byflowapp.up.railway.app

### NO existe todavia
- getUserMedia / MediaRecorder (grabacion de voz)
- Sistema de beats/productores
- Ranking / votos
- Perfiles de creador
- Eventos / tocadas
- Notificaciones a productores

---

## 4. FASES DE IMPLEMENTACION

### FASE 0 — Bugs y UX criticos [COMPLETADA]
- [x] Cola de cantantes accesible en mobile
- [x] FX sliders custom con glow
- [x] Estados vacios con mensajes de guia
- [x] Consistencia idioma (Config → Ajustes)
- [x] Player-bar colapsable + botones premium
- [x] Topbar: 3 modos + dropdown "Mas"
- [x] Sidebar/right-panel no se muestran en mobile

---

### FASE 1 — Estudio de Beats (Doble Reproductor) [SIGUIENTE]

**Objetivo:** El usuario busca un beat en YouTube, escribe su letra encima, graba su voz, y guarda todo con credito al productor.

#### 1.1 Nuevo modo "Estudio"
- Agregar modo `estudio` a setMode()
- Boton en mobile-nav: "✍️ Estudio"
- En desktop: dentro del dropdown "Mas" o como boton principal
- Layout: 3 zonas (reproductor beat | editor letra | grabacion)
- Gradiente de modo: estudio = azul-cyan

#### 1.2 Doble reproductor sincronizado
- **Reproductor 1 (Beat):** YouTube IFrame API (ya existe via ytEmbed)
- **Reproductor 2 (Voz):** NUEVO — getUserMedia() + Web Audio API
- **Control maestro:** Un solo boton PLAY que:
  - Llama youtubePlayer.playVideo()
  - Inicia MediaRecorder para captura de microfono
- **Sincronizacion:** getCurrentTime() de YT + buffer 200-300ms
- **Legal:** El beat SIEMPRE se reproduce en iframe nativo de YouTube

#### 1.3 Grabacion de voz
- getUserMedia({ audio: true }) para microfono
- MediaRecorder graba sesion como Blob (WebM/Opus)
- **Gratis:** Audio solo en sesion (se pierde al recargar)
- **PRO Creator:** Audio se guarda en localStorage o IndexedDB
- **PRO Venue:** Audio + estadisticas de sesion
- Boton "Re-escuchar" para reproducir la grabacion local
- Indicador visual de grabacion (circulo rojo pulsante)

#### 1.4 Editor de letra integrado
- Textarea con contador de lineas/caracteres
- Boton "IA Ayuda" → conecta con Ollama para sugerir rimas
- Timestamps opcionales: marcar en que segundo entra cada verso
- Import desde "Mis Letras" (las 11 de ArT-AtR)
- BYFLOW_SIGNATURE obligatoria en letras generadas por IA

#### 1.5 Busqueda filtrada de beats
- Reusar ytSearch() con filtros automaticos:
  - "type beat", "instrumental", "free beat"
  - Genero: trap, reggaeton, hip-hop, R&B, lo-fi
- Nombre del canal SIEMPRE visible en resultados
- Boton "Escribir sobre este beat" en cada resultado

#### 1.6 Backend — Guardar letra + beat
- `data/letras-beat.json` — Almacen de relaciones
- Estructura por registro:
```json
{
  "id": "lb_xxxxx",
  "usuario": "ArT-AtR",
  "titulo": "Nombre de la letra",
  "letra": "Verso 1...",
  "beat": {
    "videoId": "abc123",
    "titulo": "TRAP SAD Type Beat - Lost",
    "canal": "BeatsForSouls",
    "canalUrl": "https://youtube.com/@BeatsForSouls"
  },
  "timestamps": { "0:12": "Verso 1", "0:28": "Coro" },
  "publicado": false,
  "votos": 0,
  "fecha": "2026-03-17"
}
```
- Endpoints:
  - POST /api/letras-beat — Crear
  - GET /api/letras-beat — Listar (con paginacion)
  - PUT /api/letras-beat/:id/publicar — Toggle publicar
  - POST /api/letras-beat/:id/voto — Votar (1 por IP, rate limit)
  - GET /api/letras-beat/ranking — Top por votos (semana/mes/todos)

#### 1.7 Disclaimer del productor
- Siempre visible cuando hay beat seleccionado:
  - "🎵 Beat por: [Canal YT] — Apoya al productor"
  - Link directo al canal
- Se guarda como metadata con la letra
- En ranking publico: siempre visible escritor + productor

---

### FASE 2 — Ranking y Comunidad

**Objetivo:** Las letras publicadas se ven en un ranking publico. La comunidad vota. Se crean perfiles.

#### 2.1 Ranking publico
- Seccion visible en modo Estudio: "Top Letras"
- Filtros: semana / mes / todos los tiempos
- Cada entrada muestra: titulo, escritor, beat (canal YT), votos
- Boton "Escuchar" reproduce el beat de YouTube + muestra letra
- Rate limit: 1 voto por IP por letra, max 20 votos/hora

#### 2.2 Perfil de creador
- Nombre / alias / bio (opcional)
- Letras publicadas + stats (votos totales, beats usados)
- Link al perfil desde ranking
- Almacenado en data/perfiles.json
- Autenticacion simple: alias + pin (no OAuth por ahora)

#### 2.3 Feed de actividad
- "Nuevas letras publicadas" — timeline en modo Estudio
- Notificacion in-app cuando alguien vota tu letra

---

### FASE 3 — Bares + Eventos Locales

**Objetivo:** Los bares organizan "Noches de Talento" donde escritores presentan letras sobre beats en vivo.

#### 3.1 Noches de Talento
- Nuevo panel dentro de modo Bares: "Organizar Evento"
- Crear evento: nombre, fecha, hora, tema, max participantes
- Escritores se inscriben con su letra + beat desde modo Estudio
- El bar elige finalistas
- La noche del evento: beats en pantalla (YouTube), escritores cantan en vivo

#### 3.2 Votacion en vivo
- Publico vota desde su celular (via QR del evento)
- Resultados en tiempo real en pantalla del bar
- Ganador destacado en ranking

#### 3.3 Mapa de bares (futuro)
- Google Maps API: bares con ByFlow cerca de ti
- Filtro: "Eventos esta semana"
- Inscripcion desde la app

#### 3.4 Notificacion a productores (futuro)
- YouTube Data API + OAuth
- Comentario automatico en video del beat:
  "🎤 Alguien en ByFlow escribio una letra para tu beat: [link]"
- El productor puede reclamar su perfil en ByFlow

---

### FASE 4 — Modelo de negocio extendido

| Plan | Precio | Beats/dia | Grabacion | Ranking | Eventos |
|------|--------|-----------|-----------|---------|---------|
| Gratis | $0 | 3 | Solo sesion | Ver + votar | Inscribirse |
| PRO Creator | $199 MXN | Ilimitados | Permanente + portafolio | Publicar + destacar | Inscribirse |
| PRO Venue | $799 MXN | Ilimitados | + estadisticas | Todo | Organizar eventos |
| PRO Productor | $149 MXN (nuevo) | N/A | N/A | Reclamar beats, ver usos | Contactar escritores |

Stripe checkout integrado en landing.html y en panel de licencias.

---

## 5. ASPECTO LEGAL

### Doble reproductor — Por que es legal
1. El beat se reproduce en el **iframe NATIVO de YouTube** (no se extrae audio)
2. La voz se graba por separado en Web Audio API
3. NO se mezclan los audios en servidor
4. Disclaimer obligatorio con credito al canal del productor
5. Cumple YouTube ToS y API Policies

### Cita de Google:
> "API Clients must not modify or replace the text, images, information, or other content of the search results returned by those Services."

ByFlow no modifica el beat. Solo lo reproduce en su reproductor nativo.

### Propiedad intelectual
- Letras generadas por IA: firma ArT-AtR + copropiedad 50/50 ByFlow
- Letras escritas por usuario: 100% del usuario, con credito a ByFlow como herramienta
- Beats: 100% del productor, ByFlow solo reproduce via YouTube

---

## 6. AUDITORIA UX (feedback DeepSeek)

Issues detectados en produccion que hay que resolver:

| Issue | Prioridad | Cuando |
|-------|-----------|--------|
| Mezcla español/ingles (Play, Stop, Settings) | MEDIA | FASE 1 |
| QR dice "Cargando..." sin contexto | MEDIA | FASE 1 |
| Stats muestran "0" sin guia al usuario | BAJA | Ya resuelto FASE 0 |
| "Guardar Nueva Cancion" sin placeholder util | MEDIA | FASE 1 |
| Boton "Modo manual" sin tooltip | BAJA | FASE 1 |
| Botones de reproducir/parar siempre visibles (0 contaminacion) | ALTA | FASE 1 |

---

## 7. EQUIPO DE DESARROLLO

### Humano
- **Arturo Torres (ArT-AtR)** — Creador, vision, direccion, lirica

### IAs (La Colmena)
| IA | Rol | Contribuciones |
|----|-----|----------------|
| Claude (Anthropic) | Arquitectura principal | Frontend, backend, deploy, restructuracion, codigo |
| DeepSeek | Brainstorm + auditoria | Ecosistema creativo, doble reproductor, legal, UX audit |
| ChatGPT | Stem Engine | Pipeline beatbox→MIDI, separacion de pistas |
| Gemini | Settings IA | Integracion configuracion IA |

---

## 8. ARCHIVOS CLAVE

| Archivo | Descripcion |
|---------|-------------|
| `public/index.html` | Frontend SPA completo (~6700 lineas) |
| `server.js` | Backend Express + Socket.IO (~1400 lineas) |
| `public/landing.html` | Landing page de marketing |
| `data/cola.json` | Cola de cantantes |
| `data/canciones.json` | Catalogo de canciones |
| `data/stats.json` | Estadisticas de uso |
| `data/teleprompter.json` | Estado del teleprompter |
| `data/letras-beat.json` | **NUEVO FASE 1** — Letras con beats |
| `data/perfiles.json` | **NUEVO FASE 2** — Perfiles de creador |
| `ESTADO_PROYECTO.md` | Estado del proyecto |
| `CLAUDE.md` | Instrucciones para Claude |
| `PLAN_MAESTRO_v4.md` | Este documento |

---

## 9. ORDEN DE EJECUCION

```
FASE 0 ✅ COMPLETADA
  ↓
FASE 1 ← ESTAMOS AQUI
  1.1 Modo "estudio" en setMode()
  1.2 Doble reproductor (YT + mic)
  1.3 Grabacion de voz
  1.4 Editor de letra
  1.5 Busqueda de beats
  1.6 Backend letras-beat
  1.7 Disclaimer productor
  ↓
FASE 2
  2.1 Ranking publico
  2.2 Perfiles de creador
  2.3 Feed de actividad
  ↓
FASE 3
  3.1 Noches de Talento
  3.2 Votacion en vivo
  3.3 Mapa de bares
  3.4 Notificacion a productores
  ↓
FASE 4
  Stripe + planes extendidos
```

---

*Restructurado: 2026-03-17*
*Claude (Anthropic) + DeepSeek + Arturo Torres (ArT-AtR)*
*"El sistema parpadea, pero el codigo no miente"*
