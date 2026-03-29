# ByFlow Show Control Research

**Proyecto:** ByFlow  
**Fecha:** 2026-03-29  
**Autor de esta pasada:** Codex  
**Objetivo:** aterrizar una arquitectura real para convertir ByFlow en una plataforma de DJ + Karaoke + Teleprompter + Show Control + version Conciertos.

---

## Resumen ejecutivo

Mi opinion directa:

ByFlow ya tiene una base muy buena para karaoke y show visual ligero, pero hoy todavia no es un sistema de control escenico profesional.

Lo que ya existe sirve como semilla:

- karaoke y teleprompter funcionales
- player con Web Audio FX
- soundboard DJ de SFX
- dashboard `vistas`
- pantalla remota y gemelo nuevo
- sincronizacion local y por Socket.IO

Lo que falta para volverlo "sistema completo" no es solo mas UI.
Falta una **capa de show control** que conecte ByFlow con hardware y software externo.

### Mi recomendacion principal

No intentaria que el navegador controle todo directamente.

Haria una arquitectura de 3 capas:

1. **ByFlow Web UI**
   DJ, karaoke, teleprompter, escenas, mappings, dashboards.
2. **ByFlow Control Bridge**
   servicio local de escritorio que hable con MIDI, HID, OSC, mixers, luces, OBS y hardware real.
3. **Motores externos o integrados**
   QLC+ / OLA para luces, OBS para video/stream, motores DJ externos o propios para mezcla, y dispositivos reales.

La web controla.
El bridge traduce.
Los motores ejecutan.

Ese es el camino serio.

---

## Lo que ByFlow ya tiene hoy

Revisando el repo actual:

- `public/js/modules/player.js`
  - FX con `AudioContext`
  - ecualizacion, delay, reverb
  - local audio
- `public/index.html`
  - `djPlay()` y soundboard de 9 SFX
  - `djInit()`
  - `vistas-panel` como dashboard DJ multi-panel
  - waveform/progress visual
- `public/js/modules/lyrics.js`
  - teleprompter, LRC, autoscroll
- `public/js/modules/twin-bridge.js`
  - contrato nuevo para gemelo por tiempo real
- `public/js/modules/twin-player.js`
  - segunda pantalla seria
- `public/remote.html`
  - pantalla remota legado
- `public/lrc-studio.html`
  - authoring LRC / Song Package

### Conclusión del estado actual

ByFlow ya tiene:

- motor de experiencia
- interfaces de operador
- timeline de letra
- eventos de playback

Pero aun no tiene:

- abstraccion de dispositivos
- mapeo MIDI/HID
- escenas de show
- cue stack
- control de luces
- control de mixers
- integracion con OBS/video
- sincronizacion de tempo/protocolo entre apps

---

## Lo que si podemos controlar desde navegador

### 1. MIDI

La Web MIDI API existe y permite listar dispositivos MIDI y enviar/recibir mensajes.

Puntos clave oficiales:

- `navigator.requestMIDIAccess()` requiere **HTTPS / secure context**
- requiere permiso del usuario
- MDN la marca como **Limited availability**

Esto sirve muy bien para:

- mapear pads, knobs y faders
- transporte
- hotcues
- disparo de SFX
- control de teleprompter
- cambio de escena

Lo bueno:

- gran MVP para controladores MIDI clasicos
- muy util para "MIDI Learn"

Lo malo:

- soporte desigual entre navegadores
- no es suficiente para todo el ecosistema pro

### 2. HID

La WebHID API puede ayudar con algunos controladores que no exponen MIDI puro.

Puntos clave oficiales:

- tambien requiere contexto seguro
- MDN la marca como **Experimental** y **Limited availability**

Sirve para:

- algunos controladores DJ/HID
- superficies con reportes HID

No la usaria como pilar principal.
La usaria como capa secundaria.

### 3. Serial

La Web Serial API es util para:

- microcontroladores
- gateways caseros
- hardware custom

Pero tambien es **Experimental** y **Limited availability**.

Puede servir para:

- footswitch custom
- botoneras DIY
- interfaces DIY de escenario

---

## Lo que NO pondria solo en el navegador

### 1. Luces DMX profesionales

Para luces profesionales no intentaria hablar USB-DMX directo desde la web como estrategia principal.

Lo correcto es hablar uno de estos mundos:

- **Art-Net**
- **sACN / E1.31**
- **OSC**
- o integrar con un motor como **QLC+** u **OLA**

