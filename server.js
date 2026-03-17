// ═══════════════════════════════════════════════════════════════════════════
// BYFLOW — Vive Cantando (powered by IArtLabs) - Server (Node.js + Express + Socket.IO)
// Persistencia JSON + CRUD completo + Error handling
// ═══════════════════════════════════════════════════════════════════════════

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const compression = require('compression');
const path        = require('path');
const os          = require('os');
const fs          = require('fs');
const crypto      = require('crypto');
// const { exec } = require('child_process');  // Removed — unused, security risk

// ── Stripe (dormido hasta que se configuren env vars) ────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const SUBS_FILE = path.join(__dirname, 'data', 'subscriptions.json');

function readSubs() {
  try { return fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : { users: {} }; }
  catch { return { users: {} }; }
}
function writeSubs(data) {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch(e) { console.error('[Stripe] Write error:', e.message); }
}
function planFromPrice(priceId) {
  if (priceId === process.env.STRIPE_PRICE_PRO_CREATOR) return 'PRO_CREATOR';
  if (priceId === process.env.STRIPE_PRICE_PRO_BAR) return 'PRO_BAR';
  return 'FREE';
}
function featuresForPlan(plan) {
  switch (plan) {
    case 'PRO_CREATOR': return { karaoke:true, musica:true, bares:false, ia:true, remoteQR:true };
    case 'PRO_BAR':     return { karaoke:true, musica:true, bares:true, ia:true, remoteQR:true };
    default:            return { karaoke:true, musica:false, bares:false, ia:false, remoteQR:false };
  }
}

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
const _debouncePending = {};  // track pending data for graceful shutdown
function debouncedSave(filename, data, ms = 1000) {
  if (_debounceTimers[filename]) clearTimeout(_debounceTimers[filename]);
  _debouncePending[filename] = data;
  _debounceTimers[filename] = setTimeout(() => {
    saveJSON(filename, data);
    delete _debouncePending[filename];
  }, ms);
}

// Graceful shutdown: flush all pending debounced saves
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM — flushing pending saves...');
  for (const [filename, data] of Object.entries(_debouncePending)) {
    saveJSON(filename, data);
  }
  process.exit(0);
});

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

// ── Security Shield — Analizador de datos entrantes ─────────────────────────
const SECURITY_LOG_FILE = path.join(DATA_DIR, 'security_log.json');
const securityLog = loadJSON('security_log.json', { blocked: [], summary: { total: 0, byType: {} } });

