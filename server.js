// ═══════════════════════════════════════════════════════════════════════════
// VIBEFLOW PRO v2.0 - Server (Node.js + Express + Socket.IO)
// Persistencia JSON + CRUD completo + Error handling
// ═══════════════════════════════════════════════════════════════════════════

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const { exec } = require('child_process');

// ── Utilidades ──────────────────────────────────────────────────────────────
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clampStr(s, max) {
  return typeof s === 'string' ? s.slice(0, max) : '';
}

// ── Persistencia JSON ────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(filename, defaultVal) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`[DATA] Error cargando ${filename}:`, e.message);
  }
  return defaultVal;
}

function saveJSON(filename, data) {
  const fp = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[DATA] Error guardando ${filename}:`, e.message);
  }
}

const _debounceTimers = {};
function debouncedSave(filename, data, ms = 1000) {
  if (_debounceTimers[filename]) clearTimeout(_debounceTimers[filename]);
  _debounceTimers[filename] = setTimeout(() => saveJSON(filename, data), ms);
}

// ── App Setup ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const app  = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado con persistencia ─────────────────────────────────────────────────
const DEFAULT_MESAS = Array.from({ length: 12 }, (_, i) => ({
  numero: i + 1, estado: 'libre', cantante: null
}));

const state = {
  cola:         loadJSON('cola.json', []),
  mesas:        loadJSON('mesas.json', DEFAULT_MESAS),
  canciones:    loadJSON('canciones.json', []),
  teleprompter: loadJSON('teleprompter.json', {
    lyrics: '', currentWord: -1, scrollSpeed: 1, isPlaying: false
  })
};

// ── API REST ────────────────────────────────────────────────────────────────

// QR para acceso remoto
app.get('/api/qr', async (req, res) => {
  const ip  = getLocalIp();
  const url = `http://${ip}:${PORT}`;
  try {
    const QRCode = require('qrcode');
    const qr = await QRCode.toDataURL(url, { width: 256, margin: 1 });
    res.json({ qr, url, ip });
  } catch {
    res.json({ qr: null, url, ip });
  }
});

// ── Cola de cantantes ────────────────────────────────────────────────────────
app.get('/api/cola', (req, res) => res.json(state.cola));

app.post('/api/cola', (req, res) => {
  const cantante = clampStr(req.body.cantante, 100).trim();
  const cancion  = clampStr(req.body.cancion, 200).trim();
  const mesa     = req.body.mesa || null;
  if (!cantante) return res.status(400).json({ error: 'Nombre requerido' });
  const entry = {
    id: generateId(), cantante, cancion,
    mesa, estado: 'esperando', timestamp: Date.now()
  };
  state.cola.push(entry);
  saveJSON('cola.json', state.cola);
  io.emit('cola_update', state.cola);
  res.json(entry);
});

app.delete('/api/cola/:id', (req, res) => {
  state.cola = state.cola.filter(c => c.id !== req.params.id);
  saveJSON('cola.json', state.cola);
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
  saveJSON('cola.json', state.cola);
  io.emit('cola_update', state.cola);
  res.json(item);
});

// Reordenar cola
app.post('/api/cola/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order debe ser un array de IDs' });
  const map = new Map(state.cola.map(c => [c.id, c]));
  const reordered = order.filter(id => map.has(id)).map(id => map.get(id));
  // Agregar items no incluidos en el orden al final
  state.cola.forEach(c => { if (!order.includes(c.id)) reordered.push(c); });
  state.cola = reordered;
  saveJSON('cola.json', state.cola);
  io.emit('cola_update', state.cola);
  res.json({ ok: true });
});

// Limpiar terminados de la cola
app.post('/api/cola/clean', (req, res) => {
  state.cola = state.cola.filter(c => c.estado !== 'terminado');
  saveJSON('cola.json', state.cola);
  io.emit('cola_update', state.cola);
  res.json({ ok: true });
});

// ── Mesas ────────────────────────────────────────────────────────────────────
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

// ── Canciones (CRUD completo) ────────────────────────────────────────────────
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
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  res.json(song);
});

app.post('/api/canciones', (req, res) => {
  const titulo  = clampStr(req.body.titulo, 200).trim();
  const letra   = clampStr(req.body.letra, 10000).trim();
  const artista = clampStr(req.body.artista, 100).trim();
  if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
  const song = { id: generateId(), titulo, letra, artista, fecha: Date.now() };
  state.canciones.push(song);
  saveJSON('canciones.json', state.canciones);
  res.json(song);
});

app.patch('/api/canciones/:id', (req, res) => {
  const song = state.canciones.find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  if (req.body.titulo !== undefined) song.titulo = clampStr(req.body.titulo, 200).trim();
  if (req.body.letra !== undefined) song.letra = clampStr(req.body.letra, 10000).trim();
  if (req.body.artista !== undefined) song.artista = clampStr(req.body.artista, 100).trim();
  saveJSON('canciones.json', state.canciones);
  res.json(song);
});

