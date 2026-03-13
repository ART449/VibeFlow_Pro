// ═══════════════════════════════════════════════════════════════════════════
// BYFLOW — Vive Cantando (powered by IArtLabs) - Server (Node.js + Express + Socket.IO)
// Persistencia JSON + CRUD completo + Error handling
// ═══════════════════════════════════════════════════════════════════════════

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const crypto   = require('crypto');
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

// ── Filtro de contenido (anti-groserías para modo Bares) ─────────────────
const PALABRAS_PROHIBIDAS = [
  'puta','puto','putos','putas','mierda','coño','joder','hostia',
  'cabron','cabrón','gilipollas','pendejo','culero','chinga','verga',
  'polla','culo','marica','maricón','perra','zorra','bastardo',
  'idiota','imbecil','imbécil','estupido','estúpido',
  'fuck','shit','bitch','asshole','dick','pussy','cunt','nigger','faggot'
];

function validarTextoPublico(texto, campo = 'campo', maxLen = 100) {
  if (typeof texto !== 'string') return { ok: false, error: `${campo} debe ser texto` };
  const val = texto.trim();
  if (!val) return { ok: false, error: `${campo} no puede estar vacío` };
  if (val.length > maxLen) return { ok: false, error: `${campo} máximo ${maxLen} caracteres` };
  const lower = val.toLowerCase();
  for (const p of PALABRAS_PROHIBIDAS) {
    if (lower.includes(p)) return { ok: false, error: `${campo} contiene contenido inapropiado` };
  }
  return { ok: true, value: val };
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

// ── Sistema de Licencias ────────────────────────────────────────────────────
function loadSecret(filename, bytes) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(fp)) return fs.readFileSync(fp, 'utf8').trim();
  } catch {}
  const secret = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(fp, secret, 'utf8');
  return secret;
}

const LICENSE_SECRET = loadSecret('.license_secret', 32);
const ADMIN_SECRET  = process.env.ADMIN_SECRET || loadSecret('.admin_secret', 16);
const MASTER_ADMIN  = 'BF-ArT-2026-IArtLabs';  // Master key fija para el dueño

function getDeviceFingerprint() {
  const hostname = os.hostname();
  const ifaces = os.networkInterfaces();
  let mac = 'unknown';
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac; break;
      }
    }
    if (mac !== 'unknown') break;
  }
  return crypto.createHash('sha256').update(hostname + '|' + mac).digest('hex').slice(0, 16);
}

function generateLicenseKey() {
  const payload = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 chars
  const sig = crypto.createHmac('sha256', LICENSE_SECRET)
    .update(payload).digest('hex').slice(0, 4).toUpperCase();          // 4 chars
  const raw = payload + sig; // 20 chars
  return `VFP-${raw.slice(0,5)}-${raw.slice(5,10)}-${raw.slice(10,15)}-${raw.slice(15,20)}`;
}

function validateKeySignature(key) {
  const clean = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 23 || !key.startsWith('VFP-')) return false;
  const raw = clean.slice(3); // remove VFP prefix -> 20 chars
  const payload = raw.slice(0, 16);
  const sig = raw.slice(16, 20);
  const expected = crypto.createHmac('sha256', LICENSE_SECRET)
    .update(payload).digest('hex').slice(0, 4).toUpperCase();
  return sig === expected;
}

function getActiveLicense() {
  const fp = getDeviceFingerprint();
  const licenses = (state.license && state.license.licenses) || [];
  return licenses.find(l => l.activated && l.deviceFingerprint === fp) || null;
}

// Per-user license lookup by token
function getLicenseByToken(token) {
  if (!token) return null;
  const licenses = (state.license && state.license.licenses) || [];
  return licenses.find(l => l.activated && l.userToken === token) || null;
}

function isFeatureLicensed(feature) {
  const lic = getActiveLicense();
  return lic && lic.features.includes(feature);
}

function isFeatureLicensedByToken(token, feature) {
  const lic = getLicenseByToken(token);
  return lic && lic.features.includes(feature);
}

// Rate limiter simple para activaciones
const _rateLimits = {};
function checkRateLimit(ip, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  if (!_rateLimits[ip]) _rateLimits[ip] = [];
  _rateLimits[ip] = _rateLimits[ip].filter(t => now - t < windowMs);
  if (_rateLimits[ip].length >= maxAttempts) return false;
  _rateLimits[ip].push(now);
  return true;
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
  }),
  license:      loadJSON('licenses.json', { licenses: [] })
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
  const vNombre = validarTextoPublico(req.body.cantante, 'Nombre', 100);
  if (!vNombre.ok) return res.status(400).json({ error: vNombre.error });
  const cancion  = clampStr(req.body.cancion, 200).trim();
  const mesa     = req.body.mesa || null;
  const entry = {
    id: generateId(), cantante: vNombre.value, cancion,
    mesa, estado: 'esperando', timestamp: Date.now()
  };
  state.cola.push(entry);
  saveJSON('cola.json', state.cola);
  io.emit('cola_update', state.cola);
  // Track stats
  trackStat('cola_add', { cantante: vNombre.value, cancion, mesa });
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

