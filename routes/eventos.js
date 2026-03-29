// ── Noches de Talento (Eventos) — routes/eventos.js ─────────────────────────
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EVENTOS_FILE = path.join(__dirname, '..', 'data', 'eventos.json');

function readEventos() {
  try { return fs.existsSync(EVENTOS_FILE) ? JSON.parse(fs.readFileSync(EVENTOS_FILE, 'utf8')) : []; }
  catch { return []; }
}
function writeEventos(data) {
  try { fs.writeFileSync(EVENTOS_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[Eventos] Write error:', e.message); }
}

// Vote tracker (1 per IP per evento)
const _eventoVoteTracker = new Map();

function registerRoutes(app, _state, helpers) {
  const { io } = helpers;

  // POST — Crear evento
  app.post('/api/eventos', (req, res) => {
    const { nombre, fecha, hora, tema, maxParticipantes, bar } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ error: 'nombre y fecha son requeridos' });

    const eventos = readEventos();
    const evento = {
      id: 'ev_' + crypto.randomBytes(6).toString('hex'),
      nombre: String(nombre).trim().slice(0, 100),
      fecha: String(fecha).slice(0, 10),
      hora: String(hora || '20:00').slice(0, 5),
      tema: String(tema || '').trim().slice(0, 100),
      maxParticipantes: Math.min(50, Math.max(2, parseInt(maxParticipantes) || 10)),
      bar: String(bar || '').trim().slice(0, 100),
      inscritos: [],
      estado: 'abierto',
      votos: {},
      createdAt: new Date().toISOString()
    };
    eventos.push(evento);
    writeEventos(eventos);
    res.status(201).json(evento);
  });

  // GET — Listar eventos
  app.get('/api/eventos', (req, res) => {
    const eventos = readEventos();
    const ahora = new Date().toISOString().slice(0, 10);
    const activos = eventos.filter(e => e.fecha >= ahora || e.estado === 'en_vivo');
    res.json(activos.sort((a, b) => a.fecha.localeCompare(b.fecha)));
  });

  // GET — Evento por ID
  app.get('/api/eventos/:id', (req, res) => {
    const eventos = readEventos();
    const ev = eventos.find(e => e.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(ev);
  });

  // POST — Inscribir escritor al evento
  app.post('/api/eventos/:id/inscribir', (req, res) => {
    const { alias, letraId, titulo, beat } = req.body;
    if (!alias || !letraId) return res.status(400).json({ error: 'alias y letraId son requeridos' });

    const eventos = readEventos();
    const idx = eventos.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Evento no encontrado' });
    if (eventos[idx].estado !== 'abierto') return res.status(400).json({ error: 'Inscripciones cerradas' });
    if (eventos[idx].inscritos.length >= eventos[idx].maxParticipantes) return res.status(400).json({ error: 'Evento lleno' });
    if (eventos[idx].inscritos.some(i => i.alias.toLowerCase() === alias.toLowerCase())) return res.status(409).json({ error: 'Ya estas inscrito' });

    eventos[idx] = { ...eventos[idx], inscritos: [...eventos[idx].inscritos, {
      alias: String(alias).trim().slice(0, 30),
      letraId: String(letraId).slice(0, 20),
      titulo: String(titulo || '').slice(0, 200),
      beat: beat ? { videoId: String(beat.videoId || '').slice(0, 20), titulo: String(beat.titulo || '').slice(0, 200), canal: String(beat.canal || '').slice(0, 100) } : null,
      inscritoAt: new Date().toISOString()
    }]};
    writeEventos(eventos);
    io.emit('evento_update', { eventoId: req.params.id, inscritos: eventos[idx].inscritos.length });
    res.json(eventos[idx]);
  });

  // PUT — Cambiar estado del evento (abierto/en_vivo/cerrado)
  app.put('/api/eventos/:id/estado', (req, res) => {
    const { estado } = req.body;
    if (!['abierto', 'en_vivo', 'cerrado'].includes(estado)) return res.status(400).json({ error: 'Estado invalido' });

    const eventos = readEventos();
    const idx = eventos.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Evento no encontrado' });

    eventos[idx] = { ...eventos[idx], estado };
    writeEventos(eventos);
    io.emit('evento_estado', { eventoId: req.params.id, estado });
    res.json(eventos[idx]);
  });

  // POST — Votar en evento en vivo (1 voto por IP por evento)
  app.post('/api/eventos/:id/votar', (req, res) => {
    const { alias } = req.body;
    if (!alias) return res.status(400).json({ error: 'alias del participante es requerido' });

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = req.params.id + ':' + ip;
    if (_eventoVoteTracker.has(key)) return res.status(429).json({ error: 'Ya votaste en este evento' });

    const eventos = readEventos();
    const idx = eventos.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Evento no encontrado' });
    if (eventos[idx].estado !== 'en_vivo') return res.status(400).json({ error: 'Votacion solo durante evento en vivo' });
    if (!eventos[idx].inscritos.some(i => i.alias === alias)) return res.status(400).json({ error: 'Participante no encontrado' });

    const votos = { ...eventos[idx].votos };
    votos[alias] = (votos[alias] || 0) + 1;
    eventos[idx] = { ...eventos[idx], votos };
    writeEventos(eventos);
    _eventoVoteTracker.set(key, true);

    io.emit('evento_voto', { eventoId: req.params.id, votos });
    res.json({ votos });
  });

  // GET — Resultados del evento
  app.get('/api/eventos/:id/resultados', (req, res) => {
    const eventos = readEventos();
    const ev = eventos.find(e => e.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });

    const ranking = ev.inscritos.map(i => ({
      alias: i.alias, titulo: i.titulo, beat: i.beat,
      votos: ev.votos[i.alias] || 0
    })).sort((a, b) => b.votos - a.votos);

    res.json({ evento: ev.nombre, estado: ev.estado, ranking });
  });
}

module.exports = { registerRoutes };