### 2. Mixers profesionales

Las mezcladoras digitales y mixers pro suelen controlarse por:

- MIDI
- HID
- OSC
- APIs propietarias
- o apps nativas del fabricante

El navegador puede ser consola de control.
Pero la comunicacion dura con hardware real conviene moverla al bridge local.

### 3. Audio DJ serio

ByFlow hoy puede reproducir, aplicar FX y lanzar SFX.
Eso esta muy bien para karaoke, host y barra.

Pero para DJ profesional de club o concierto yo no intentaria reemplazar de golpe:

- Mixxx
- Serato
- VirtualDJ
- Rekordbox
- Traktor

Mi opinion:

ByFlow debe **orquestar** primero.
No intentar ser todos los motores a la vez desde la version 1.

---

## Protocolos y piezas que si recomiendo

## A. MIDI / MIDI 2.0

### Recomendacion

Implementar primero:

- MIDI 1.0 operativo
- capa de mapeo interna
- `MIDI Learn`
- perfiles por dispositivo

Y diseñar la arquitectura pensando en futuro para:

- MIDI 2.0
- MIDI-CI
- perfiles negociables

MIDI 2.0, segun The MIDI Association, no reemplaza MIDI 1.0; lo extiende.
Eso es perfecto para ByFlow: compatibilidad hoy, camino de mejora mañana.

### Donde lo usaria en ByFlow

- play / pause / siguiente / anterior
- velocidad del teleprompter
- nudge LRC
- disparo de SFX
- escenas de luces
- macros DJ
- cambio de modo
- mezcla de stems o grupos si luego los agregas

---

## B. OSC

### Recomendacion

OSC debe ser un protocolo de primera clase en ByFlow.

Es ideal para:

- mixers digitales
- QLC+
- TouchOSC
- Open Stage Control
- apps de escenario
- control entre procesos

### Donde lo usaria

- ByFlow -> QLC+
- ByFlow -> mixer digital
- ByFlow -> resolvers de video
- iPad/telefonos -> ByFlow

Si tuviera que escoger un protocolo flexible para show control, despues de MIDI, escogería OSC.

---

## C. Luces: Art-Net y sACN

### Recomendacion

No hablar DMX "crudo" primero.
Hablar red.

Para luces:

- **Art-Net** si quieres compatibilidad amplisima y ecosistema instalado
- **sACN / E1.31** si quieres una ruta moderna y muy usada en lighting de red

Art-Net oficial:

- transporta DMX/RDM sobre ethernet
- usa UDP
- puerto 6454

QLC+ documenta:

- Art-Net por UDP
- sACN por UDP puerto 5568
- plugins listos

### Mi postura

Para ByFlow haria esto:

1. ByFlow no controla fixtures uno por uno al inicio
2. ByFlow dispara **escenas**, **cues** o **grupos**
3. QLC+ u OLA traduce eso al universo de luces real

Eso te ahorra construir una consola DMX completa desde cero.

---

## D. QLC+ como motor de luces

### Por que si

QLC+ hoy ya ofrece oficialmente:

- Art-Net
- sACN / E1.31
- OSC
- MIDI
- HID
- Web interface
- kiosk mode

Eso lo vuelve un gran motor de luces para ByFlow.

### Como lo conectaria

ByFlow manda:

- cue
- escena
- pagina
- blackout
- estrobo
- color principal
- intensidad
- trigger beat

QLC+ ejecuta:

- fixtures
- universos
- chases
- macros
- escenas complejas

### Beneficio

Te enfocas en experiencia y flujo del operador.
No en reconstruir una consola DMX completa.

---

## E. OLA como backend tecnico

Si quieres algo mas de "ingenieria" y menos "software final de operador", OLA es muy fuerte.

Oficialmente OLA soporta:

- Art-Net
- sACN
- OSC
- mas de 20 widgets USB DMX
- APIs C++, Python y Java

### Cuándo usar OLA

- gateways
- integracion custom
- appliances
- Raspberry Pi
- hardware bridge propio de ByFlow

### Mi opinion

Si vas por producto empaquetado "ByFlow Box", me interesa mas OLA.
Si vas por despliegue rapido para venues, me interesa mas QLC+ primero.

---

## F. OS2L para DJ + luces

OS2L es muy interesante para ByFlow.

Oficialmente:

