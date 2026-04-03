# Handoff Codex -> Claude

**Proyecto:** ByFlow  
**Fecha:** 2026-04-03  
**Repo base:** `C:\BYFLOW\VibeFlow_Pro`

## Estado Actual

- Objetivo:
  Arreglar el demo comercial de POS para que no se quede atorado en login/PIN y funcione como showroom interactivo para dueños.
- Branch:
  `main`
- Estado del repo:
  `main...origin/main [ahead 1]`
- Progreso real actual:
  `public/pos-demo.html`, `public/bares-v2.html` y `public/js/pos-demo-sim.js`

## Lo Que Hizo Codex

### 1. Showroom sin PIN

- `public/pos-demo.html`
  Se cambió el iframe del demo para usar `bares-v2.html?demo=true&view=mesas`.
- `public/bares-v2.html`
  Se agregó carga de `public/js/pos-demo-sim.js`.
- `public/js/pos-demo-sim.js`
  Nuevo simulador local que:
  - siembra sesión temporal para demo;
  - evita que `bares-v2.html` redirija a `/pos.html`;
  - intercepta `fetch` a `/pos/*` y `/api/ai/chat`;
  - responde con datos ficticios para mesas, comandas, covers, inventario, reportes, corte, karaoke, IA y pagos.

### 2. Navegación del iframe

- `public/bares-v2.html`
  Se agregó `window.addEventListener('message', ...)` para aceptar `postMessage({ action: 'showView', view })` desde `pos-demo.html`.
- `public/pos-demo.html`
  `loadDemo()` ahora manda el cambio de vista al iframe y usa `src` con `view=` como fallback.

### 3. Copy del demo

- `public/pos-demo.html`
  Se aclaró que esta superficie es:
  - showroom interactivo;
  - con datos ficticios;
  - sin PIN;
  - sin tocar la operación real.

## Archivos Importantes

- `public/pos-demo.html`
- `public/bares-v2.html`
- `public/js/pos-demo-sim.js`

## Ruido Local Ignorado

- `.gradle-android/`
- `android/.gradle-build-cache/`

No tocar ni commitear eso como parte del arreglo del demo.

## Worktrees Revisados

- `bold-tharp`: limpio
- `busy-carson`: limpio
- `modest-joliot`: limpio
- `trusting-joliot`: limpio
- `xenodochial-yalow`: solo cambia `.claude/settings.local.json`

## Coordinación en Live Sync

Codex dejó claim para estos archivos:

- `public/pos-demo.html`
- `public/bares-v2.html`
- `public/js/pos-demo-sim.js`

Y publicó heartbeat/mensaje indicando que el showroom sin PIN ya quedó a nivel frontend y falta validación visual.

## Verificación Hecha

- `node --check public/js/pos-demo-sim.js`

No se hizo prueba visual en navegador desde esta sesión.

## Riesgo Principal

- El modo demo depende del query `demo=true`.
- Si Claude toca el flujo normal de `bares-v2.html` o `pos-auth.js`, cuidar no romper el POS real.
- El simulador fue diseñado para activarse solo en showroom; no mezclarlo con rutas reales de operación.

## Siguiente Paso Recomendado Para Claude

1. Abrir `public/pos-demo.html` en navegador.
2. Confirmar que:
   - ya no redirige a `/pos.html`;
   - las tabs del demo cambian entre vistas;
   - se pueden simular interacciones básicas;
   - el discurso visual sí vende el producto a dueños.
3. Si todo carga bien, pulir la narrativa comercial del showroom:
   - más enfoque en operación;
   - comparación más filosa contra Soft Restaurant;
   - menos sensación de “sandbox técnico” y más “demo de cierre”.
