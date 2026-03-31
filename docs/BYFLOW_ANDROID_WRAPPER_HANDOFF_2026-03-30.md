# ByFlow Android Wrapper Handoff

Fecha: 2026-03-30

## Estado actual

El proyecto Android wrapper ya existe y es funcional como base de APK inmediata.

### Confirmado

- Android project en `android/`
- Capacitor config en `capacitor.config.json`
- `appId`: `com.iartlabs.byflow`
- `appName`: `ByFlow`
- `server.url`: `https://byflowapp.up.railway.app`
- `webDir`: `public`

## Lo que significa

Hoy mismo se puede compilar un APK wrapper de la web actual.

Eso sirve para:

- pruebas reales en Android
- demo instalable
- validar login, POS, karaoke y flujos base
- avanzar en distribucion mientras se construyen pantallas nativas

## Comandos utiles

Desde la raiz del repo:

```bash
npm run cap:copy:android
npm run cap:sync:android
npm run cap:open:android
```

## Estrategia recomendada

### Fase A: wrapper util ya

Mantener el wrapper funcionando con la web actual para generar APK rapido.

### Fase B: nativo por flujos

Construir cliente nativo nuevo por modulos:

1. Login
2. Mesas
3. Comanda
4. Cobro
5. Cocina / Barra
6. Teleprompter / Karaoke
7. Estudio de letras

## Regla clave

No mover el backend.

Se conserva:

- `server.js`
- `routes/`
- `pos/`

Se rehace:

- experiencia cliente
- navegacion
- UI de operacion

## Recomendacion para Claude + Codex

### Claude

- shell Android
- build
- instalacion
- configuracion de proyecto nativo

### Codex

- limpiar contratos
- preparar flujos nativos
- seguir separando logica del DOM
- mantener POS operativo en web mientras nace nativo

## Riesgos actuales del wrapper

- la web sigue cargando logica pesada en HTML inline
- UX movil wrapper no equivale todavia a UX nativa
- algunas pantallas fueron pensadas para desktop antes que para touch

## Ventaja

No estamos empezando de cero.

Ya existe:

- APK path inmediato con Capacitor
- backend estable
- mapa de flujos prioritarios
- base para migracion nativa en paralelo
