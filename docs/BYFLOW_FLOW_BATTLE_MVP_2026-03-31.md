# BYFLOW FLOW BATTLE MVP

Fecha: 2026-03-31
Estado: propuesta lista para implementacion
Owner sugerido: ByFlow core app

## 1. Resumen

`Flow Battle` es una capa de juego en vivo montada sobre el stack actual de ByFlow. No es un juego aparte. Es una dinamica de venue que convierte cada turno de karaoke en una mini batalla social entre mesas.

La idea central:

- un cantante representa a su mesa o crew
- el publico participa desde su celular por QR
- las reacciones alimentan un `hype meter`
- el DJ dispara bonus cortos
- se actualiza un leaderboard por mesa
- el cierre de ronda entrega una recompensa real del venue

Esto encaja con la vision actual de ByFlow: karaoke + mesas + promos + eventos + control en vivo.

## 2. Por que este MVP si hace sentido

- reutiliza `cola`, `mesas`, `Socket.IO`, `QR` y el modo `Bares`
- fortalece el diferenciador de eatertainment sin exigir una app nueva
- es monetizable como feature `PRO Venue`
- genera engagement visible en pantalla y en celulares
- puede lanzarse por fases sin romper el flujo actual de karaoke

## 3. Alcance v1

### Dentro del MVP

- una sesion activa de `Flow Battle` por venue
- cada ronda se amarra al cantante actual de la cola
- puntuacion por mesa
- reacciones en vivo desde celular
- `bonus` disparado por DJ
- leaderboard visible en pantalla principal
- recompensa simple al final de la ronda
- persistencia JSON basica
- rate limit y anti-spam por IP y dispositivo

### Fuera del MVP

- avatares complejos
- economia persistente multi-noche
- matchmaking avanzado
- 3D
- minijuegos canvas-first
- integracion con pagos
- ranking global entre bares

## 4. Fantasia, verbos y loop

### Fantasia

Cada cancion es un duelo de energia. El cantante sube a representar a su mesa. El publico empuja la ronda en tiempo real y el venue convierte ese momento en show.

### Verbos

- cantar
- reaccionar
- empujar combo
- activar bonus
- ganar recompensa

### Core loop de una ronda

1. DJ activa `Flow Battle` desde `Bares`.
2. Cuando corre `cola_next`, el cantante actual se vuelve el foco de la ronda.
3. La mesa del cantante queda marcada como `mesa_atacante`.
4. El publico escanea QR y entra a la vista movil de la batalla.
5. Durante 60-120 segundos, el publico manda reacciones.
6. El servidor suma puntos al `hype meter` y al leaderboard.
7. El DJ puede disparar un bonus corto:
   - `doble_puntos`
   - `coro_bonus`
   - `ovacion_final`
8. La ronda cierra automaticamente o por accion del DJ.
9. Se calcula el resultado:
   - puntos de la mesa activa
   - racha
   - mesa lider
   - recompensa sugerida
10. El sistema muestra cierre visual y prepara la siguiente ronda.

## 5. Ruta tecnica recomendada

Para v1 no hace falta Phaser ni 3D.

- simulacion y estado: servidor Node + `Socket.IO`
- UI operador: DOM dentro de `public/index.html`
- UI venue display: extender `public/show-control.html` o crear una vista hermana
- UI publico movil: nueva vista web ligera
- persistencia: `data/flow_battles.json`

Decision:

- `DOM-first` para HUD y controles
- micro-animaciones CSS
- canvas opcional solo si luego queremos un medidor mas espectacular

## 6. Superficies del producto

### A. Operador / DJ

Ubicacion: `public/index.html`, dentro del panel `Bares`

Controles MVP:

- activar o pausar `Flow Battle`
- elegir duracion de ronda
- abrir o cerrar reacciones
- disparar bonus
- resetear leaderboard
- ver mesa lider y racha actual

### B. Venue display

Ubicacion sugerida: extender `public/show-control.html`

Elementos visibles:

- nombre del cantante actual
- mesa actual
- `hype meter`
- top 3 mesas
- bonus activo
- cierre de ronda con recompensa

