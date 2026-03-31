// ═══════════════════════════════════════════════════════════════════════════
// ByFlow — "Vive Cantando con ByFlow"
// Copyright (c) 2024-2026 Arturo Torres (ArT-AtR) / IArtLabs
// Todos los derechos reservados.
//
// Este codigo fuente es propiedad exclusiva de Arturo Torres.
// Queda prohibida su copia, distribucion, modificacion o uso
// sin autorizacion expresa por escrito del propietario.
//
// Contacto: elricondelgeekdearturo@gmail.com
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config({ quiet: true });

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const compression = require('compression');
const path        = require('path');
const os          = require('os');
const fs          = require('fs');
const crypto      = require('crypto');

// ── Route modules ───────────────────────────────────────────────────────────
const colaRoutes      = require('./routes/cola');
const cancionesRoutes = require('./routes/canciones');
const youtubeRoutes   = require('./routes/youtube');
const licenseRoutes   = require('./routes/license');
const aiRoutes        = require('./routes/ai');
const letrasBeatRoutes = require('./routes/letras-beat');
const eventosRoutes   = require('./routes/eventos');
const perfilesRoutes  = require('./routes/perfiles');
const billingRoutes   = require('./routes/billing');
const miscRoutes      = require('./routes/misc');

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

function normalizeRoomId(value) {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20)
    : '';
}

function normalizeRoomToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  return /^[A-F0-9]{32}$/i.test(token) ? token.toUpperCase() : '';
}

function generateRoomToken() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// ── Filtro de contenido (anti-groserias para modo Bares) ────────────────────
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
  if (!val) return { ok: false, error: `${campo} no puede estar vacio` };
  if (val.length > maxLen) return { ok: false, error: `${campo} maximo ${maxLen} caracteres` };
  const lower = val.toLowerCase();
  for (const p of PALABRAS_PROHIBIDAS) {
    if (lower.includes(p)) return { ok: false, error: `${campo} contiene contenido inapropiado` };
  }
  return { ok: true, value: val };
}

// ── Persistencia JSON ───────────────────────────────────────────────────────
// Railway Volume: set DATA_PATH env var to the mounted volume path (e.g., /data)
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (process.env.DATA_PATH) console.log('[DATA] Usando volumen persistente:', DATA_DIR);
else console.log('[DATA] Usando directorio local:', DATA_DIR);

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
const _debouncePending = {};
function debouncedSave(filename, data, ms = 1000) {
  if (_debounceTimers[filename]) clearTimeout(_debounceTimers[filename]);
  _debouncePending[filename] = data;
  _debounceTimers[filename] = setTimeout(() => {
    saveJSON(filename, data);
    delete _debouncePending[filename];
  }, ms);
}

function flushPendingSaves() {
  for (const [filename, data] of Object.entries(_debouncePending)) {
    saveJSON(filename, data);
  }
}
process.on('SIGTERM', () => { console.log('[SERVER] SIGTERM — flushing...'); flushPendingSaves(); process.exit(0); });
process.on('SIGINT',  () => { console.log('[SERVER] SIGINT — flushing...');  flushPendingSaves(); process.exit(0); });

// ── Sistema de Licencias (secrets) ──────────────────────────────────────────
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
const MASTER_ADMIN  = process.env.MASTER_ADMIN || loadSecret('.master_admin', 16);

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

function getActiveLicense() {
  const fp = getDeviceFingerprint();
  const licenses = (state.license && state.license.licenses) || [];
  return licenses.find(l => l.activated && l.deviceFingerprint === fp) || null;
}

function getLicenseByToken(token) {
  if (!token) return null;
  const licenses = (state.license && state.license.licenses) || [];
  return licenses.find(l => l.activated && l.userToken === token) || null;
}

// ── Rate limiters ───────────────────────────────────────────────────────────
const _rateLimits = {};
function checkRateLimit(ip, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  if (!_rateLimits[ip]) _rateLimits[ip] = [];
  _rateLimits[ip] = _rateLimits[ip].filter(t => now - t < windowMs);
  if (_rateLimits[ip].length >= maxAttempts) return false;
  _rateLimits[ip].push(now);
  return true;
}

function requireRoomAuth(req, res, next) {
  const roomId = normalizeRoomId(req.headers['x-room-id']);
  const roomToken = normalizeRoomToken(req.headers['x-room-token']);
  const isDestructive = req.method === 'DELETE' || (req.method === 'POST' && /clean/i.test(req.path));
  // Destructive endpoints MUST have a valid room header
  if (!roomId || !roomToken) {
    if (isDestructive) return res.status(403).json({ error: 'X-Room-ID header requerido para esta operacion' });
    return next();
  }
  if (isValidRoomAccess(roomId, roomToken)) return next();
  return res.status(403).json({ error: 'Room ID invalido o inactivo' });
}