// ── NOTA: Descarga de audio PROHIBIDA ────────────────────────────────────
// ByFlow NO descarga contenido de YouTube ni ninguna plataforma.
// Solo se usa YouTube/SoundCloud para reproducción embebida (karaoke).
// Cualquier intento de descarga es bloqueado por política de ByFlow.

// ── Licencias (por usuario con token) ─────────────────────────────────────────
app.get('/api/license/status', (req, res) => {
  // Per-user: client sends token via header or query
  const token = req.headers['x-license-token'] || req.query.token || '';
  if (token) {
    const lic = getLicenseByToken(token);
    if (lic) {
      return res.json({
        activated: true,
        features: lic.features,
        owner: lic.owner || '',
        keyFragment: lic.key.slice(-9)
      });
    }
  }
  // Fallback: no token or invalid token = no license
  return res.json({ activated: false, features: [] });
});

app.post('/api/license/activate', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 1 minuto.' });
  }
  const key = (req.body.key || '').trim().toUpperCase();
  if (!validateKeySignature(key)) {
    return res.status(403).json({ error: 'Clave de licencia inválida' });
  }
  const entry = state.license.licenses.find(l => l.key === key);
  if (!entry) {
    return res.status(404).json({ error: 'Licencia no encontrada en el sistema' });
  }
  // If already activated by someone else (different userToken exists), reject
  if (entry.activated && entry.userToken && req.body.token && entry.userToken !== req.body.token) {
    return res.status(409).json({ error: 'Esta licencia ya está activada por otro usuario' });
  }
  // Generate unique user token for this activation
  const userToken = entry.userToken || crypto.randomBytes(24).toString('hex');
  entry.activated = true;
  entry.activatedAt = new Date().toISOString();
  entry.userToken = userToken;
  entry.deviceFingerprint = getDeviceFingerprint(); // keep for admin tracking
  saveJSON('licenses.json', state.license);
  res.json({
    success: true,
    features: entry.features,
    owner: entry.owner || '',
    keyFragment: key.slice(-9),
    token: userToken  // Client saves this in localStorage
  });
});

app.post('/api/license/deactivate', (req, res) => {
  const token = req.headers['x-license-token'] || (req.body && req.body.token) || '';
  if (!token) return res.status(400).json({ error: 'Token requerido' });
  const entry = getLicenseByToken(token);
  if (!entry) return res.status(404).json({ error: 'No hay licencia activa con este token' });
  entry.activated = false;
  entry.userToken = null;
  entry.activatedAt = null;
  saveJSON('licenses.json', state.license);
  res.json({ success: true });
});

app.post('/api/license/admin/generate', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  const owner = (req.body.owner || '').trim() || 'Sin asignar';
  const features = Array.isArray(req.body.features) ? req.body.features : ['bares', 'music_streaming', 'ollama_ai'];
  const key = generateLicenseKey();
  const entry = {
    key, owner, features,
    created: new Date().toISOString(),
    activated: false,
    activatedAt: null,
    deviceFingerprint: null
  };
  state.license.licenses.push(entry);
  saveJSON('licenses.json', state.license);
  res.json({ key, owner, features });
});

app.get('/api/license/admin/list', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  res.json(state.license.licenses);
});

// ── Superusuario: genera licencia con token personal ──────────────────────
app.post('/api/license/admin/superuser', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key invalida' });
  }
  const ownerName = (req.body.owner || 'SUPERUSER-IARTLABS').trim();
  const allFeatures = ['bares', 'music_streaming', 'ollama_ai', 'stem_engine', 'dj_mode', 'analytics'];

  // Check if superuser already exists for this owner
  let entry = state.license.licenses.find(l => l.owner === ownerName && l.isSuperuser);
  if (entry) {
    entry.features = allFeatures;
    entry.activated = true;
    if (!entry.userToken) entry.userToken = crypto.randomBytes(24).toString('hex');
    saveJSON('licenses.json', state.license);
    return res.json({
      message: 'Superusuario ya existia, features actualizados',
      key: entry.key, owner: entry.owner, features: entry.features,
      token: entry.userToken
    });
  }

  // Generate and auto-activate with user token
  const key = generateLicenseKey();
  const userToken = crypto.randomBytes(24).toString('hex');
  entry = {
    key, owner: ownerName, features: allFeatures,
    created: new Date().toISOString(),
    activated: true,
    activatedAt: new Date().toISOString(),
    deviceFingerprint: getDeviceFingerprint(),
    userToken,
    isSuperuser: true
  };
  state.license.licenses.push(entry);
  saveJSON('licenses.json', state.license);
  res.json({
    message: 'Superusuario creado y activado',
    key, owner: entry.owner, features: allFeatures,
    token: userToken
  });
});

