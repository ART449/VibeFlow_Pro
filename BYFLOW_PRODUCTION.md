# ByFlow Trinity v3.1 — Documentación completa de producción

> Extraído de `byflowapp.up.railway.app` — 13 marzo 2026
> Creado por: **Arturo Torres (ArT-AtR) / IArtLabs**
> Copyright © 2024-2026 IArtLabs. Todos los derechos reservados.

---

## Descripción General

ByFlow es una plataforma profesional de karaoke, teleprompter y gestión de entretenimiento en vivo. Combina:
- Sistema de karaoke con cola de cantantes y letras sincronizadas
- Teleprompter con formato LRC (word-by-word highlighting)
- Gestión de bares (mesas, órdenes, VIP)
- Asistente IA (GFlow) con Grok API y Ollama local
- Streaming de YouTube y SoundCloud
- Control remoto por QR
- Sistema de licencias Premium

---

## Arquitectura Técnica

```
┌─────────────────────────────────────────────────────────┐
│              CLIENTES / USUARIOS                        │
│  (Móviles, tablets, micrófonos, controles de karaoke)   │
│  Control remoto vía QR code                             │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│        byflowapp.up.railway.app (Node.js)               │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │   Karaoke    │ │   Bares      │ │  GFlow IA      │  │
│  │   Engine     │ │   Manager    │ │  (Grok/Ollama) │  │
│  │  - Cola      │ │  - Mesas     │ │  - DJ mode     │  │
│  │  - Telepromp │ │  - Órdenes   │ │  - Owner mode  │  │
│  │  - LRC sync  │ │  - VIP       │ │  - Maintenance │  │
│  │  - Scoring   │ │  - Promos    │ │  - Lyrics gen  │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │   YouTube    │ │  SoundCloud  │ │  Licencias     │  │
│  │   Streaming  │ │  Integration │ │  Premium       │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
│                                                         │
│  Socket.IO para sincronización en tiempo real           │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│       PANTALLAS / TV / PROYECTORES / MÓVILES            │
│  Teleprompter, videos, overlays de promos               │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack (Producción)

- **Runtime:** Node.js
- **Frontend:** Vanilla JavaScript (sin frameworks)
- **Real-time:** Socket.IO
- **IA:** Grok API (grok-3-mini, server-side) + Ollama (local, opcional)
- **Lyrics:** LRCLib (Creative Commons)
- **Música:** YouTube Data API + SoundCloud
- **Deploy:** Railway
- **Puerto:** 8080 (producción)
- **Versión:** 2.0.0

---

## API Endpoints (Producción)

### Cola de cantantes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/cola` | Obtener cola de cantantes |
| POST | `/api/cola` | Agregar cantante a la cola |
| PATCH | `/api/cola/{id}` | Actualizar estado (esperando/cantando) |
| DELETE | `/api/cola/{id}` | Eliminar cantante de la cola |

### Mesas / Bares
| Método | Ruta | Descripción |
|--------|------|-------------|
| PATCH | `/api/mesas/{num}` | Cambiar estado de mesa (libre/ocupada/VIP) |

### Canciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/canciones` | Guardar canción con letras |

### IA (GFlow)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/ai/status` | Estado de backends IA (Grok/Ollama) |
| POST | `/api/ai/chat` | Chat con GFlow (requiere X-License-Token) |

### Licencias
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/license/status` | Estado de activación |
| POST | `/api/license/activate` | Activar licencia Premium |
| POST | `/api/license/deactivate` | Desactivar licencia |

### Otros
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check (status, version, uptime, songs, queue) |
| GET | `/api/qr` | Generar QR para control remoto |

---

## WebSocket Events (Producción)

### Server → Client
| Evento | Datos | Descripción |
|--------|-------|-------------|
| `init` | cola, mesas, teleprompter | Sincronización inicial al conectar |
| `cola_update` | array de cantantes | Cola actualizada |
| `mesas_update` | array de mesas | Estado de mesas actualizado |
| `tp_update` | lyrics, currentWord, isPlaying, speed | Estado del teleprompter |
| `singer_changed` | cantante activo | Cambio de cantante activo |
| `tp_speed_update` | velocidad | Cambio de velocidad de reproducción |

### Client → Server
| Evento | Datos | Descripción |
|--------|-------|-------------|
| `tp_lyrics` | texto de letras | Enviar letras para sincronizar |
| `tp_scroll` | índice de palabra | Reportar posición actual |
| `tp_speed` | velocidad | Ajustar velocidad |

---

## Modos de la Aplicación

| Modo | Descripción | Premium |
|------|-------------|---------|
| `karaoke` | Cola + teleprompter + scoring | No |
| `remote` | Control remoto vía QR | No |
| `ia` | GFlow asistente DJ | Sí |
| `youtube` | Búsqueda y streaming de música | Sí |
| `bares` | Gestión de mesas, órdenes, promos | Sí |
| `settings` | Configuración, perfil, API keys | No |

---

## GFlow IA — System Prompts

### Modo DJ (default)
```
Te llamas GFlow, el DJ IA integrado en ByFlow (powered by IArtLabs,
creado por ArT-AtR / Arturo Torres).