const _aiRateLimits = {};
function checkAiRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 3600000;
  const MAX = 10;
  if (!_aiRateLimits[ip]) _aiRateLimits[ip] = [];
  _aiRateLimits[ip] = _aiRateLimits[ip].filter(t => now - t < WINDOW);
  if (_aiRateLimits[ip].length >= MAX) return false;
  _aiRateLimits[ip].push(now);
  return true;
}

// ── Security Shield ─────────────────────────────────────────────────────────
const securityLog = loadJSON('security_log.json', { blocked: [], summary: { total: 0, byType: {} } });

const MALICIOUS_PATTERNS = [
  { name: 'xss_script',    rx: /<script[\s>]/i },
  { name: 'xss_event',     rx: /\bon\w+\s*=/i },
  { name: 'xss_javascript', rx: /javascript\s*:/i },
  { name: 'xss_data_uri',  rx: /data\s*:\s*text\/html/i },
  { name: 'sqli_union',    rx: /\bUNION\s+(ALL\s+)?SELECT\b/i },
  { name: 'sqli_drop',     rx: /\bDROP\s+(TABLE|DATABASE)\b/i },
  { name: 'sqli_insert',   rx: /\bINSERT\s+INTO\b.*VALUES/i },
  { name: 'sqli_comment',  rx: /('|")\s*(OR|AND)\s+('|"|\d)/i },
  { name: 'path_traversal', rx: /\.\.[\/\\]/g },
  { name: 'null_byte',     rx: /%00/g },
  { name: 'cmd_injection', rx: /[;&|`$]\s*(cat|ls|rm|wget|curl|nc|bash|sh|python|node|eval)\b/i },
  { name: 'cmd_backtick',  rx: /`[^`]+`/ },
  { name: 'nosql_operator', rx: /\$(?:gt|gte|lt|lte|ne|in|nin|or|and|not|regex|where|exists)\b/i },
  { name: 'ssti',          rx: /\{\{.*\}\}/g },
  { name: 'hex_encode',    rx: /\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}/i },
  { name: 'exe_header',    rx: /^TVqQAAMAAAA/ },
  { name: 'elf_header',    rx: /^f0VMRg/ },
  { name: 'php_tag',       rx: /<\?php/i },
  { name: 'webshell',      rx: /\b(eval|assert|system|exec|passthru|shell_exec|popen)\s*\(/i }
];

function scanValue(val, depth = 0) {
  if (depth > 5) return null;
  if (typeof val === 'string') {
    for (const p of MALICIOUS_PATTERNS) {
      if (p.rx.test(val)) return p.name;
    }
  } else if (Array.isArray(val)) {
    for (const item of val) {
      const hit = scanValue(item, depth + 1);
      if (hit) return hit;
    }
  } else if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) {
      if (/^\$/.test(k)) return 'nosql_operator_key';
      const hit = scanValue(val[k], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function logSecurityEvent(type, ip, detail) {
  const entry = {
    type, ip,
    detail: typeof detail === 'string' ? detail.slice(0, 200) : String(detail).slice(0, 200),
    time: new Date().toISOString()
  };
  securityLog.blocked.push(entry);
  if (securityLog.blocked.length > 500) securityLog.blocked = securityLog.blocked.slice(-300);
  securityLog.summary.total++;
  securityLog.summary.byType[type] = (securityLog.summary.byType[type] || 0) + 1;
  debouncedSave('security_log.json', securityLog);
  console.log(`[SHIELD] BLOCKED ${type} from ${ip}: ${entry.detail}`);
}

const _globalRates = {};
function globalRateLimit(ip, max = 60, windowMs = 60000) {
  const now = Date.now();
  if (!_globalRates[ip]) _globalRates[ip] = [];
  _globalRates[ip] = _globalRates[ip].filter(t => now - t < windowMs);
  if (_globalRates[ip].length >= max) return false;
  _globalRates[ip].push(now);
  return true;
}

// Clean up rate limit memory every 5 min
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(_globalRates)) {
    _globalRates[ip] = _globalRates[ip].filter(t => now - t < 60000);
    if (_globalRates[ip].length === 0) delete _globalRates[ip];
  }
}, 300000);

// ── App Setup ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const app  = express();
app.set('trust proxy', 1);

// ── Security Headers (helmet) ───────────────────────────────────────────────
try {
  const helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.youtube.com", "https://s.ytimg.com", "https://www.gstatic.com", "https://apis.google.com", "https://cdn.socket.io", "https://www.googletagmanager.com", "https://*.firebaseapp.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        frameSrc: ["'self'", "https://www.youtube.com", "https://w.soundcloud.com", "https://*.firebaseapp.com", "https://js.stripe.com"],
        connectSrc: ["'self'", "https:", "wss:", "ws:"],
        mediaSrc: ["'self'", "https:", "blob:"],
        workerSrc: ["'self'", "blob:"],
        scriptSrcAttr: ["'unsafe-inline'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
} catch(e) { console.log('[Security] helmet not loaded:', e.message); }

const server = http.createServer(app);

// ── CORS & Allowed Origins ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['https://byflowapp.up.railway.app', 'http://localhost:3333', 'http://localhost:8080'];
const corsOptions = ALLOWED_ORIGINS.includes('*')
  ? {}
  : { origin: ALLOWED_ORIGINS };

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(cors(corsOptions));

// ── Stripe webhook (MUST be BEFORE express.json for raw body) ───────────────
billingRoutes.registerWebhook(app, { LICENSE_SECRET });

app.use(express.json({ limit: '1mb' }));

// ── POS Eatertainment Module ────────────────────────────────────────────────
let _posReady = Promise.resolve();
try {
  const pos = require('./pos');
  _posReady = pos.init(app, io).catch(e => console.error('[POS] Init failed:', e.message));
} catch (e) {
  console.log('[POS] Module not loaded:', e.message);
}

// ── Security Shield Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!globalRateLimit(ip)) {
    logSecurityEvent('rate_limit', ip, `${req.method} ${req.path}`);
    return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
  }
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const suspiciousUA = ['sqlmap', 'nikto', 'nmap', 'masscan', 'dirbuster', 'gobuster',
    'hydra', 'metasploit', 'burpsuite', 'zap', 'nuclei', 'wfuzz', 'ffuf'];
  for (const s of suspiciousUA) {
    if (ua.includes(s)) {
      logSecurityEvent('scanner_blocked', ip, `UA: ${ua.slice(0, 100)}`);
      return res.status(403).json({ error: 'Acceso denegado' });
    }
  }
  for (const [key, val] of Object.entries(req.query)) {
    const hit = scanValue(val);
    if (hit) {
      logSecurityEvent(hit, ip, `query.${key}=${String(val).slice(0, 100)}`);
      return res.status(400).json({ error: 'Solicitud bloqueada por seguridad' });
    }
  }
  if (req.body && typeof req.body === 'object') {
    const hit = scanValue(req.body);
    if (hit) {
      logSecurityEvent(hit, ip, `body: ${JSON.stringify(req.body).slice(0, 150)}`);
      return res.status(400).json({ error: 'Contenido bloqueado por seguridad' });
    }
  }
  if (/\.\.[\/\\]/.test(req.path) || /%2e%2e/i.test(req.path)) {
    logSecurityEvent('path_traversal_url', ip, req.path);
    return res.status(400).json({ error: 'Ruta no permitida' });
  }
  next();
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.get('/landing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/remote', (req, res) => res.sendFile(path.join(__dirname, 'public', 'remote.html')));

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
  license:      loadJSON('licenses.json', { licenses: [] }),
  globalPromo:  loadJSON('global_promo.json', { active: false, features: [], expiresAt: null, label: '' })
};

// ── Auto-activar promo de lanzamiento SOLO si NUNCA existio una promo ───────
if (!state.globalPromo.active && !state.globalPromo.activatedAt) {
  const LAUNCH_DAYS = 7;
  state.globalPromo = {
    active: true,
    features: ['bares', 'music_streaming', 'ollama_ai'],
    expiresAt: new Date(Date.now() + LAUNCH_DAYS * 86400000).toISOString(),
    label: 'Semana PRO Gratis - Lanzamiento ByFlow',
    activatedAt: new Date().toISOString()
  };
  saveJSON('global_promo.json', state.globalPromo);
  console.log(`[PROMO] Semana PRO gratis activada automaticamente — expira ${state.globalPromo.expiresAt}`);
} else if (!state.globalPromo.active) {
  console.log('[PROMO] Promo anterior encontrada (expirada/desactivada). No se reactiva automaticamente.');
}

// ── Estadisticas de uso ─────────────────────────────────────────────────────
const statsFile = 'stats.json';
const stats = loadJSON(statsFile, {
  totalSongs: 0, totalSingers: 0,
  songCounts: {}, singerCounts: {}, dailyCounts: {}, events: []
});

function trackStat(type, data) {
  const today = new Date().toISOString().slice(0, 10);
  stats.dailyCounts[today] = (stats.dailyCounts[today] || 0) + 1;
  if (type === 'song_played') {
    stats.totalSongs++;
    const key = (data.cancion || 'Sin cancion') + (data.artista ? ' - ' + data.artista : '');
    stats.songCounts[key] = (stats.songCounts[key] || 0) + 1;
  }
  if (type === 'cola_add') {
    stats.totalSingers++;
    const singer = data.cantante || 'Anonimo';
    stats.singerCounts[singer] = (stats.singerCounts[singer] || 0) + 1;
  }
  stats.events.push({ type, data, time: Date.now() });
  if (stats.events.length > 200) stats.events = stats.events.slice(-100);
  debouncedSave(statsFile, stats);
}

// ── Rooms (aislamiento por sesion) ──────────────────────────────────────────
const rooms = {};

function getRoom(roomId, tokenHint) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const normalizedToken = normalizeRoomToken(tokenHint);
  if (!normalizedRoomId) return null;
  if (!rooms[normalizedRoomId]) {
    rooms[normalizedRoomId] = {
      roomToken: normalizedToken || generateRoomToken(),
      teleprompter: {
        lyrics: '', currentWord: -1, currentTime: 0,
        scrollSpeed: 1, isPlaying: false,
        singer: '', song: '', lastUpdate: 0
      },
      lastActive: Date.now()
    };
  }
  rooms[normalizedRoomId].lastActive = Date.now();
  return rooms[normalizedRoomId];
}

function isValidRoomAccess(roomId, roomToken) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const normalizedToken = normalizeRoomToken(roomToken);
  if (!normalizedRoomId || !normalizedToken) return false;
  return !!(rooms[normalizedRoomId] && rooms[normalizedRoomId].roomToken === normalizedToken);
}

