# CLAUDE.md — VibeFlow Pro

## Project Overview

VibeFlow Pro is a Node.js web application with YouTube integration capabilities. The application serves on port 3000 and provides a REST API for YouTube search functionality.

**Status:** Early-stage / initial setup. The project scaffolding and Claude Code configuration are in place; application code is being developed.

## Repository Structure

```
VibeFlow_Pro/
├── .claude/
│   ├── launch.json            # Debug/launch configuration (Node.js, port 3000)
│   └── settings.local.json    # Claude Code permission allowlists
├── .gitattributes             # LF normalization (auto)
├── CLAUDE.md                  # This file
└── server.js                  # (planned) Main application entry point
```

## Tech Stack

- **Runtime:** Node.js
- **Entry point:** `server.js`
- **Port:** 3000 (set via `PORT` env var)
- **API style:** RESTful (Express-based)

## Development

### Running the Application

```bash
PORT=3000 node server.js
```

### Key API Endpoints (planned)

| Method | Path                       | Description          |
|--------|----------------------------|----------------------|
| GET    | `/api/youtube/search?q=..` | YouTube search query |

### Environment Variables

| Variable | Default | Description            |
|----------|---------|------------------------|
| `PORT`   | `3000`  | HTTP server listen port |

## Git Workflow

- **Default branch:** `main`
- **Feature branches:** Use `claude/<description>-<id>` naming convention
- Line endings are normalized to LF (`.gitattributes`)

## Conventions for AI Assistants

1. **Read before editing.** Always read a file before modifying it.
2. **Minimal changes.** Only change what is directly requested — avoid drive-by refactors, unnecessary comments, or speculative features.
3. **No secrets in code.** Never commit API keys, tokens, or credentials. Use environment variables.
4. **Commit often with clear messages.** Each commit should describe *why*, not just *what*.
5. **Run the server to verify.** After changes, start the server (`PORT=3000 node server.js`) and test with curl to confirm functionality.
6. **Respect existing patterns.** Match the code style already present in the codebase rather than imposing new conventions.
7. **Keep dependencies lean.** Don't add packages unless truly necessary for the task at hand.