// Patrones maliciosos que detecta el shield
const MALICIOUS_PATTERNS = [
  // XSS
  { name: 'xss_script',    rx: /<script[\s>]/i },
  { name: 'xss_event',     rx: /\bon\w+\s*=/i },
  { name: 'xss_javascript', rx: /javascript\s*:/i },
  { name: 'xss_data_uri',  rx: /data\s*:\s*text\/html/i },
  // SQL Injection
  { name: 'sqli_union',    rx: /\bUNION\s+(ALL\s+)?SELECT\b/i },
  { name: 'sqli_drop',     rx: /\bDROP\s+(TABLE|DATABASE)\b/i },
  { name: 'sqli_insert',   rx: /\bINSERT\s+INTO\b.*VALUES/i },
  { name: 'sqli_comment',  rx: /('|")\s*(OR|AND)\s+('|"|\d)/i },
  // Path Traversal
  { name: 'path_traversal', rx: /\.\.[\/\\]/g },
  { name: 'null_byte',     rx: /%00/g },
  // Command Injection
  { name: 'cmd_injection', rx: /[;&|`$]\s*(cat|ls|rm|wget|curl|nc|bash|sh|python|node|eval)\b/i },
  { name: 'cmd_backtick',  rx: /`[^`]+`/ },
  // NoSQL Injection
  { name: 'nosql_operator', rx: /\$(?:gt|gte|lt|lte|ne|in|nin|or|and|not|regex|where|exists)\b/i },
  // Template injection
  { name: 'ssti',          rx: /\{\{.*\}\}/g },
  // Encoded attacks
  { name: 'hex_encode',    rx: /\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}/i },
  // File upload signatures (virus/malware common headers)
  { name: 'exe_header',    rx: /^TVqQAAMAAAA/  },          // MZ header base64
  { name: 'elf_header',    rx: /^f0VMRg/  },               // ELF header base64
  { name: 'php_tag',       rx: /<\?php/i },
  { name: 'webshell',      rx: /\b(eval|assert|system|exec|passthru|shell_exec|popen)\s*\(/i }
];

function scanValue(val, depth = 0) {
  if (depth > 5) return null; // prevent deep recursion
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
    // Check keys too (NoSQL injection uses $gt etc as keys)
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

// Global rate limiter (per IP, all endpoints)
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
app.set('trust proxy', 1);  // Railway/nginx — necesario para rate limiting correcto
const server = http.createServer(app);
// ── CORS & Allowed Origins ─────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['*'];
const corsOptions = ALLOWED_ORIGINS.includes('*')
  ? {}
  : { origin: ALLOWED_ORIGINS };

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(cors(corsOptions));

// ── Stripe webhook (DEBE ir ANTES de express.json para recibir raw body) ────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(200).send('Stripe no configurado');
  const sig = req.headers['stripe-signature'];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { console.error('[Stripe] Webhook sig error:', err.message); return res.status(400).send('Bad sig'); }
  const subs = readSubs();
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const email = s.customer_details?.email || s.metadata?.email;
        if (email && s.subscription && s.customer) {
          subs.users[email] = { ...(subs.users[email]||{}), stripeCustomerId:s.customer, stripeSubscriptionId:s.subscription, status:'active', updatedAt:new Date().toISOString() };
          writeSubs(subs);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const price = sub.items?.data?.[0]?.price?.id;
        const plan = planFromPrice(price);
        const cust = await stripe.customers.retrieve(sub.customer);
        if (cust.email) {
          subs.users[cust.email] = { ...(subs.users[cust.email]||{}), plan, status:sub.status, stripeCustomerId:sub.customer, stripeSubscriptionId:sub.id, currentPeriodEnd:sub.current_period_end, updatedAt:new Date().toISOString() };
          writeSubs(subs);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        for (const email of Object.keys(subs.users)) {
          if (subs.users[email].stripeSubscriptionId === sub.id) {
            subs.users[email] = { ...subs.users[email], plan:'FREE', status:'canceled', updatedAt:new Date().toISOString() };
          }
        }
        writeSubs(subs);
        break;
      }
    }
    res.json({ received: true });
  } catch (err) { console.error('[Stripe] Webhook error:', err); res.status(500).send('Error'); }
});

app.use(express.json({ limit: '1mb' }));

// ── Security Shield Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // 1. Global rate limit (60 req/min per IP)
  if (!globalRateLimit(ip)) {
    logSecurityEvent('rate_limit', ip, `${req.method} ${req.path}`);
    return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
  }

  // 2. Block suspicious User-Agents (common scanners/bots)
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const suspiciousUA = ['sqlmap', 'nikto', 'nmap', 'masscan', 'dirbuster', 'gobuster',
    'hydra', 'metasploit', 'burpsuite', 'zap', 'nuclei', 'wfuzz', 'ffuf'];
  for (const s of suspiciousUA) {
    if (ua.includes(s)) {
      logSecurityEvent('scanner_blocked', ip, `UA: ${ua.slice(0, 100)}`);
      return res.status(403).json({ error: 'Acceso denegado' });
    }
  }

  // 3. Scan query params
  for (const [key, val] of Object.entries(req.query)) {
    const hit = scanValue(val);
    if (hit) {
      logSecurityEvent(hit, ip, `query.${key}=${String(val).slice(0, 100)}`);
      return res.status(400).json({ error: 'Solicitud bloqueada por seguridad' });
    }
  }

  // 4. Scan request body (POST/PUT/PATCH)
  if (req.body && typeof req.body === 'object') {
    const hit = scanValue(req.body);
    if (hit) {
      logSecurityEvent(hit, ip, `body: ${JSON.stringify(req.body).slice(0, 150)}`);
      return res.status(400).json({ error: 'Contenido bloqueado por seguridad' });
    }
  }

  // 5. Block path traversal in URL
  if (/\.\.[\/\\]/.test(req.path) || /%2e%2e/i.test(req.path)) {
    logSecurityEvent('path_traversal_url', ip, req.path);
    return res.status(400).json({ error: 'Ruta no permitida' });
  }

  next();
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

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

// ── Rooms (aislamiento por sesion) ──────────────────────────────────────────
// Cada DJ tiene su room. Remote viewers se unen al room del DJ.
// El teleprompter es POR ROOM, la cola/mesas son globales (del venue).
const rooms = {};  // { roomId: { teleprompter: { lyrics, currentWord, scrollSpeed, isPlaying } } }

function getRoom(roomId) {
  if (!roomId) return null;
  if (!rooms[roomId]) {
    rooms[roomId] = {
      teleprompter: { lyrics: '', currentWord: -1, scrollSpeed: 1, isPlaying: false },
      lastActive: Date.now()
    };
  }
  rooms[roomId].lastActive = Date.now();
  return rooms[roomId];
}

// Cleanup: rooms inactivos > 2h, _rateLimits viejos
setInterval(() => {
  const now = Date.now();
  for (const rid of Object.keys(rooms)) {
    const r = io.sockets.adapter.rooms.get(rid);
    if ((!r || r.size === 0) && now - rooms[rid].lastActive > 7200000) delete rooms[rid];
  }
  for (const ip of Object.keys(_rateLimits)) {
    if (now - _rateLimits[ip].first > 120000) delete _rateLimits[ip];
  }
}, 600000);  // cada 10 min

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
  // Whitelist: solo campos validos del teleprompter
  const allowed = ['lyrics', 'currentWord', 'scrollSpeed', 'isPlaying'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) state.teleprompter[key] = req.body[key];
  }
  debouncedSave('teleprompter.json', state.teleprompter);
  io.emit('tp_update', state.teleprompter);
  res.json(state.teleprompter);
});