// Cleanup: rooms inactivos > 2h, rate limits viejos
setInterval(() => {
  const now = Date.now();
  for (const rid of Object.keys(rooms)) {
    const r = io.sockets.adapter.rooms.get(rid);
    if ((!r || r.size === 0) && now - rooms[rid].lastActive > 7200000) delete rooms[rid];
  }
  for (const ip of Object.keys(_rateLimits)) {
    if (!_rateLimits[ip].length || now - _rateLimits[ip][0] > 120000) delete _rateLimits[ip];
  }
  for (const ip of Object.keys(_aiRateLimits)) {
    if (!_aiRateLimits[ip].length || now - _aiRateLimits[ip][0] > 3600000) delete _aiRateLimits[ip];
  }
}, 600000);

// ── Shared helpers for route modules ────────────────────────────────────────
const { addActividad } = perfilesRoutes;
const { readLetrasBeat } = letrasBeatRoutes;

const helpers = {
  saveJSON, loadJSON, debouncedSave, clampStr, generateId,
  validarTextoPublico, requireRoomAuth, trackStat,
  checkRateLimit, checkAiRateLimit,
  ADMIN_SECRET, MASTER_ADMIN, LICENSE_SECRET,
  getDeviceFingerprint, getLicenseByToken,
  addActividad, readLetrasBeat,
  getLocalIp, getRoom, isValidRoomAccess, stats, securityLog,
  PORT, server,
  io
};

