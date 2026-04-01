// ── Canciones (CRUD) — routes/canciones.js ─────────────────────────────────

function registerRoutes(app, state, helpers) {
  const { debouncedSave, clampStr, generateId, requireRoomAuth } = helpers;

  function sanitizeDisplayStyle(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  app.get('/api/canciones', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.json(state.canciones);
    const filtered = state.canciones.filter(s =>
      (s.titulo || '').toLowerCase().includes(q) ||
      (s.artista || '').toLowerCase().includes(q)
    );
    res.json(filtered);
  });

  app.get('/api/canciones/:id', (req, res) => {
    const song = state.canciones.find(s => s.id === req.params.id);
    if (!song) return res.status(404).json({ error: 'Cancion no encontrada' });
    res.json(song);
  });

  app.post('/api/canciones', (req, res) => {
    const titulo  = clampStr(req.body.titulo, 200).trim();
    const letra   = clampStr(req.body.letra, 10000).trim();
    const artista = clampStr(req.body.artista, 100).trim();
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const song = {
      id: generateId(),
      titulo,
      letra,
      artista,
      displayStyle: sanitizeDisplayStyle(req.body.displayStyle),
      fecha: Date.now()
    };
    state.canciones.push(song);
    debouncedSave('canciones.json', state.canciones);
    res.json(song);
  });

  app.patch('/api/canciones/:id', requireRoomAuth, (req, res) => {
    const song = state.canciones.find(s => s.id === req.params.id);
    if (!song) return res.status(404).json({ error: 'Cancion no encontrada' });
    if (req.body.titulo !== undefined) song.titulo = clampStr(req.body.titulo, 200).trim();
    if (req.body.letra !== undefined) song.letra = clampStr(req.body.letra, 10000).trim();
    if (req.body.artista !== undefined) song.artista = clampStr(req.body.artista, 100).trim();
    if (req.body.displayStyle !== undefined) song.displayStyle = sanitizeDisplayStyle(req.body.displayStyle);
    debouncedSave('canciones.json', state.canciones);
    res.json(song);
  });

  app.delete('/api/canciones/:id', requireRoomAuth, (req, res) => {
    const idx = state.canciones.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Cancion no encontrada' });
    state.canciones.splice(idx, 1);
    debouncedSave('canciones.json', state.canciones);
    res.json({ ok: true });
  });
}

module.exports = { registerRoutes };