// ── YouTube Search (proxy para evitar CORS) ─────────────────────────────────

// Piped instances (fallback sin API key)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt'
];

// Busqueda libre via Piped — NO necesita API key
app.get('/api/youtube/free-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Falta parametro: q' });

  let lastErr = 'Todos los servidores fallaron';
  for (const instance of PIPED_INSTANCES) {
    try {
      const r = await fetch(`${instance}/search?q=${encodeURIComponent(q)}&filter=videos`, {
        headers: { 'User-Agent': 'ByFlow/2.1' },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) { lastErr = `${instance}: HTTP ${r.status}`; continue; }
      const data = await r.json();
      const items = (data.items || []).filter(i => i.type === 'stream').slice(0, 12);

      // Convertir al formato que el frontend ya espera
      const formatted = {
        items: items.map(v => ({
          id: { videoId: v.url?.replace('/watch?v=', '') || '' },
          snippet: {
            title: v.title || '',
            channelTitle: v.uploaderName || '',
            thumbnails: {
              medium: { url: v.thumbnail || '' },
              default: { url: v.thumbnail || '' }
            }
          },
          // Piped ya trae duracion
          _duration: v.duration || 0
        }))
      };
      return res.json(formatted);
    } catch (e) {
      lastErr = `${instance}: ${e.message}`;
      continue;
    }
  }
  res.status(502).json({ error: 'Busqueda libre no disponible: ' + lastErr });
});

// Busqueda con API key de Google (metodo original)
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

// ── Grok AI proxy (protege API key en server-side) ───────────────────────
const GROK_API_KEY = process.env.GROK_API_KEY || '';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL   = process.env.GROK_MODEL || 'grok-3-mini';

app.post('/api/ai/chat', async (req, res) => {
  // License check — PRO required for AI
  const token = req.headers['x-license-token'] || '';
  if (!isFeatureLicensedByToken(token, 'ollama_ai')) {
    return res.status(403).json({ error: 'Requiere licencia PRO para usar IA' });
  }
  const { prompt, system } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt requerido' });
  }
  if (!GROK_API_KEY) {
    return res.status(503).json({ error: 'GFlow API key no configurada. Configura GROK_API_KEY en las variables de entorno de Railway.', backend: 'none' });
  }
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt.slice(0, 2000) });

    const r = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages,
        max_tokens: 1500,
        temperature: 0.8
      })
    });
    if (!r.ok) {
      const err = await r.text();
      const isBlocked = err.includes('blocked') || err.includes('leak');
      const msg = isBlocked
        ? 'API key bloqueada por x.ai. Genera una nueva en console.x.ai y configúrala en GROK_API_KEY.'
        : 'GFlow API error: ' + r.status;
      return res.status(r.status).json({ error: msg, detail: err });
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || 'Sin respuesta';
    res.json({
      text,
      backend: 'grok',
      model: GROK_MODEL,
      usage: data.usage || null
    });
  } catch (e) {
    res.status(500).json({ error: 'Error conectando con GFlow: ' + e.message });
  }
});