app.delete('/api/canciones/:id', (req, res) => {
  const idx = state.canciones.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Canción no encontrada' });
  state.canciones.splice(idx, 1);
  saveJSON('canciones.json', state.canciones);
  res.json({ ok: true });
});

// ── Teleprompter state ───────────────────────────────────────────────────────
app.get('/api/teleprompter', (req, res) => res.json(state.teleprompter));
app.post('/api/teleprompter', (req, res) => {
  Object.assign(state.teleprompter, req.body);
  debouncedSave('teleprompter.json', state.teleprompter);
  io.emit('tp_update', state.teleprompter);
  res.json(state.teleprompter);
});

// ── YouTube Search (proxy para evitar CORS) ─────────────────────────────────
app.get('/api/youtube/search', async (req, res) => {
  const { q, key, pageToken } = req.query;
  if (!q || !key) return res.status(400).json({ error: 'Faltan parámetros: q y key' });
  try {
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', maxResults: '12',
      q, key, ...(pageToken ? { pageToken } : {})
    });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/youtube/videos', async (req, res) => {
  const { ids, key } = req.query;
  if (!ids || !key) return res.status(400).json({ error: 'Faltan ids y key' });
  try {
    const params = new URLSearchParams({ part: 'contentDetails,snippet', id: ids, key });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Servir archivos de audio descargados ────────────────────────────────────
app.use('/audio', express.static(path.join(__dirname, 'python', 'downloads')));

app.get('/api/audio/list', (req, res) => {
  const dir = path.join(__dirname, 'python', 'downloads');
  try {
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(f => /\.(mp3|wav|m4a|ogg)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(dir, f));
        return { filename: f, url: '/audio/' + encodeURIComponent(f), size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json(files);
  } catch { res.json([]); }
});

// Audio processor (calls Python)
app.post('/api/audio/process', (req, res) => {
  const { url, mode } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  const pythonCmd = process.platform === 'win32'
    ? 'python\\venv\\Scripts\\python.exe'
    : 'python3';
  const script = path.join(__dirname, 'python', 'audio_processor.py');
  exec(`${pythonCmd} "${script}" "${url}" "${mode || 'download'}"`, {
    timeout: 120000, cwd: __dirname
  }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    try { res.json(JSON.parse(stdout)); }
    catch { res.json({ output: stdout.trim() }); }
  });
});

// Health
app.get('/api/health', (req, res) => res.json({
  status: 'ok', version: '2.0.0', uptime: process.uptime(),
  ip: getLocalIp(), port: PORT,
  songs: state.canciones.length,
  queue: state.cola.length
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket (Socket.IO) ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);

  socket.emit('init', {
    cola: state.cola, mesas: state.mesas,
    teleprompter: state.teleprompter,
    canciones: state.canciones
  });

  socket.on('tp_scroll', (data) => {
    state.teleprompter.currentWord = data.currentWord ?? state.teleprompter.currentWord;
    state.teleprompter.isPlaying   = data.isPlaying   ?? state.teleprompter.isPlaying;
    debouncedSave('teleprompter.json', state.teleprompter);
    socket.broadcast.emit('tp_update', state.teleprompter);
  });

  socket.on('tp_lyrics', (data) => {
    state.teleprompter.lyrics = data.lyrics || '';
    state.teleprompter.currentWord = -1;
    saveJSON('teleprompter.json', state.teleprompter);
    io.emit('tp_update', state.teleprompter);
  });

  socket.on('tp_speed', (data) => {
    state.teleprompter.scrollSpeed = data.speed ?? 1;
    debouncedSave('teleprompter.json', state.teleprompter);
    io.emit('tp_speed_update', { speed: state.teleprompter.scrollSpeed });
  });

  socket.on('cola_add', (data) => {
    const entry = {
      id: generateId(),
      cantante: clampStr(data.cantante || 'Anonimo', 100),
      cancion: clampStr(data.cancion || '', 200),
      mesa: data.mesa || null,
      estado: 'esperando', timestamp: Date.now()
    };
    state.cola.push(entry);
    saveJSON('cola.json', state.cola);
    io.emit('cola_update', state.cola);
  });

  socket.on('cola_next', () => {
    const current = state.cola.find(c => c.estado === 'cantando');
    if (current) current.estado = 'terminado';
    const next = state.cola.find(c => c.estado === 'esperando');
    if (next) next.estado = 'cantando';
    saveJSON('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    io.emit('singer_changed', next || null);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Cliente desconectado: ${socket.id}`);
  });
});

// ── Error handlers ──────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// ── Arranque ────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const ip = getLocalIp();
  console.log('');
  console.log('  =============================================');
  console.log('   VIBEFLOW PRO v2.0 - SERVIDOR ACTIVO');
  console.log('  =============================================');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red LAN:  http://${ip}:${PORT}`);
  console.log(`   Canciones: ${state.canciones.length} | Cola: ${state.cola.length}`);
  console.log('  =============================================');
  console.log('');
});
