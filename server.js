// ═══════════════════════════════════════════════════════════════════════════
// VIBEFLOW PRO - Server (Node.js + Express + Socket.IO)
// Escucha en 0.0.0.0:8080 para acceso LAN desde celulares
// ═══════════════════════════════════════════════════════════════════════════

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
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

// ── App Setup ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const app  = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado en memoria ───────────────────────────────────────────────────────
const state = {
  cola: [],           // Cola de cantantes
  mesas: Array.from({ length: 12 }, (_, i) => ({
    numero: i + 1, estado: 'libre', cantante: null
  })),
  canciones: [],      // Biblioteca de canciones
  teleprompter: {
    lyrics: '',
    currentWord: -1,
    scrollSpeed: 1,
    isPlaying: false
  }
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

// Cola de cantantes
app.get('/api/cola', (req, res) => res.json(state.cola));
app.post('/api/cola', (req, res) => {
  const { cantante, cancion, mesa } = req.body;
  if (!cantante) return res.status(400).json({ error: 'Nombre requerido' });
  const entry = {
    id: generateId(), cantante, cancion: cancion || '',
    mesa: mesa || null, estado: 'esperando',
    timestamp: Date.now()
  };
  state.cola.push(entry);
  io.emit('cola_update', state.cola);
  res.json(entry);
});
app.delete('/api/cola/:id', (req, res) => {
  state.cola = state.cola.filter(c => c.id !== req.params.id);
  io.emit('cola_update', state.cola);
  res.json({ ok: true });
});
app.patch('/api/cola/:id', (req, res) => {
  const item = state.cola.find(c => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  Object.assign(item, req.body);
  io.emit('cola_update', state.cola);
  res.json(item);
});

// Mesas
app.get('/api/mesas', (req, res) => res.json(state.mesas));
app.patch('/api/mesas/:num', (req, res) => {
  const mesa = state.mesas.find(m => m.numero === parseInt(req.params.num));
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
  Object.assign(mesa, req.body);
  io.emit('mesas_update', state.mesas);
  res.json(mesa);
});

// Canciones
app.get('/api/canciones', (req, res) => res.json(state.canciones));
app.post('/api/canciones', (req, res) => {
  const { titulo, letra, artista } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
  const song = { id: generateId(), titulo, letra: letra || '', artista: artista || '', fecha: Date.now() };
  state.canciones.push(song);
  res.json(song);
});

// Teleprompter state
app.get('/api/teleprompter', (req, res) => res.json(state.teleprompter));
app.post('/api/teleprompter', (req, res) => {
  Object.assign(state.teleprompter, req.body);
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

// ── YouTube video details (duración) ────────────────────────────────────────
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

// ── Listar audios descargados ────────────────────────────────────────────────
app.get('/api/audio/list', (req, res) => {
  const fs   = require('fs');
  const dir  = path.join(__dirname, 'python', 'downloads');
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
  status: 'ok', version: '1.0.0', uptime: process.uptime(),
  ip: getLocalIp(), port: PORT
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket (Socket.IO) ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);

  // Enviar estado inicial
  socket.emit('init', {
    cola: state.cola, mesas: state.mesas,
    teleprompter: state.teleprompter
  });

  // Teleprompter: sincronizar scroll entre dispositivos
  socket.on('tp_scroll', (data) => {
    state.teleprompter.currentWord = data.currentWord ?? state.teleprompter.currentWord;
    state.teleprompter.isPlaying   = data.isPlaying   ?? state.teleprompter.isPlaying;
    socket.broadcast.emit('tp_update', state.teleprompter);
  });

  // Teleprompter: set lyrics
  socket.on('tp_lyrics', (data) => {
    state.teleprompter.lyrics = data.lyrics || '';
    state.teleprompter.currentWord = -1;
    io.emit('tp_update', state.teleprompter);
  });

  // Teleprompter: speed
  socket.on('tp_speed', (data) => {
    state.teleprompter.scrollSpeed = data.speed ?? 1;
    io.emit('tp_speed_update', { speed: state.teleprompter.scrollSpeed });
  });

  // Cola: agregar desde remoto
  socket.on('cola_add', (data) => {
    const entry = {
      id: generateId(), cantante: data.cantante || 'Anonimo',
      cancion: data.cancion || '', mesa: data.mesa || null,
      estado: 'esperando', timestamp: Date.now()
    };
    state.cola.push(entry);
    io.emit('cola_update', state.cola);
  });

  // Cola: next singer
  socket.on('cola_next', () => {
    const current = state.cola.find(c => c.estado === 'cantando');
    if (current) current.estado = 'terminado';
    const next = state.cola.find(c => c.estado === 'esperando');
    if (next) next.estado = 'cantando';
    io.emit('cola_update', state.cola);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Cliente desconectado: ${socket.id}`);
  });
});

// ── Arranque ────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const ip = getLocalIp();
  console.log('');
  console.log('  =============================================');
  console.log('   VIBEFLOW PRO v1.0 - SERVIDOR ACTIVO');
  console.log('  =============================================');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red LAN:  http://${ip}:${PORT}`);
  console.log('  =============================================');
  console.log('');
});
