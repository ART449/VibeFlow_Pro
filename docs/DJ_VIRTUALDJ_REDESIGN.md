# Rediseño DJ Mixer → Estilo VirtualDJ

## Concepto
Transformar el DJ Mixer actual en una vista unificada estilo VirtualDJ:
- Arriba: Decks A y B con vinilos, waveforms, controles
- Centro: Crossfader + mixer central
- Abajo: Browser de musica con playlists, carpetas, búsqueda (NO popup emergente)

## Layout VirtualDJ Reference
```
┌─────────────────────────────────────────────────────────────────┐
│ ByFlow DJ                                    [AutoDJ] [MIDI] ⚙ │
├────────────────────────┬────────────────────────────────────────┤
│        DECK A          │           DECK B                      │
│  ┌─────────────────┐   │   ┌─────────────────┐                │
│  │ ▓▓▓▓░░░░░ wave  │   │   │ ░░▓▓▓▓▓░░ wave  │                │
│  └─────────────────┘   │   └─────────────────┘                │
│  ┌────┐                │                ┌────┐                │
│  │vinyl│  BPM:128      │    BPM:126     │vinyl│                │
│  │ 🎵 │  1:23/3:45     │    0:45/4:12   │ 🎵 │                │
│  └────┘                │                └────┘                │
│                        │                                       │
│ [▶][CUE][♫1][♫2]      │      [▶][CUE][♫1][♫2][SYNC]         │
│ LOW [━━●━━] K          │      LOW [━━●━━] K                   │
│ MID [━━●━━] K          │      MID [━━●━━] K                   │
│ HI  [━━●━━] K          │      HI  [━━●━━] K                   │
│ VOL [━━━━●━]           │      VOL [━━━━●━]                    │
├────────────────────────┴────────────────────────────────────────┤
│      A ━━━━━━━━━━━●━━━━━━━━━━━ B    CROSSFADER                │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 Buscar...                          [Tiësto][Cox][Snake][🐝] │
├──────────┬──────────────────────────────────────────────────────┤
│ CARPETAS │  TRACKS                                             │
│          │                                                      │
│ 📁 Local │  #  Titulo           Artista      BPM   Dur  Genre  │
│ 📁 YouTube│  1  Calles de Asf.  ByFlow Beats  90   2:31  HipHop│
│ 📁 Suno  │  2  808 Terremoto   ByFlow Beats  140  2:15  Trap  │
│ 📁 Favoritos│3  Perreo Galact. ByFlow Beats  95   3:02  Regg  │
│ 📁 History│  4  Sabanas de Seda ByFlow Beats  72   2:48  R&B   │
│ 🎵 Queue │  5  Cafe con Lluvia ByFlow Beats  75   2:33  LoFi  │
│ 📻 Radio │                                                      │
│          │  [Load A ←]                        [→ Load B]        │
└──────────┴──────────────────────────────────────────────────────┘
```

## Mas estilos de DJ (presets AutoDJ)

### Nuevos estilos a agregar:
- **Marshmello** — Future bass, transiciones melodicas, drops suaves
- **Skrillex** — Dubstep/bass, drops pesados, transiciones agresivas
- **Calvin Harris** — Pop/dance, vocal chops, builds largos
- **Deadmau5** — Progressive house, transiciones de 64 beats, minimal
- **Bad Bunny** — Reggaeton/Latin trap, flow urbano, cuts rapidos
- **J Balvin** — Reggaeton pop, transiciones suaves, radio-friendly
- **Peso Pluma** — Corridos tumbados, fusion norteño-trap
- **Feid** — Reggaeton romantico, R&B latino, vibes nocturnas

### Categorias de estilos:
1. **EDM** — Tiësto, Marshmello, Calvin Harris, Deadmau5
2. **Bass/Dubstep** — Skrillex, DJ Snake
3. **Techno** — Carl Cox
4. **Latin** — Bad Bunny, J Balvin, Peso Pluma, Feid
5. **Hip-Hop** — ArT-AtR
6. **Chill** — Chill Vibes

## Browser integrado (NO popup)

### Fuentes de musica:
1. **Local** — archivos del dispositivo
2. **YouTube** — busqueda de beats/canciones
3. **Suno** — beats generados por IA
4. **Favoritos** — tracks guardados por el usuario
5. **History** — ultimos tracks reproducidos
6. **Queue** — cola de reproduccion
7. **Radio** — estaciones de genero (futuro)

### Funcionalidades del browser:
- Busqueda en tiempo real (filtra mientras escribes)
- Drag & drop a Deck A o B
- Doble click = cargar en deck activo
- Sort por: titulo, artista, BPM, duracion, genero
- Preview (pre-escucha con audifono) — futuro con dual output
- Metadata: BPM, key, genre, duration auto-detectados

## Botones y controles extra:
- **FX** — efectos por deck (flanger, phaser, echo, reverb, filter)
- **Loop** — 1/2/4/8/16 beats loop
- **Pitch** — +/- tempo fine tune
- **Filter** — high-pass / low-pass sweep
- **Sample pad** — 8 pads de samples (air horn, scratch, etc.)
- **Record** — grabar el mix como archivo

## Archivos a crear/modificar:
- public/js/modules/dj-mixer.js — refactor completo de UI
- public/js/modules/dj-browser.js — nuevo modulo de browser
- public/js/modules/autodj.js — agregar 8 estilos nuevos
- public/index.html — CSS del layout VirtualDJ

## Para proxima sesion
