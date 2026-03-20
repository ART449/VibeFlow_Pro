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
- **Version:** v3.4 → v4.0 en progreso
- **Produccion:** https://byflowapp.up.railway.app
- **Repo:** https://github.com/ART449/VibeFlow_Pro
- **Stack:** Node.js + Express + Socket.IO (server.js) | HTML/CSS/JS SPA (public/index.html)
- **Concepto:** Karaoke inteligente y teleprompter para raperos/cantantes. Cero contaminacion visual. El software es un "Director Vocal" que escucha y guia.
- **Vision v4.0:** Ecosistema creativo que conecta bares, escritores y productores via beats de YouTube

## Modos de la app (v4.0)
1. **Karaoke** (GRATIS) — Teleprompter, cola, letras sincronizadas
2. **Musica** (PRO) — YouTube/SoundCloud/Jamendo streaming
3. **Bares** (PRO) — Mesas, promos, jingle, soundboard, eventos
4. **IA Studio** (PRO) — Ollama, generar letras, sugerir canciones
5. **Estudio** (NUEVO v4) — Doble reproductor beat+voz, editor de letra, ranking
6. **Vistas** — DJ Dashboard multi-panel
7. **Remote** — Vista publica teleprompter

## Archivos clave
- `server.js` — Backend completo (API, licencias, Socket.IO)
- `public/index.html` — TODO el frontend (SPA ~6700 lineas)
- `ESTADO_PROYECTO.md` — Estado actual y pendientes
- `PLAN_MAESTRO_v4.md` — Plan v4.0 completo (fases, legal, equipo, modelo de negocio)
- `IDEAS_PARA_LANZAR.md` — Ideas que requieren investigacion

## Al iniciar sesion
1. **PRIMERO** leer el briefing de ArT Assistant: `C:\Users\art44\.claude\projects\C--BYFLOW-VibeFlow-Pro\context-briefing.md` — tiene estado de produccion, commits recientes, preguntas pendientes y resumen de la Colmena
2. Leer la cola de preguntas: `C:\BYFLOW\ArT-Assistant\data\claude-queue.json` — preguntas que Arturo mando desde ArT Assistant para que yo resuelva
3. Leer ESTADO_PROYECTO.md para contexto adicional
4. Mostrar resumen rapido de lo que encontre y preguntar que quiere priorizar
5. Verificar si hay algo roto en produccion antes de agregar features

## ArT Assistant (junior AI)
- **Ubicacion:** `C:\BYFLOW\ArT-Assistant\`
- **Que hace:** Monitorea produccion, coordina la Colmena, prepara contexto para mi
- **Cola de preguntas:** `data/claude-queue.json` — las que Arturo manda con `/claude`
- **Briefing:** Se auto-genera en `context-briefing.md` antes de cada sesion
- **Lenguaje:** Arturo habla español mexicano informal (typos, jerga, voice-to-text). ArT Assistant traduce. "haslo"=hazlo, "simon"=si, "truena"=falla, "lana"=dinero

## Reglas del proyecto
- **CERO descargas de musica** — Solo streaming embebido (YouTube/SoundCloud/Jamendo)
- **Branding:** ByFlow (NO VibeFlow, NO Vibe Flow)
- **Lema:** "Vive Cantando con ByFlow"
- **Creditos:** powered by IArtLabs
- **Idioma UI:** Español
- **Deploy:** git push a GitHub → Railway auto-deploy

## Politica de propiedad intelectual
- **Solo aplica a letras generadas con el Motor ARTATR** (modelo entrenado con las letras de ArT-AtR)
- **Copropiedad 50/50** — 50% ArT-AtR (por el modelo/estilo) + 50% el usuario que guio la IA
- **Letras 100% escritas por el usuario** = 100% del usuario, ByFlow no reclama nada
- **Letras 100% escritas por ArT-AtR** = 100% ArT-AtR
- La firma ByFlow indica la herramienta usada, NO reclama propiedad
- Implementado en: `offerLoadLyrics()`, `generateOfflineLyrics()`, constante `BYFLOW_SIGNATURE`

## Letras originales de ArT-AtR (referencia)
- `data/letras_art_atr.txt` — **CATALOGO MAESTRO** con 41 canciones de 4 fuentes (OneNote, Google Photos, archivo local, Suno). 11 letras transcritas completas + 30 canciones Suno catalogadas.
- **INTEGRADO EN LA APP:** Las 11 letras completas estan hardcodeadas en `index.html` (array `_artLetras`) y son cargables al teleprompter desde el Estudio de Letras > "Mis Letras"
- **Catalogo Suno** tambien integrado en la app (array `_sunoTracks`, 30 tracks) accesible desde Estudio de Letras > "Suno"
- `C:\Users\art44\Desktop\perro.txt` — Rap de desamor y traicion (~21 lineas). Estilo crudo, callejero.
- `C:\Users\art44\Desktop\verciones antiguas byflow\byfl\actualizar v7\Es un rimador experto en verso pros.txt` — Archivo maestro: identidad ArT-AtR, cancion "Let it flow" (ES+EN), cancion melancolica con SFX (Intro/Verso/Coro/Puente/Outro), script Python compositor
- `C:\Users\art44\OneDrive\galgo\letras galgo.jpg` — Imagen con letras del proyecto Galgo
- **Suno.com perfil ART-ATR** (suno.com/me) — ~100+ tracks, 10 paginas. Proyectos: TEC-PATL (serie nahua), Codigo (tech-lirica), ByFlow Trinity. Canciones clave: SENTIDO PERDIDO, LA BACHA, El Alma (Tributo a Mama), ITZTLI, EL TABLERO DE JUDAS.

## Estudio de Letras (ecosistema completo)
El Estudio de Letras tiene 3 pestanyas:
1. **Generar** — Engine offline v2 (192 frases, 65+ rimas, Fisher-Yates shuffle)
2. **Mis Letras** — 11 letras originales de ArT-AtR con busqueda, preview y carga al teleprompter
3. **Suno** — Catalogo de 30 canciones del perfil ART-ATR con genero, tema y plays
- Todas las letras generadas llevan firma obligatoria `BYFLOW_SIGNATURE` (50/50)

## Features portados del proyecto Python v7.3
- **Filtro de contenido** — 35+ palabras prohibidas (ES+EN), validacion server+client side
- **Estadisticas de uso** — GET /api/stats, panel visual en Settings con top songs/singers y chart 7 dias
- **LRCLIB proxy** — GET /api/lrclib/search, evita CORS issues
- **Design system por modo** — Gradientes dinamicos: bares=naranja, ia=morado, youtube=rojo, karaoke=rosa
- **Tracking de eventos** — Persistencia en data/stats.json, auto-debounce

## Politica anti-pirateria
- No existe endpoint de descarga de audio
- No se usa yt-dlp, ytdl, ni ningun downloader
- YouTube solo via iframe embed
- SoundCloud solo via widget embed
- Jamendo streaming via su API (musica CC libre)

## Git/Deploy
- Push directo a main con --force (proyecto personal, no team)
- Token GitHub en el historial del chat (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)
- Secretos (.license_secret, .admin_secret, licenses.json) en .gitignore

## Proyectos paralelos (otras ubicaciones)
- Stem Engine: desarrollo en ChatGPT, archivos en mnt/data
- Backend Python v7.3: C:\Users\art44\OneDrive\Documentos\GitHub\byflow\