Tu objetivo no es solo poner canciones: tu objetivo es dominar la pista,
leer la sala.

REGLAS MAESTRAS:
1) Siempre detecta primero el contexto
2) Si faltan datos, asume una configuracion razonable
3) No recomiendes canciones al azar
4) Construye sets como si fueran una pelicula

Responde siempre en español.
```

### Modo Owner / Superuser (Arturo Torres)
```
ATENCION: Estas hablando con Arturo Torres (ArT-AtR), el creador de
ByFlow y tu jefe.

Ve al grano. Si te pide algo, responde corto y claro.
Puedes ser informal, usar humor, hablar como camarada.
```

### Modo Mantenimiento
```
MODO MANTENIMIENTO ACTIVADO. Eres GFlow en rol de tecnico.

Tu trabajo es revisar la app desde adentro y reportar problemas.
NO puedes cambiar NADA del codigo.

Revisa: estado de APIs.
Responde con formato de reporte corto: [OK] / [ERROR] / [WARNING]
```

---

## Sistema de Licencias

- **Formato de clave:** `VFP-XXXXX-XXXXX-XXXXX-XXXXX`
- **Activación:** Online con token por usuario
- **Almacenamiento:** localStorage (`byflow_license_token`)
- **Features gateadas:**
  - `bares` — Módulo de gestión de mesas/órdenes
  - `music_streaming` — YouTube y SoundCloud
  - `ollama_ai` — IA local con Ollama
- **Validación:** `isPremium(feature)` en frontend
- **Contacto licencias:** licencias@iartlabs.com

---

## Teleprompter Engine

- Soporta texto plano y formato LRC sincronizado
- Parser LRC: `[MM:SS.ms] texto`
- Highlighting word-by-word con auto-scroll
- Control de velocidad: 0.2x a 5.0x
- Modo fullscreen con tracking de progreso
- Búsqueda de letras online vía LRCLib (Creative Commons)
- Motor de generación de letras ArT-AtR (offline)

---

## Bares Module

- Grid de mesas con 3 estados: `libre`, `ocupada`, `VIP`
- Sistema de órdenes con timestamps
- Estadísticas en tiempo real (mesas ocupadas, libres, VIP, órdenes)
- Programación de mensajes promocionales entre canciones
- Soundboard DJ con 9 efectos (airhorn, applause, bass drop, etc.)
- Configuración: `byflow_bar_name`, `byflow_bar_mesas` en localStorage

---

## Estado actual en producción

```json
{
  "health": {
    "status": "ok",
    "version": "2.0.0",
    "port": "8080"
  },
  "ai": {
    "grok": true,
    "grokModel": "grok-3-mini",
    "ollama": false
  },
  "license": {
    "activated": false,
    "features": []
  },
  "cola": [
    {"nombre": "Carlos", "cancion": "Despacito", "mesa": 3, "estado": "esperando"},
    {"nombre": "Maria", "cancion": "Felices los 4", "mesa": 7, "estado": "esperando"},
    {"nombre": "Pedro", "cancion": "La Bamba", "mesa": 3, "estado": "esperando"}
  ]
}
```

---

## localStorage Keys

| Key | Descripción |
|-----|-------------|
| `byflow_last_mode` | Último modo activo |
| `byflow_license_token` | Token de licencia Premium |
| `byflow_bar_name` | Nombre del bar/venue |
| `byflow_bar_mesas` | Número de mesas configuradas |

---

## CSS / Diseño

- Tema oscuro con gradientes (pink #ff006e, purple #8338ec, blue #3a86ff, green #00f5a0)
- 400+ clases utility con CSS custom properties
- Responsive: breakpoints en 900px y 600px
- Navegación móvil con overlay

---

## Contacto IArtLabs

- **General:** contacto@iartlabs.com
- **Licencias:** licencias@iartlabs.com
- **Soporte:** soporte@iartlabs.com

---

## Diferencias: Producción vs Este Repo (VibeFlow_Pro)

### Ya existe en producción, FALTA en este repo:
1. Cola de cantantes (CRUD completo)
2. Teleprompter con LRC sincronizado
3. Módulo de Bares (mesas, órdenes, VIP, estadísticas)
4. GFlow IA con Grok API (grok-3-mini) + system prompts
5. YouTube + SoundCloud streaming
6. Sistema de licencias Premium
7. Control remoto por QR
8. Soundboard con efectos DJ
9. LRCLib integración para letras
10. Motor ArT-AtR para generación de letras

### Ya existe en este repo:
1. Server Express + Socket.IO básico
2. Grok client (OCR + clasificación de pantalla)
3. Display.html (overlay de promos para TV)
4. Endpoints de detección Grok + transiciones karaoke/studio
5. Sistema de rooms en memoria
6. CLAUDE.md con documentación

### Pendiente de implementar (de las conversaciones con Grok):
1. Reconocimiento del dueño (Arturo) — acciones especiales al detectarlo
2. Integración xAI Grok Vision API para análisis de imagen avanzado
3. Dashboard admin HTML
4. Videos MP4 de promos en public/videos/
5. Persistencia de datos (base de datos)
6. Deploy unificado a Railway