- es un protocolo abierto "Open Sound to Light"
- manda beat y comandos por red
- su objetivo es sincronizar software de audio con software DMX

QLC+ documenta soporte OS2L y menciona a VirtualDJ como host soportado.

### Donde encaja en ByFlow

Si quieres que las luces reaccionen al beat del DJ:

- VirtualDJ o futuro motor DJ
- envia OS2L
- QLC+ recibe OS2L
- ByFlow puede:
  - orquestar
  - mostrar estado
  - disparar macros
  - cambiar presets segun modo/evento

### Mi opinion

OS2L no sustituye tu arquitectura.
Pero es excelente como capa de sincronizacion DJ -> luces.

---

## G. Ableton Link para version concierto

Ableton Link oficial sincroniza:

- beat
- tempo
- phase
- start/stop

entre apps y dispositivos en red local.

### Donde lo veo fuerte

Version concierto y show musical:

- tracks
- secuencias
- click
- loops
- apps auxiliares
- DJs invitados
- performers con varios dispositivos

### Mi opinion

Si haces una version "Conciertos", **Ableton Link** debe estar en el radar desde el diseño, aunque no lo implementes en la primera fase.

---

## H. OBS WebSocket

OBS WebSocket es oficial del proyecto OBS y ya viene incluido por defecto en OBS Studio 28+.

### Lo usaria para

- cambiar escenas de video
- lower thirds del cantante
- overlays de letra
- contador de cola
- branding por venue
- stream / grabacion del show
- pantalla de fondo para conciertos

### Mi opinion

Esto es casi obligatorio para una version Conciertos o Streaming.

ByFlow + OBS = producto mucho mas premium.

---

## Arquitectura que yo construiria

## Capa 1 - ByFlow UI

Vive en web:

- karaoke
- teleprompter
- gemelo
- LRC Studio
- dashboard DJ
- cue stack
- escenas
- mapeo MIDI
- monitoreo

## Capa 2 - ByFlow Control Bridge

Aplicacion local de escritorio o servicio local:

- Node.js + WebSocket local
- o Electron / Tauri si quieres app instalable

Responsabilidades:

- detectar dispositivos
- exponer lista de puertos
- traducir MIDI / HID / OSC / serial
- hablar con QLC+, OLA, OBS y mixers
- guardar perfiles hardware
- manejar reconexion
- ejecutar macros

## Capa 3 - Engines externos

- QLC+ / OLA para luces
- OBS para video / stream
- motores DJ externos o propios
- mixers digitales via OSC / MIDI / vendor adapters

---

## Modelo de modulos que agregaria a ByFlow

Si mañana seguimos construyendo esto, yo abriria algo asi:

- `public/js/modules/midi.js`
- `public/js/modules/midi-learn.js`
- `public/js/modules/show-scenes.js`
- `public/js/modules/cue-stack.js`
- `public/js/modules/lighting.js`
- `public/js/modules/obs.js`
- `public/js/modules/hardware-profiles.js`
- `public/js/modules/setlist.js`
- `public/js/modules/show-mode.js`

Y del lado bridge:

- `bridge/device-manager`
- `bridge/midi-adapter`
- `bridge/hid-adapter`
- `bridge/osc-adapter`
- `bridge/lighting-adapter`
- `bridge/obs-adapter`
- `bridge/mixer-adapter`
- `bridge/macros`

---

## MVP realista por fases

## Fase A - MIDI MVP

Objetivo:

- controlar ByFlow con controladores MIDI simples

Incluye:

- Web MIDI
- device picker
- MIDI Learn
- mapear play/pause/next/reset
- mapear velocidad de teleprompter
- mapear pads del soundboard
- guardar perfiles por controlador

### Resultado

Ya puedes usar pads/faders/knobs con ByFlow sin meterte aun a luces ni mixers.

## Fase B - Show Scenes

Objetivo:

- tener escenas operativas

Incluye:

- `Scene`: estado del show
- `Cue`: accion disparable
- `Cue Stack`: lista ordenada

Ejemplos:

- `Entrada cantante`
- `Coro grande`
- `Blackout`
- `Applause`
- `Intermedio`
- `Final`

## Fase C - Luces via QLC+

Objetivo:

- controlar luces sin reinventar consola DMX

Incluye:

- bridge OSC con QLC+
- escenas de luces disparadas por cue
- modo beat-reactive
- modo karaoke
- modo concierto
- blackout / panic

## Fase D - OBS + video

Objetivo:

