// ── Letras-Beat (Estudio de Beats) — routes/letras-beat.js ──────────────────
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LETRAS_BEAT_FILE = path.join(__dirname, '..', 'data', 'letras-beat.json');

function readLetrasBeat() {
  try { return fs.existsSync(LETRAS_BEAT_FILE) ? JSON.parse(fs.readFileSync(LETRAS_BEAT_FILE, 'utf8')) : []; }
  catch { return []; }
}
function writeLetrasBeat(data) {
  try { fs.writeFileSync(LETRAS_BEAT_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[LetrasBeat] Write error:', e.message); }
}

// Vote tracker (1 per IP per letra) — cleared every 6h
const _voteTracker = new Map();
setInterval(() => { _voteTracker.clear(); }, 6 * 60 * 60 * 1000);

function registerRoutes(app, _state, helpers) {
  const { addActividad, io } = helpers;

  // POST — Crear letra con beat
  app.post('/api/letras-beat', (req, res) => {
    const { titulo, letra, usuario, beat, fecha } = req.body;
    if (!titulo || !letra) return res.status(400).json({ error: 'titulo y letra son requeridos' });
    if (titulo.length > 200) return res.status(400).json({ error: 'titulo demasiado largo' });
    if (letra.length > 10000) return res.status(400).json({ error: 'letra demasiado larga' });

    const letras = readLetrasBeat();
    const entry = {
      id: 'lb_' + crypto.randomBytes(6).toString('hex'),
      usuario: String(usuario || 'Anonimo').trim().slice(0, 50),
      titulo: titulo.trim().slice(0, 200),
      letra: letra.trim().slice(0, 10000),
      beat: beat ? {
        videoId: String(beat.videoId || '').slice(0, 20),
        titulo: String(beat.titulo || '').slice(0, 300),
        canal: String(beat.canal || '').slice(0, 100),
        canalUrl: String(beat.canalUrl || '').slice(0, 500)
      } : null,
      publicado: false,
      votos: 0,
      fecha: fecha || new Date().toISOString()
    };
    letras.push(entry);
    writeLetrasBeat(letras);
    res.status(201).json(entry);
  });

  // GET — Listar letras (con paginacion)
  app.get('/api/letras-beat', (req, res) => {
    const letras = readLetrasBeat();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const start = (page - 1) * limit;
    const sorted = [...letras].reverse();
    res.json({
      total: letras.length,
      page,
      limit,
      items: sorted.slice(start, start + limit)
    });
  });

  // GET — Ranking (publicas, por votos)
  app.get('/api/letras-beat/ranking', (req, res) => {
    const letras = readLetrasBeat().filter(l => l.publicado);
    const sorted = [...letras].sort((a, b) => (b.votos || 0) - (a.votos || 0));
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    res.json(sorted.slice(0, limit));
  });

  // PUT — Toggle publicar
  app.put('/api/letras-beat/:id/publicar', (req, res) => {
    const letras = readLetrasBeat();
    const idx = letras.findIndex(l => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Letra no encontrada' });
    const newState = !letras[idx].publicado;
    letras[idx] = { ...letras[idx], publicado: newState };
    writeLetrasBeat(letras);
    if (newState) {
      addActividad('letra_publicada', { letraId: letras[idx].id, usuario: letras[idx].usuario, titulo: letras[idx].titulo });
      io.emit('actividad', { tipo: 'letra_publicada', usuario: letras[idx].usuario, titulo: letras[idx].titulo });
    }
    res.json(letras[idx]);
  });

  // POST — Votar (1 por IP por letra)
  app.post('/api/letras-beat/:id/voto', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const voted = _voteTracker.get(ip) || new Set();
    if (voted.has(req.params.id)) return res.status(429).json({ error: 'Ya votaste por esta letra' });

    const letras = readLetrasBeat();
    const idx = letras.findIndex(l => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Letra no encontrada' });
    if (!letras[idx].publicado) return res.status(400).json({ error: 'Solo se puede votar letras publicadas' });

    letras[idx] = { ...letras[idx], votos: (letras[idx].votos || 0) + 1 };
    writeLetrasBeat(letras);
    voted.add(req.params.id);
    _voteTracker.set(ip, voted);
    addActividad('letra_votada', { letraId: letras[idx].id, usuario: letras[idx].usuario, titulo: letras[idx].titulo, votos: letras[idx].votos });
    io.emit('actividad', { tipo: 'letra_votada', usuario: letras[idx].usuario, titulo: letras[idx].titulo, votos: letras[idx].votos });
    res.json({ votos: letras[idx].votos });
  });
}

// Export readLetrasBeat for use by perfiles route
module.exports = { registerRoutes, readLetrasBeat };
