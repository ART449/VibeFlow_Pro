# ByFlow — Contexto para Claude Code

## Proyecto
- **Nombre:** ByFlow — "Vive Cantando con ByFlow"
- **Empresa:** IArtLabs (powered by)
- **Version:** v3.0
- **Produccion:** https://byflowapp.up.railway.app
- **Repo:** https://github.com/ART449/VibeFlow_Pro
- **Stack:** Node.js + Express + Socket.IO (server.js) | HTML/CSS/JS SPA (public/index.html)

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