- version streaming / venue premium

Incluye:

- cambio de escenas OBS
- overlays por cantante
- lower third automatico
- branding por venue
- recording / stream hooks

## Fase E - Version Conciertos

Objetivo:

- setlist y show running order

Incluye:

- setlists
- escenas por cancion
- cue stack por show
- salidas para stage display
- modo artista
- modo FOH
- modo director musical

---

## Version Conciertos: que le añadiria

Si yo diseñara ByFlow Concerts, le metería esto:

### 1. Setlist engine

- orden de canciones
- duracion estimada
- tonalidad
- BPM
- notas de show
- invitados
- visuales por track

### 2. Cue Stack serio

- pre-roll
- intro video
- blackout
- GO
- humo
- cambio de escena
- letra on/off
- click on/off
- interludio

### 3. Stage Display

- letra grande
- cue siguiente
- tempo
- count-in
- notas de direccion musical
- talkback cues

### 4. Roles por operador

- DJ
- Karaoke Host
- FOH
- Iluminacion
- Stage Manager
- Artista
- Tecnico de monitores

### 5. Safety layer

- blackout master
- freeze cues
- fallback scene
- kill all strobes
- panic button

### 6. Rehearsal mode

- avanzar cues manualmente
- simular playback
- revisar letra
- ensayar escenas

### 7. Audit log de show

- quien disparo que
- a que hora
- que escena estaba activa
- ultimo dispositivo conectado

---

## Que NO haria

- no intentaria controlar todos los fixtures DMX directamente desde la SPA como primera fase
- no intentaria soportar todos los mixers por protocolo propietario desde el dia 1
- no intentaria reemplazar Mixxx / VirtualDJ / Rekordbox / OBS / QLC+ en una sola pasada
- no pondria la estabilidad del show en APIs web experimentales sin bridge local

---

## Mi recomendacion final

Si quieres "lo mejor de lo mejor", el producto no debe ser solo una app de karaoke con extras.

Debe convertirse en:

**ByFlow Live OS**

con 4 verticales:

1. **Karaoke**
2. **DJ**
3. **Show Control**
4. **Concerts**

Y el orden correcto para construirlo es:

1. MIDI control
2. escenas y cue stack
3. bridge local
4. luces con QLC+ / OLA
5. OBS
6. version conciertos con setlists y operadores

---

## Opinion brutalmente honesta

El diferenciador mas cabron de ByFlow no es "otro player".

Es esto:

- karaoke
- teleprompter
- cola
- segunda pantalla
- control por sala
- LRC Studio
- DJ dashboard
- y luego encima show control

Eso casi nadie lo junta bien.

Si lo haces modular y con bridge local, tienes algo que puede vivir en:

- bares karaoke
- hosts moviles
- eventos privados
- venues medianos
- showcases
- conciertos pequenos / medianos

---

## Siguientes pasos que yo haria

1. Crear un documento de arquitectura formal de `ByFlow Control Bridge`
2. Diseñar `Scene` y `Cue Stack` como modelos de dominio
3. Implementar `MIDI MVP` en frontend
4. Elegir si el primer motor de luces sera `QLC+` o `OLA`
5. Definir el `modo conciertos`

---

## Fuentes oficiales consultadas

- MDN Web MIDI API:
  - https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
  - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess
- MDN WebHID API:
  - https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API
- MDN Web Serial API:
  - https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
- MIDI Association:
  - https://midi.org/midi-2-0
  - https://midi.org/midi-ci-specification
- Art-Net oficial:
  - https://art-net.org.uk/
  - https://art-net.org.uk/art-net-specification/
  - https://art-net.org.uk/background/
- QLC+ docs:
  - https://docs.qlcplus.org/v4/plugins/art-net
  - https://docs.qlcplus.org/v4/plugins/e1-31-sacn
  - https://docs.qlcplus.org/v4/plugins/osc
  - https://docs.qlcplus.org/v4/plugins/os2l
  - https://docs.qlcplus.org/v4/advanced/web-interface
  - https://docs.qlcplus.org/v4/advanced/kiosk-mode
- OLA:
  - https://docs.openlighting.org/ola/doc/latest/index.html
  - https://www.openlighting.org/ola/
- OS2L:
  - https://www.os2l.org/
- Ableton Link:
  - https://ableton.github.io/link/
  - https://www.ableton.com/link/
- OBS WebSocket:
  - https://github.com/obsproject/obs-websocket