// ── Estadísticas de uso ──────────────────────────────────────────────────────
const statsFile = 'stats.json';
const stats = loadJSON(statsFile, {
  totalSongs: 0, totalSingers: 0,
  songCounts: {},    // { "titulo - artista": count }
  singerCounts: {},  // { "nombre": count }
  dailyCounts: {},   // { "2026-03-13": count }
  events: []         // últimos 100 eventos
});

function trackStat(type, data) {
  const today = new Date().toISOString().slice(0, 10);
  stats.dailyCounts[today] = (stats.dailyCounts[today] || 0) + 1;

  if (type === 'song_played') {
    stats.totalSongs++;
    const key = (data.cancion || 'Sin canción') + (data.artista ? ' - ' + data.artista : '');
    stats.songCounts[key] = (stats.songCounts[key] || 0) + 1;
  }
  if (type === 'cola_add') {
    stats.totalSingers++;
    const singer = data.cantante || 'Anónimo';
    stats.singerCounts[singer] = (stats.singerCounts[singer] || 0) + 1;
  }

  stats.events.push({ type, data, time: Date.now() });
  if (stats.events.length > 200) stats.events = stats.events.slice(-100);
  debouncedSave(statsFile, stats);
}

app.get('/api/stats', (req, res) => {
  // Top 10 canciones
  const topSongs = Object.entries(stats.songCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Top 10 cantantes
  const topSingers = Object.entries(stats.singerCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Últimos 7 días
  const last7 = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7[key] = stats.dailyCounts[key] || 0;
  }

  res.json({
    totalSongs: stats.totalSongs,
    totalSingers: stats.totalSingers,
    topSongs, topSingers, last7,
    totalDays: Object.keys(stats.dailyCounts).length
  });
});

// ── LRCLIB proxy (evita CORS issues en algunos navegadores) ──────────────
app.get('/api/lrclib/search', async (req, res) => {
  const { track_name, artist_name } = req.query;
  if (!track_name) return res.status(400).json({ error: 'track_name requerido' });
  try {
    const params = new URLSearchParams({ track_name });
    if (artist_name) params.append('artist_name', artist_name);
    const r = await fetch(`https://lrclib.net/api/search?${params}`);
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    const vNombre = validarTextoPublico(data.cantante || 'Anonimo', 'Nombre', 100);
    const cantante = vNombre.ok ? vNombre.value : clampStr(data.cantante || 'Anonimo', 100);
    const entry = {
      id: generateId(),
      cantante,
      cancion: clampStr(data.cancion || '', 200),
      mesa: data.mesa || null,
      estado: 'esperando', timestamp: Date.now()
    };
    if (!vNombre.ok) {
      socket.emit('validation_error', { error: vNombre.error });
      return;
    }
    state.cola.push(entry);
    saveJSON('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    trackStat('cola_add', { cantante, cancion: entry.cancion, mesa: entry.mesa });
  });

  socket.on('cola_next', () => {
    const current = state.cola.find(c => c.estado === 'cantando');
    if (current) current.estado = 'terminado';
    const next = state.cola.find(c => c.estado === 'esperando');
    if (next) {
      next.estado = 'cantando';
      trackStat('song_played', { cancion: next.cancion, cantante: next.cantante });
    }
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
  const activeLic = getActiveLicense();
  console.log('');
  console.log('  =============================================');
  console.log('   BYFLOW — Vive Cantando — SERVIDOR ACTIVO');
  console.log('  =============================================');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red LAN:  http://${ip}:${PORT}`);
  console.log(`   Canciones: ${state.canciones.length} | Cola: ${state.cola.length}`);
  console.log(`   Licencia:  ${activeLic ? 'PRO activa (' + activeLic.owner + ')' : 'FREE'}`);
  console.log('  ---------------------------------------------');
  console.log(`   ADMIN KEY: ${ADMIN_SECRET}`);
  console.log('   (Guarda esta clave para generar licencias)');
  console.log('  =============================================');
  console.log('');
});