// ── Register all route modules ──────────────────────────────────────────────
colaRoutes.registerRoutes(app, state, helpers);
cancionesRoutes.registerRoutes(app, state, helpers);
youtubeRoutes.registerRoutes(app, state, helpers);
licenseRoutes.registerRoutes(app, state, helpers);
aiRoutes.registerRoutes(app, state, helpers);
letrasBeatRoutes.registerRoutes(app, state, helpers);
eventosRoutes.registerRoutes(app, state, helpers);
perfilesRoutes.registerRoutes(app, state, helpers);
billingRoutes.registerRoutes(app, state, helpers);
miscRoutes.registerRoutes(app, state, helpers);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket (Socket.IO) ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);
  io.emit('online_count', io.engine.clientsCount);

  let myRoom = null;
  let _roomJoins = 0;

  socket.on('join_room', (data) => {
    try {
      if (++_roomJoins > 10) return;
      const roomId = normalizeRoomId(data && data.roomId);
      const roomToken = normalizeRoomToken(data && data.roomToken);
      if (!roomId) return;
      const existingRoom = rooms[roomId];
      if (existingRoom && existingRoom.roomToken !== roomToken) {
        socket.emit('room_error', { error: 'Token de sala invalido o faltante' });
        return;
      }
      if (myRoom) socket.leave(myRoom);
      myRoom = roomId;
      socket.join(roomId);
      const room = getRoom(roomId, roomToken);
      socket.emit('room_joined', { roomId, roomToken: room.roomToken, teleprompter: room.teleprompter });
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit('room_count', roomSize);
    } catch (err) {
      console.error(`[WS] join_room error: ${err.message}`);
    }
  });

  socket.emit('init', {
    cola: state.cola, mesas: state.mesas,
    canciones: state.canciones
  });

  // ── Sync por tiempo real (Fase 4 karaoke rework) ──
  socket.on('tp_scroll', (data) => {
    const word = typeof data.currentWord === 'number' ? data.currentWord : undefined;
    const playing = typeof data.isPlaying === 'boolean' ? data.isPlaying : undefined;
    const currentTime = typeof data.currentTime === 'number' ? data.currentTime : undefined;
    if (myRoom) {
      const room = getRoom(myRoom);
      if (word !== undefined) room.teleprompter.currentWord = word;
      if (playing !== undefined) room.teleprompter.isPlaying = playing;
      if (currentTime !== undefined) room.teleprompter.currentTime = currentTime;
      room.teleprompter.lastUpdate = Date.now();
      socket.to(myRoom).emit('tp_update', room.teleprompter);
    }
  });

  socket.on('tp_lyrics', (data) => {
    const lyrics = typeof data.lyrics === 'string' ? data.lyrics.slice(0, 50000) : '';
    const singer = typeof data.singer === 'string' ? data.singer.slice(0, 100) : '';
    const song = typeof data.song === 'string' ? data.song.slice(0, 200) : '';
    if (myRoom) {
      const room = getRoom(myRoom);
      room.teleprompter.lyrics = lyrics;
      room.teleprompter.currentWord = -1;
      room.teleprompter.currentTime = 0;
      if (singer) room.teleprompter.singer = singer;
      if (song) room.teleprompter.song = song;
      io.to(myRoom).emit('tp_update', room.teleprompter);
    }
  });

  // Snapshot request — remoto pide estado actual al reconectar
  socket.on('state:request', () => {
    if (myRoom) {
      const room = getRoom(myRoom);
      socket.emit('state:snapshot', {
        teleprompter: room.teleprompter,
        cola: state.cola,
        roomId: myRoom
      });
    }
  });

  socket.on('tp_speed', (data) => {
    const speed = Math.max(0.1, Math.min(10, Number(data.speed) || 1));
    if (myRoom) {
      const room = getRoom(myRoom);
      room.teleprompter.scrollSpeed = speed;
      io.to(myRoom).emit('tp_speed_update', { speed });
    }
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
    debouncedSave('cola.json', state.cola);
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
    debouncedSave('cola.json', state.cola);
    io.emit('cola_update', state.cola);
    io.emit('singer_changed', next || null);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Cliente desconectado: ${socket.id}`);
    if (myRoom) {
      const roomSize = io.sockets.adapter.rooms.get(myRoom)?.size || 0;
      io.to(myRoom).emit('room_count', roomSize);
    }
    io.emit('online_count', io.engine.clientsCount);
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
_posReady.then(() => server.listen(PORT, HOST, () => {
  const ip = getLocalIp();
  const boundPort = (typeof server.address() === 'object' && server.address()) ? server.address().port : PORT;
  const activeLic = getActiveLicense();
  console.log('');
  console.log('  =============================================');
  console.log('   BYFLOW — Vive Cantando — SERVIDOR ACTIVO');
  console.log('  =============================================');
  console.log(`   Local:    http://localhost:${boundPort}`);
  console.log(`   Red LAN:  http://${ip}:${boundPort}`);
  console.log(`   Canciones: ${state.canciones.length} | Cola: ${state.cola.length}`);
  console.log(`   Licencia:  ${activeLic ? 'PRO activa (' + activeLic.owner + ')' : 'FREE'}`);
  console.log('  ---------------------------------------------');
  console.log('   ADMIN KEY: ****** (ver .admin_secret o env ADMIN_SECRET)');
  console.log('   MASTER:    ****** (ver .master_admin o env MASTER_ADMIN)');
  console.log('  =============================================');
  console.log('');
}));
