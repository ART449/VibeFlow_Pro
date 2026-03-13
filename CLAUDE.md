# CLAUDE.md — VibeFlow Pro

## Project Overview

VibeFlow Pro is a real-time karaoke, recording studio, and promotional overlay system built on Node.js. It uses Socket.IO for live display control and integrates with Grok AI for screen analysis and event detection. Designed for restaurants, bars, and entertainment venues.

**Status:** Core backend and display frontend implemented. Grok client ready for local deployment.

## Architecture

```
┌───────────────────────────────────────────────────┐
│              CLIENTS / USERS                      │
│  (Phones, tablets, microphones, karaoke controls) │
└───────────────────────┬───────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────┐
│           server.js  (Express + Socket.IO)        │
│                                                   │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │  Karaoke    │ │   Studio     │ │  Promo    │  │
│  │  Engine     │ │   Recorder   │ │  Overlay  │  │
│  └─────────────┘ └──────────────┘ └───────────┘  │
│                                                   │
│  POST /api/grok/analyze  ← Grok AI detection     │
└───────────────────────┬───────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────┐
│       TV / Projector displays (display.html)      │
│  Connected via Socket.IO for real-time control    │
└───────────────────────────────────────────────────┘
                        ▲
┌───────────────────────┴───────────────────────────┐
│  grok-client.js  (local PC)                       │
│  Screen capture → OCR → classify → POST to server │
└───────────────────────────────────────────────────┘
```

## Repository Structure

```
VibeFlow_Pro/
├── .claude/
│   ├── launch.json            # Debug/launch config (Node.js, port 3000)
│   └── settings.local.json    # Claude Code permission allowlists
├── public/
│   ├── display.html           # TV/projector display UI (Socket.IO client)
│   └── videos/                # Promo video assets (MP4)
├── .gitattributes             # LF normalization
├── CLAUDE.md                  # This file
├── grok-client.js             # Local screen analysis client (runs on venue PC)
├── package.json               # Dependencies and scripts
└── server.js                  # Main backend — Express + Socket.IO
```

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 4.x
- **Real-time:** Socket.IO 4.x
- **Entry point:** `server.js`
- **Port:** 3000 (via `PORT` env var)
- **Deployment:** Railway (`byflowapp.up.railway.app`)

## Development

### Running the Server

```bash
npm start
# or
PORT=3000 node server.js
```

### Running the Grok Client (local venue PC)

```bash
# Install extra local dependencies first
npm install screenshot-desktop tesseract.js axios

VIBEFLOW_URL=https://byflowapp.up.railway.app ROOM_ID=sala1 node grok-client.js
```

### API Endpoints

| Method | Path                       | Description                              |
|--------|----------------------------|------------------------------------------|
| POST   | `/api/grok/analyze`        | Receive Grok AI screen analysis events   |
| POST   | `/api/karaoke/song-end`    | Trigger karaoke→promo transition         |
| POST   | `/api/studio/take-break`   | Trigger studio break overlay             |
| GET    | `/api/youtube/search?q=..` | YouTube search (placeholder)             |
| GET    | `/api/rooms/status`        | List all room states                     |
| POST   | `/api/admin/force-promo`   | Manually push a promo to a room          |
| GET    | `/api/health`              | Health check                             |

### WebSocket Events

| Event (server → display)  | Purpose                                   |
|---------------------------|-------------------------------------------|
| `sequence`                | Multi-step content sequence (karaoke end)  |
| `force-overlay`           | Admin-triggered promo                      |
| `cancel-overlay`          | Cancel active promo (user selected song)   |
| `studio-overlay`          | Studio tip/promo (skippable)               |
| `idle-screensaver`        | Looping promo for empty rooms              |
| `capture-moment`          | Viral moment toast notification            |
| `load-song`              | Load next karaoke song                     |
| `recording-started`       | Clear overlays, studio is live             |

### Environment Variables

| Variable        | Default                  | Description                   |
|-----------------|--------------------------|-------------------------------|
| `PORT`          | `3000`                   | Server listen port            |
| `VIBEFLOW_URL`  | `http://localhost:3000`  | Backend URL (grok-client)     |
| `ROOM_ID`       | `sala1`                  | Room ID (grok-client)         |
| `SCAN_INTERVAL` | `2000`                   | Screen scan interval ms       |
| `LANG`          | `spa`                    | OCR language                  |

### Display UI

Open in the TV/projector browser:
```
http://localhost:3000/display.html?room=sala1
```

## Git Workflow

- **Default branch:** `main`
- **Feature branches:** `claude/<description>-<id>`
- Line endings normalized to LF (`.gitattributes`)

## Conventions for AI Assistants

1. **Read before editing.** Always read a file before modifying it.
2. **Minimal changes.** Only change what is directly requested.
3. **No secrets in code.** Use environment variables for API keys and credentials.
4. **Commit often with clear messages.** Describe *why*, not just *what*.
5. **Run the server to verify.** Start with `PORT=3000 node server.js` and test with curl.
6. **Respect existing patterns.** Match code style already in the codebase.
7. **Keep dependencies lean.** Don't add packages unless truly necessary.