### C. Publico movil

Archivo sugerido: `public/flow-battle.html`

Acciones del usuario:

- unirse por QR
- confirmar mesa
- enviar reaccion
- ver cooldown
- ver puntos de su mesa
- ver leaderboard resumido

## 7. Integracion con el stack actual

### Eventos ya existentes a reaprovechar

- `cola_update`
- `singer_changed`
- `room_joined`
- `room_count`
- `evento_update`
- `evento_estado`
- `evento_voto`

### Acoplamiento recomendado

- `Flow Battle` debe escuchar `singer_changed`
- si el cantante tiene `mesa`, esa mesa se usa como atacante
- si no tiene `mesa`, la ronda se puede correr en modo `sin mesa`
- el `roomId` actual del venue sigue siendo el contenedor de broadcast
- no mezclar la verdad del estado de juego con el render del cliente

## 8. Modelo de datos propuesto

Archivo: `data/flow_battles.json`

```json
[
  {
    "id": "fb_abc123",
    "roomId": "ABCD1234",
    "estado": "en_vivo",
    "config": {
      "duracionRondaMs": 90000,
      "cooldownReaccionMs": 1200,
      "maxReaccionesPorMinuto": 12
    },
    "leaderboard": [
      { "mesa": 4, "puntos": 180, "reacciones": 22, "racha": 2 },
      { "mesa": 7, "puntos": 140, "reacciones": 16, "racha": 1 }
    ],
    "rondaActual": {
      "id": "rnd_001",
      "cantanteId": "cola_123",
      "cantante": "Andrea",
      "cancion": "La Bamba",
      "mesa": 4,
      "startedAt": "2026-03-31T10:30:00.000Z",
      "endsAt": "2026-03-31T10:31:30.000Z",
      "bonusActivo": "doble_puntos",
      "bonusEndsAt": "2026-03-31T10:30:35.000Z",
      "hype": 72
    },
    "ultimaRecompensa": {
      "mesa": 4,
      "tipo": "shot_gratis",
      "label": "Shot para mesa 4"
    },
    "createdAt": "2026-03-31T10:00:00.000Z",
    "updatedAt": "2026-03-31T10:30:10.000Z"
  }
]
```

## 9. Tabla de puntuacion v1

Recomendacion simple para arrancar:

- reaccion normal: `+5`
- reaccion durante bonus: `+10`
- reaccion de la mesa atacante: `+7`
- combo de 3 reacciones validas dentro de ventana: `+15`
- cierre con hype > 80: `bonus +25`

Reacciones iniciales:

- `aplauso`
- `fuego`
- `coro`
- `otra`

No meter demasiadas reacciones en v1. Cuatro bastan.

## 10. Eventos Socket.IO propuestos

Convencion recomendada: seguir el estilo actual de nombres simples con prefijo del modulo.

### Cliente -> servidor

- `flow_battle_join`
- `flow_battle_react`
- `flow_battle_bonus`
- `flow_battle_state_request`
- `flow_battle_round_start`
- `flow_battle_round_end`

### Servidor -> clientes

- `flow_battle_update`
- `flow_battle_estado`
- `flow_battle_reaction`
- `flow_battle_round_summary`
- `flow_battle_bonus_active`
- `flow_battle_error`

### Payload sugerido para reaccion

```json
{
  "battleId": "fb_abc123",
  "mesa": 4,
  "reaction": "fuego",
  "deviceId": "dev_x1",
  "roomId": "ABCD1234"
}
```

### Payload sugerido para update

```json
{
  "battleId": "fb_abc123",
  "estado": "en_vivo",
  "hype": 72,
  "mesaActiva": 4,
  "leaderboard": [
    { "mesa": 4, "puntos": 180, "racha": 2 },
    { "mesa": 7, "puntos": 140, "racha": 1 }
  ],
  "bonusActivo": "doble_puntos",
  "cantante": "Andrea",
  "cancion": "La Bamba"
}
```

## 11. Endpoints REST propuestos

Nuevo archivo sugerido: `routes/flow-battle.js`