// Status endpoint para que el frontend sepa qué backends están disponibles
app.get('/api/ai/status', (req, res) => {
  res.json({
    grok: !!GROK_API_KEY,
    grokModel: GROK_MODEL,
    ollama: false // Ollama es local, el frontend checa directamente
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

// ── Security Log API (protegida con admin key) ──────────────────────────────
app.get('/api/security/log', (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin;
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key requerida' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const recent = securityLog.blocked.slice(-limit).reverse();
  res.json({
    total_blocked: securityLog.summary.total,
    by_type: securityLog.summary.byType,
    recent,
    shield_active: true
  });
});

// Limpiar log de seguridad
app.delete('/api/security/log', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key requerida' });
  }
  securityLog.blocked = [];
  securityLog.summary = { total: 0, byType: {} };
  saveJSON('security_log.json', securityLog);
  res.json({ ok: true, message: 'Log de seguridad limpiado' });
});

// Health
app.get('/api/health', (req, res) => res.json({
  status: 'ok', version: '2.1.0-shield', uptime: process.uptime(),
  ip: getLocalIp(), port: PORT,
  songs: state.canciones.length,
  queue: state.cola.length,
  shield: true,
  blocked_total: securityLog.summary.total
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket (Socket.IO) ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);
  io.emit('online_count', io.engine.clientsCount);

  let myRoom = null;

  // Cliente se une a un room (DJ crea, Remote se une)
  socket.on('join_room', (data) => {
    const roomId = (data && data.roomId) ? String(data.roomId).substring(0, 20) : null;
    if (!roomId) return;
    if (myRoom) socket.leave(myRoom);
    myRoom = roomId;
    socket.join(roomId);
    const room = getRoom(roomId);
    socket.emit('room_joined', { roomId, teleprompter: room.teleprompter });
    // Conteo de usuarios en este room
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    io.to(roomId).emit('room_count', roomSize);
    console.log(`[WS] ${socket.id} joined room ${roomId} (${roomSize} users)`);
  });

  socket.emit('init', {
    cola: state.cola, mesas: state.mesas,
    teleprompter: state.teleprompter,
    canciones: state.canciones
  });

  socket.on('tp_scroll', (data) => {
    if (myRoom) {
      const room = getRoom(myRoom);
      room.teleprompter.currentWord = data.currentWord ?? room.teleprompter.currentWord;
      room.teleprompter.isPlaying   = data.isPlaying   ?? room.teleprompter.isPlaying;
      socket.to(myRoom).emit('tp_update', room.teleprompter);
    } else {
      state.teleprompter.currentWord = data.currentWord ?? state.teleprompter.currentWord;
      state.teleprompter.isPlaying   = data.isPlaying   ?? state.teleprompter.isPlaying;
      debouncedSave('teleprompter.json', state.teleprompter);
      socket.broadcast.emit('tp_update', state.teleprompter);
    }
  });

  socket.on('tp_lyrics', (data) => {
    if (myRoom) {
      const room = getRoom(myRoom);
      room.teleprompter.lyrics = data.lyrics || '';
      room.teleprompter.currentWord = -1;
      io.to(myRoom).emit('tp_update', room.teleprompter);
    } else {
      state.teleprompter.lyrics = data.lyrics || '';
      state.teleprompter.currentWord = -1;
      saveJSON('teleprompter.json', state.teleprompter);
      io.emit('tp_update', state.teleprompter);
    }
  });

  socket.on('tp_speed', (data) => {
    if (myRoom) {
      const room = getRoom(myRoom);
      room.teleprompter.scrollSpeed = data.speed ?? 1;
      io.to(myRoom).emit('tp_speed_update', { speed: room.teleprompter.scrollSpeed });
    } else {
      state.teleprompter.scrollSpeed = data.speed ?? 1;
      debouncedSave('teleprompter.json', state.teleprompter);
      io.emit('tp_speed_update', { speed: state.teleprompter.scrollSpeed });
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
    if (myRoom) {
      const roomSize = io.sockets.adapter.rooms.get(myRoom)?.size || 0;
      io.to(myRoom).emit('room_count', roomSize);
    }
    io.emit('online_count', io.engine.clientsCount);
  });
});

// ── Stripe Billing endpoints (dormidos sin STRIPE_SECRET_KEY) ────────────────
app.post('/api/billing/checkout-session', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados todavia' });
  const { plan, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const priceId = plan === 'PRO_CREATOR' ? process.env.STRIPE_PRICE_PRO_CREATOR
                : plan === 'PRO_BAR' ? process.env.STRIPE_PRICE_PRO_BAR : null;
  if (!priceId) return res.status(400).json({ error: 'Plan invalido' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/?checkout=success`,
      cancel_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/?checkout=cancel`,
      customer_email: email,
      metadata: { plan, email }
    });
    res.json({ url: session.url });
  } catch (err) { console.error('[Stripe] Checkout error:', err.message); res.status(500).json({ error: 'Error al crear checkout' }); }
});

app.get('/api/billing/status', (req, res) => {
  const email = req.query.email;
  const subs = readSubs();
  const user = email ? subs.users[email] : null;
  const plan = user?.plan || 'FREE';
  res.json({ email: email||null, plan, status: user?.status||'inactive', features: featuresForPlan(plan) });
});

app.post('/api/billing/customer-portal', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados todavia' });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const subs = readSubs();
  const user = subs.users[email];
  if (!user?.stripeCustomerId) return res.status(404).json({ error: 'Cliente no encontrado' });
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app' });
    res.json({ url: session.url });
  } catch (err) { console.error('[Stripe] Portal error:', err.message); res.status(500).json({ error: 'Error al abrir portal' }); }
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
  console.log('   ADMIN KEY: ****** (ver .admin_secret o env ADMIN_SECRET)');
  console.log('   MASTER:    ****** (ver .master_admin o env MASTER_ADMIN)');
  console.log('  =============================================');
  console.log('');
});
