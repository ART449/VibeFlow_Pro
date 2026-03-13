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
- **Version:** v3.1
- **Produccion:** https://byflowapp.up.railway.app
- **Repo:** https://github.com/ART449/VibeFlow_Pro
- **Stack:** Node.js + Express + Socket.IO (server.js) | HTML/CSS/JS SPA (public/index.html)
- **Concepto:** Karaoke inteligente y teleprompter para raperos/cantantes. Cero contaminacion visual. El software es un "Director Vocal" que escucha y guia.

## Archivos clave
- `server.js` — Backend completo (API, licencias, Socket.IO)
- `public/index.html` — TODO el frontend (SPA ~2800 lineas)
- `ESTADO_PROYECTO.md` — Estado actual y pendientes
- `IDEAS_PARA_LANZAR.md` — Ideas que requieren investigacion

## Al iniciar sesion
1. Leer ESTADO_PROYECTO.md para saber donde quedamos
2. Preguntar al usuario que quiere priorizar hoy
3. Verificar si hay algo roto en produccion antes de agregar features

## Reglas del proyecto
- **CERO descargas de musica** — Solo streaming embebido (YouTube/SoundCloud/Jamendo)
- **Branding:** ByFlow (NO VibeFlow, NO Vibe Flow)
- **Lema:** "Vive Cantando con ByFlow"
- **Creditos:** powered by IArtLabs
- **Idioma UI:** Español
- **Deploy:** git push a GitHub → Railway auto-deploy

## Politica de propiedad intelectual (OBLIGATORIA)
- **TODA letra generada por ByFlow** (ya sea por IA o por el generador offline) lleva firma obligatoria de ArT-AtR
- **Copropiedad 50/50** — La propiedad intelectual de cualquier letra generada queda: 50% ArT-AtR (Arturo Torres) / 50% ByFlow (IArtLabs)
- **Esto es por regla y norma, sin excepcion**
- La firma incluye: autor (ArT-AtR), herramienta (ByFlow), y aviso de copropiedad 50/50
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