- `GET /api/flow-battle/active`
- `POST /api/flow-battle/session`
- `PUT /api/flow-battle/session/:id/estado`
- `POST /api/flow-battle/session/:id/round/start`
- `POST /api/flow-battle/session/:id/round/end`
- `POST /api/flow-battle/session/:id/react`
- `POST /api/flow-battle/session/:id/bonus`
- `POST /api/flow-battle/session/:id/reset`
- `GET /api/flow-battle/session/:id/resultados`

Uso recomendado:

- `REST` para acciones operativas y persistencia
- `Socket.IO` para updates en tiempo real

## 12. Reglas de anti-abuso

- cooldown por dispositivo: `1200 ms`
- maximo por dispositivo por minuto: `12`
- respaldo por IP si no existe `deviceId`
- bloquear spam del mismo tipo repetido en rafaga
- si una mesa no esta marcada en el venue, no puede sumar a leaderboard
- sanitizar `mesa`, `roomId` y `reaction`

## 13. Recompensas v1

Mantenerlo operativo y facil de usar:

- `shot_gratis`
- `descuento_10`
- `siguiente_turno_boost`
- `mencion_pantalla`

El MVP no decide inventario ni pagos. Solo emite la recompensa sugerida en pantalla para que el staff la aplique.

## 14. UX recomendada

### Operador

- controles compactos
- no tapar teleprompter ni cola
- un bloque dentro de `Bares`, no una pantalla completa nueva

### Display

- poco texto
- tipografia grande
- leaderboard siempre visible pero compacto
- `bonus` al centro solo cuando este activo

### Movil

- 4 botones grandes
- feedback instantaneo
- cooldown visible
- color por reaccion
- no pedir login en v1

## 15. Estados del sistema

- `idle`
- `armado`
- `en_vivo`
- `bonus_activo`
- `cerrando`
- `finalizado`

Transiciones clave:

- `idle -> armado`: DJ activa modulo
- `armado -> en_vivo`: inicia ronda con cantante actual
- `en_vivo -> bonus_activo`: DJ dispara bonus
- `bonus_activo -> en_vivo`: bonus expira
- `en_vivo -> cerrando`: termina tiempo o DJ cierra
- `cerrando -> armado`: muestra resumen y espera siguiente cantante

## 16. Archivos a tocar en implementacion

- `server.js`
- `routes/flow-battle.js`
- `public/index.html`
- `public/show-control.html`
- `public/flow-battle.html`
- `data/flow_battles.json`

## 17. Orden de implementacion sugerido

### Slice 1

- crear `routes/flow-battle.js`
- cargar y guardar `flow_battles.json`
- exponer endpoints REST
- registrar eventos `Socket.IO`

### Slice 2

- agregar panel `Flow Battle` en `Bares`
- botones de iniciar ronda, bonus y reset
- render basico de leaderboard

### Slice 3

- crear `public/flow-battle.html`
- join por QR con `mesa` y `roomId`
- botones de reaccion con cooldown

### Slice 4

- extender `public/show-control.html`
- mostrar `hype meter`, top mesas y cierre de ronda

### Slice 5

- enganchar automaticamente a `singer_changed`
- resumen de ronda
- recompensa sugerida
- metricas simples en JSON

## 18. Criterios de aceptacion MVP

- el DJ puede activar una sesion y arrancar una ronda
- el publico puede reaccionar desde celular sin login
- las reacciones actualizan el leaderboard en tiempo real
- el display del venue muestra hype, mesa activa y top 3
- el sistema aguanta minimo 4-6 celulares simultaneos sin romper el flujo
- al terminar una ronda se emite un resumen claro

## 19. Mi recomendacion final

No arrancar con una experiencia de juego separada. El golpe correcto para ByFlow es una capa social operativa, visible y vendible.

Si vamos a construirlo, el primer corte bueno no es "bonito"; es:

- una ronda
- cuatro reacciones
- un leaderboard
- un bonus
- un cierre con recompensa

Con eso ya tienes algo que se puede demoear frente a un bar y que se siente diferente a cualquier karaoke normal.
