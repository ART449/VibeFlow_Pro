// ── Cola de Cantantes + Mesas — routes/cola.js ─────────────────────────────
// All /api/cola and /api/mesas endpoints

function registerRoutes(app, state, helpers) {
  const { debouncedSave, saveJSON, clampStr, generateId, validarTextoPublico,
          requireRoomAuth, trackStat, io } = helpers;

  // ── Cola de cantantes ──────────────────────────────────────────────────────
  app.get('/api/cola', (req, res) => res.json(state.cola));

  app.post('/api/cola', (req, res) => {
    const vNombre = validarTextoPublico(req.body.cantante, 'Nombre', 100);
    if (!vNombre.ok) return res.status(400).json({ error: vNombre.error });
    const cancion  = clampStr(req.body.cancion, 200).trim();
    const mesa     = req.body.mesa || null;
    const entry = {
      id: generateId(), cantante: vNombre.value, cancion,
      mesa, estado: 'esperando', timestamp: Date.now()
    };
    state.cola.push(entry);
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    trackStat('cola_add', { cantante: vNombre.value, cancion, mesa });
    res.json(entry);
  });

  app.delete('/api/cola/:id', requireRoomAuth, (req, res) => {
    state.cola = state.cola.filter(c => c.id !== req.params.id);
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    res.json({ ok: true });
  });

  app.patch('/api/cola/:id', (req, res) => {
    const item = state.cola.find(c => c.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    if (req.body.estado) item.estado = clampStr(req.body.estado, 20);
    if (req.body.cantante) item.cantante = clampStr(req.body.cantante, 100);
    if (req.body.cancion !== undefined) item.cancion = clampStr(req.body.cancion, 200);
    if (req.body.mesa !== undefined) item.mesa = req.body.mesa;
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    res.json(item);
  });

  // Reordenar cola
  app.post('/api/cola/reorder', (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order debe ser un array de IDs' });
    const map = new Map(state.cola.map(c => [c.id, c]));
    const reordered = order.filter(id => map.has(id)).map(id => map.get(id));
    const orderSet = new Set(order);
    state.cola.forEach(c => { if (!orderSet.has(c.id)) reordered.push(c); });
    state.cola = reordered;
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    res.json({ ok: true });
  });

  // Limpiar terminados de la cola
  app.post('/api/cola/clean', requireRoomAuth, (req, res) => {
    state.cola = state.cola.filter(c => c.estado !== 'terminado');
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    res.json({ ok: true });
  });

  // ── Mesas ──────────────────────────────────────────────────────────────────
  app.get('/api/mesas', (req, res) => res.json(state.mesas));

  app.patch('/api/mesas/:num', (req, res) => {
    const mesa = state.mesas.find(m => m.numero === parseInt(req.params.num));
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (req.body.estado) mesa.estado = clampStr(req.body.estado, 20);
    if (req.body.cantante !== undefined) mesa.cantante = req.body.cantante;
    saveJSON('mesas.json', state.mesas);
    io.emit('mesas_update', state.mesas);
    res.json(mesa);
  });
}

module.exports = { registerRoutes };
