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
function flushPendingSaves() {
  for (const [filename, data] of Object.entries(_debouncePending)) {
    saveJSON(filename, data);
  }
}
process.on('SIGTERM', () => { console.log('[SERVER] SIGTERM — flushing...'); flushPendingSaves(); process.exit(0); });
process.on('SIGINT',  () => { console.log('[SERVER] SIGINT — flushing...');  flushPendingSaves(); process.exit(0); });

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

// Per-user license lookup by token (returns entry even if expired — caller checks)
function getLicenseByToken(token) {
  if (!token) return null;
  const licenses = (state.license && state.license.licenses) || [];
  return licenses.find(l => l.activated && l.userToken === token) || null;
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

// ── Room-based auth middleware (backward compatible) ─────────────────────────
// If X-Room-ID header is present, validate it matches an active room.
// If no header, allow request (backward compatible with older clients).
function requireRoomAuth(req, res, next) {
  const roomId = req.headers['x-room-id'];
  if (!roomId) return next(); // backward compatible — no header = allow
  if (rooms[roomId]) return next(); // valid active room
  return res.status(403).json({ error: 'Room ID inválido o inactivo' });
}

// ── AI rate limiter (per IP, 10 requests/hour) ──────────────────────────────
const _aiRateLimits = {};
function checkAiRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 3600000; // 1 hour
  const MAX = 10;
  if (!_aiRateLimits[ip]) _aiRateLimits[ip] = [];
  _aiRateLimits[ip] = _aiRateLimits[ip].filter(t => now - t < WINDOW);
  if (_aiRateLimits[ip].length >= MAX) return false;
  _aiRateLimits[ip].push(now);
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

// ── Security Headers (helmet) ────
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
        workerSrc: ["'self'", "blob:"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
} catch(e) { console.log('[Security] helmet not loaded:', e.message); }
const server = http.createServer(app);
// ── CORS & Allowed Origins ─────────────────────────────────────────────────
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
        const plan = s.metadata?.plan || 'PRO_BAR';
        if (email && s.subscription && s.customer) {
          // 1. Guardar suscripcion
          subs.users[email] = { ...(subs.users[email]||{}), stripeCustomerId:s.customer, stripeSubscriptionId:s.subscription, status:'active', plan, updatedAt:new Date().toISOString() };

          // 2. Si es plan BAR/POS: generar licencia VFP automatica
          if (plan === 'PRO_BAR' || plan === 'POS_STARTER' || plan === 'POS_PRO' || plan === 'POS_VITALICIO') {
            const licenseKey = generateLicenseKey();
            const licenseEntry = {
              key: licenseKey,
              plan,
              email,
              type: 'pos',
              activated: true,
              activatedAt: new Date().toISOString(),
              stripeCustomerId: s.customer,
              stripeSubscriptionId: s.subscription
            };
            // Guardar licencia
            if (!subs.posLicenses) subs.posLicenses = {};
            subs.posLicenses[email] = licenseEntry;
            subs.users[email].posLicenseKey = licenseKey;
            subs.users[email].posActive = true;
            console.log('[Stripe] POS license auto-generated for', email, ':', licenseKey);
          }

          writeSubs(subs);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const price = sub.items?.data?.[0]?.price?.id;
        const plan = planFromPrice(price);
        try {
          const cust = await stripe.customers.retrieve(sub.customer);
          if (cust.email) {
            subs.users[cust.email] = { ...(subs.users[cust.email]||{}), plan, status:sub.status, stripeCustomerId:sub.customer, stripeSubscriptionId:sub.id, currentPeriodEnd:sub.current_period_end, updatedAt:new Date().toISOString() };
            writeSubs(subs);
          }
        } catch (custErr) {
          console.error('[Stripe] Error retrieving customer:', custErr.message);
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

// ── POS Eatertainment Module (DESPUES de express.json) ────
let _posReady = Promise.resolve();
try {
  const pos = require('./pos');
  // pos.init is async (sql.js requires async init) — resolved before server.listen
  _posReady = pos.init(app, io).catch(e => console.error('[POS] Init failed:', e.message));
} catch (e) {
  console.log('[POS] Module not loaded:', e.message);
}

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

// ── Auto-activar promo de lanzamiento SOLO si NUNCA existió una promo ────────
// Check activatedAt to know if a promo was ever created (even if now expired/inactive)
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
    if (!_rateLimits[ip].length || now - _rateLimits[ip][0] > 120000) delete _rateLimits[ip];
  }
  for (const ip of Object.keys(_aiRateLimits)) {
    if (!_aiRateLimits[ip].length || now - _aiRateLimits[ip][0] > 3600000) delete _aiRateLimits[ip];
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
  debouncedSave('canciones.json', state.canciones);
  res.json(song);
});

app.patch('/api/canciones/:id', (req, res) => {
  const song = state.canciones.find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  if (req.body.titulo !== undefined) song.titulo = clampStr(req.body.titulo, 200).trim();
  if (req.body.letra !== undefined) song.letra = clampStr(req.body.letra, 10000).trim();
  if (req.body.artista !== undefined) song.artista = clampStr(req.body.artista, 100).trim();
  debouncedSave('canciones.json', state.canciones);
  res.json(song);
});

app.delete('/api/canciones/:id', requireRoomAuth, (req, res) => {
  const idx = state.canciones.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Canción no encontrada' });
  state.canciones.splice(idx, 1);
  debouncedSave('canciones.json', state.canciones);
  res.json({ ok: true });
});

// ── Teleprompter state ───────────────────────────────────────────────────────
// NOTE: Global teleprompter state is DEPRECATED for user-facing use.
// Each user's teleprompter is local. This endpoint remains for admin/debug only.
app.get('/api/teleprompter', (req, res) => res.json(state.teleprompter));
app.post('/api/teleprompter', (req, res) => {
  // Only used by admin/DJ room setups — no global broadcast
  const roomId = req.body.roomId;
  const allowed = ['lyrics', 'currentWord', 'scrollSpeed', 'isPlaying'];
  if (roomId) {
    const room = getRoom(roomId);
    for (const key of allowed) {
      if (req.body[key] !== undefined) room.teleprompter[key] = req.body[key];
    }
    io.to(roomId).emit('tp_update', room.teleprompter);
    return res.json(room.teleprompter);
  }
  // Fallback: update global state but do NOT broadcast to all users
  for (const key of allowed) {
    if (req.body[key] !== undefined) state.teleprompter[key] = req.body[key];
  }
  debouncedSave('teleprompter.json', state.teleprompter);
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
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(r.status).json({ error: `YouTube API error: ${r.status}` });
    const d = await r.json();
    if (d.error) return res.status(d.error.code || 400).json({ error: d.error.message || 'Error en busqueda de YouTube' });
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/youtube/videos', async (req, res) => {
  const { ids, key } = req.query;
  if (!ids || !key) return res.status(400).json({ error: 'Faltan ids y key' });
  try {
    const params = new URLSearchParams({ part: 'contentDetails,snippet', id: String(ids).slice(0, 500), key: String(key).slice(0, 80) });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(r.status).json({ error: `YouTube API error: ${r.status}` });
    const d = await r.json();
    if (d.error) return res.status(d.error.code || 400).json({ error: d.error.message || 'YouTube API error' });
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
  // ── Global Promo: si está activo, TODOS tienen PRO gratis ──
  const gp = state.globalPromo;
  if (gp && gp.active) {
    // Check if promo expired
    if (gp.expiresAt && new Date(gp.expiresAt) < new Date()) {
      gp.active = false;
      saveJSON('global_promo.json', state.globalPromo);
    } else {
      return res.json({
        activated: true,
        features: gp.features,
        owner: gp.label || 'Promo Global',
        keyFragment: 'PROMO-FREE',
        expiresAt: gp.expiresAt,
        promo: true,
        globalPromo: true
      });
    }
  }

  // Per-user: client sends token via header or query
  const token = req.headers['x-license-token'] || req.query.token || '';
  if (token) {
    const lic = getLicenseByToken(token);
    if (lic) {
      // Check expiry
      if (lic.expiresAt && new Date(lic.expiresAt) < new Date()) {
        return res.json({ activated: false, features: [], expired: true, expiresAt: lic.expiresAt });
      }
      return res.json({
        activated: true,
        features: lic.features,
        owner: lic.owner || '',
        keyFragment: lic.key.slice(-9),
        expiresAt: lic.expiresAt || null,
        promo: lic.promo || false
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

// ── Bulk promo: genera N licencias con expiry ────────────────────────────
app.post('/api/license/admin/promo', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  const count = Math.min(parseInt(req.body.count) || 10, 100);
  const days = parseInt(req.body.days) || 30;
  const label = (req.body.label || 'Promo').trim();
  const features = Array.isArray(req.body.features) ? req.body.features : ['bares', 'music_streaming', 'ollama_ai'];
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const keys = [];
  for (let i = 0; i < count; i++) {
    const key = generateLicenseKey();
    const entry = {
      key, owner: `${label} #${i + 1}`, features,
      created: new Date().toISOString(),
      activated: false, activatedAt: null,
      deviceFingerprint: null, userToken: null,
      promo: true, expiresAt
    };
    state.license.licenses.push(entry);
    keys.push(key);
  }
  saveJSON('licenses.json', state.license);
  res.json({ count: keys.length, expiresAt, label, keys });
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

// ── Global Promo: PRO gratis para TODOS por N dias ──────────────────────────
app.post('/api/license/admin/global-promo', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  const action = (req.body.action || 'activate').toLowerCase();
  if (action === 'deactivate' || action === 'off') {
    state.globalPromo = { active: false, features: [], expiresAt: null, label: '' };
    saveJSON('global_promo.json', state.globalPromo);
    return res.json({ success: true, message: 'Promo global desactivada' });
  }
  const days = parseInt(req.body.days) || 7;
  const label = (req.body.label || 'Semana PRO Gratis').trim();
  const features = Array.isArray(req.body.features)
    ? req.body.features
    : ['bares', 'music_streaming', 'ollama_ai'];
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  state.globalPromo = { active: true, features, expiresAt, label, activatedAt: new Date().toISOString() };
  saveJSON('global_promo.json', state.globalPromo);
  console.log(`[PROMO] Global promo activada: "${label}" — ${days} dias — expira ${expiresAt}`);
  res.json({ success: true, label, days, features, expiresAt });
});

app.get('/api/license/admin/global-promo', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  res.json(state.globalPromo);
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
const GROK_API_KEY = process.env.GROK_API_KEY || process.env.GFLOW_API_KEY || '';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL   = process.env.GROK_MODEL || 'grok-3-mini';

app.post('/api/ai/chat', async (req, res) => {
  // Rate limit: max 10 requests/hour per IP
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkAiRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Límite de IA alcanzado (10/hora). Intenta más tarde.' });
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
    messages.push({ role: 'user', content: prompt.slice(0, 4000) });

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
      return res.status(r.status).json({ error: msg });
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

// ── Letras-Beat (Estudio de Beats) ────────────────────────────────────────
const LETRAS_BEAT_FILE = path.join(__dirname, 'data', 'letras-beat.json');

function readLetrasBeat() {
  try { return fs.existsSync(LETRAS_BEAT_FILE) ? JSON.parse(fs.readFileSync(LETRAS_BEAT_FILE, 'utf8')) : []; }
  catch { return []; }
}
function writeLetrasBeat(data) {
  try { fs.writeFileSync(LETRAS_BEAT_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[LetrasBeat] Write error:', e.message); }
}

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
  const sorted = [...letras].reverse(); // newest first
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
const _voteTracker = new Map(); // ip -> Set<letraId>
// Clean vote tracker every 6 hours to prevent memory leaks
setInterval(() => { _voteTracker.clear(); }, 6 * 60 * 60 * 1000);
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

// ── Noches de Talento (FASE 3) ───────────────────────────────────────────
const EVENTOS_FILE = path.join(__dirname, 'data', 'eventos.json');

function readEventos() {
  try { return fs.existsSync(EVENTOS_FILE) ? JSON.parse(fs.readFileSync(EVENTOS_FILE, 'utf8')) : []; }
  catch { return []; }
}
function writeEventos(data) {
  try { fs.writeFileSync(EVENTOS_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[Eventos] Write error:', e.message); }
}

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
    estado: 'abierto', // abierto | en_vivo | cerrado
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
const _eventoVoteTracker = new Map();
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

// ── Perfiles de Creador (FASE 2.5) ───────────────────────────────────────
const PERFILES_FILE = path.join(__dirname, 'data', 'perfiles.json');
const ACTIVIDAD_FILE = path.join(__dirname, 'data', 'actividad.json');

function readPerfiles() {
  try { return fs.existsSync(PERFILES_FILE) ? JSON.parse(fs.readFileSync(PERFILES_FILE, 'utf8')) : {}; }
  catch { return {}; }
}
function writePerfiles(data) {
  try { fs.writeFileSync(PERFILES_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[Perfiles] Write error:', e.message); }
}
function readActividad() {
  try { return fs.existsSync(ACTIVIDAD_FILE) ? JSON.parse(fs.readFileSync(ACTIVIDAD_FILE, 'utf8')) : []; }
  catch { return []; }
}
function writeActividad(data) {
  try { fs.writeFileSync(ACTIVIDAD_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[Actividad] Write error:', e.message); }
}
function addActividad(tipo, data) {
  const act = readActividad();
  act.push({ id: 'act_' + crypto.randomBytes(4).toString('hex'), tipo, ...data, fecha: new Date().toISOString() });
  if (act.length > 500) act.splice(0, act.length - 500); // keep last 500
  writeActividad(act);
}

// Profile token store (with expiration)
const _profileTokens = new Map(); // token -> { key, createdAt }
// Clean expired tokens every 30 min (24h lifetime)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of _profileTokens) {
    if (typeof data === 'string') { _profileTokens.delete(token); continue; }
    if (now - data.createdAt > 24 * 60 * 60 * 1000) _profileTokens.delete(token);
  }
}, 30 * 60 * 1000);

// POST — Registrar perfil
app.post('/api/perfiles/register', (req, res) => {
  const { alias, pin, nombre, bio } = req.body;
  if (!alias || !pin) return res.status(400).json({ error: 'alias y pin son requeridos' });
  if (alias.length > 30) return res.status(400).json({ error: 'alias max 30 caracteres' });
  if (pin.length < 4 || pin.length > 8) return res.status(400).json({ error: 'pin debe tener 4-8 digitos' });

  const perfiles = readPerfiles();
  const key = alias.toLowerCase().trim();
  if (perfiles[key]) return res.status(409).json({ error: 'Ese alias ya existe' });

  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  perfiles[key] = {
    alias: alias.trim().slice(0, 30),
    pinHash,
    nombre: String(nombre || alias).trim().slice(0, 50),
    bio: String(bio || '').trim().slice(0, 200),
    createdAt: new Date().toISOString()
  };
  writePerfiles(perfiles);
  const token = crypto.randomBytes(16).toString('hex');
  _profileTokens.set(token, { key, createdAt: Date.now() });
  res.status(201).json({ alias: perfiles[key].alias, nombre: perfiles[key].nombre, bio: perfiles[key].bio, token });
});

// POST — Login
app.post('/api/perfiles/login', (req, res) => {
  const { alias, pin } = req.body;
  if (!alias || !pin) return res.status(400).json({ error: 'alias y pin son requeridos' });

  const perfiles = readPerfiles();
  const key = alias.toLowerCase().trim();
  const perfil = perfiles[key];
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  if (pinHash !== perfil.pinHash) return res.status(401).json({ error: 'PIN incorrecto' });

  const token = crypto.randomBytes(16).toString('hex');
  _profileTokens.set(token, { key, createdAt: Date.now() });
  res.json({ alias: perfil.alias, nombre: perfil.nombre, bio: perfil.bio, token });
});

// GET — Perfil publico + stats
app.get('/api/perfiles/:alias', (req, res) => {
  const perfiles = readPerfiles();
  const key = req.params.alias.toLowerCase().trim();
  const perfil = perfiles[key];
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

  const letras = readLetrasBeat().filter(l => l.usuario.toLowerCase() === key);
  const publicadas = letras.filter(l => l.publicado);
  const votosTotal = letras.reduce((sum, l) => sum + (l.votos || 0), 0);

  res.json({
    alias: perfil.alias,
    nombre: perfil.nombre,
    bio: perfil.bio,
    stats: { letras: letras.length, publicadas: publicadas.length, votos: votosTotal },
    ultimasLetras: publicadas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5).map(l => ({
      id: l.id, titulo: l.titulo, votos: l.votos, fecha: l.fecha
    })),
    createdAt: perfil.createdAt
  });
});

// PUT — Actualizar perfil (requiere token)
app.put('/api/perfiles/:alias', (req, res) => {
  const token = req.headers['x-creator-token'];
  if (!token || !_profileTokens.has(token)) return res.status(401).json({ error: 'No autorizado' });

  const key = req.params.alias.toLowerCase().trim();
  const tokenData = _profileTokens.get(token);
  const tokenKey = typeof tokenData === 'string' ? tokenData : tokenData?.key;
  if (tokenKey !== key) return res.status(403).json({ error: 'Solo puedes editar tu perfil' });

  const perfiles = readPerfiles();
  if (!perfiles[key]) return res.status(404).json({ error: 'Perfil no encontrado' });

  const { nombre, bio } = req.body;
  if (nombre) perfiles[key] = { ...perfiles[key], nombre: nombre.trim().slice(0, 50) };
  if (bio !== undefined) perfiles[key] = { ...perfiles[key], bio: bio.trim().slice(0, 200) };
  writePerfiles(perfiles);
  res.json({ alias: perfiles[key].alias, nombre: perfiles[key].nombre, bio: perfiles[key].bio });
});

// GET — Feed de actividad
app.get('/api/actividad', (req, res) => {
  const act = readActividad();
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  res.json([...act].reverse().slice(0, limit));
});

// ── LRCLIB proxy (evita CORS issues en algunos navegadores) ──────────────
app.get('/api/lrclib/search', async (req, res) => {
  const { track_name, artist_name } = req.query;
  if (!track_name) return res.status(400).json({ error: 'track_name requerido' });
  try {
    const params = new URLSearchParams({ track_name });
    if (artist_name) params.append('artist_name', artist_name);
    const r = await fetch(`https://lrclib.net/api/search?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(r.status).json({ error: `LRCLIB responded with ${r.status}` });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Security Log API (protegida con admin key) ──────────────────────────────
app.get('/api/security/log', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
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

// API Keys endpoint — sirve keys desde env vars (NUNCA hardcodeadas)
app.get('/api/config/keys', (req, res) => {
  res.json({
    youtube_api_key: process.env.YOUTUBE_API_KEY || '',
    jamendo_client_id: process.env.JAMENDO_CLIENT_ID || ''
  });
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

// ── Stripe Billing endpoints (dormidos sin STRIPE_SECRET_KEY) ────────────────
app.post('/api/billing/checkout-session', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados todavia' });
  const { plan, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const priceMap = {
    'PRO_CREATOR': process.env.STRIPE_PRICE_PRO_CREATOR,
    'PRO_BAR': process.env.STRIPE_PRICE_PRO_BAR,
    'POS_STARTER': process.env.STRIPE_PRICE_POS_STARTER,
    'POS_PRO': process.env.STRIPE_PRICE_POS_PRO,
    'POS_VITALICIO': process.env.STRIPE_PRICE_POS_VITALICIO
  };
  const priceId = priceMap[plan] || null;
  if (!priceId) return res.status(400).json({ error: 'Plan invalido' });
  try {
    const isOneTime = plan === 'POS_VITALICIO';
    const session = await stripe.checkout.sessions.create({
      mode: isOneTime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/pos-demo.html?checkout=success&plan=${plan}`,
      cancel_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/pos-demo.html?checkout=cancel`,
      customer_email: email,
      metadata: { plan, email }
    });
    res.json({ url: session.url });
  } catch (err) { console.error('[Stripe] Checkout error:', err.message); res.status(500).json({ error: 'Error al crear checkout' }); }
});

// ── POS License verification ─────────────────────────────────────────────────
app.get('/api/pos/license', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 200) : '';
  const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const subs = readSubs();

  // Check by email
  if (email && subs.posLicenses && subs.posLicenses[email]) {
    const lic = subs.posLicenses[email];
    const user = subs.users?.[email] || {};
    const isActive = user.status === 'active' || lic.plan === 'POS_VITALICIO';
    return res.json({
      ok: true, active: isActive,
      plan: lic.plan, email,
      key: lic.key,
      activatedAt: lic.activatedAt
    });
  }

  // Check by license key
  if (key) {
    if (!validateKeySignature(key)) return res.json({ ok: false, error: 'Licencia invalida' });
    for (const [e, lic] of Object.entries(subs.posLicenses || {})) {
      if (lic.key === key) {
        const user = subs.users?.[e] || {};
        const isActive = user.status === 'active' || lic.plan === 'POS_VITALICIO';
        return res.json({ ok: true, active: isActive, plan: lic.plan, email: e, key });
      }
    }
  }

  res.json({ ok: false, error: 'No se encontro licencia POS para este email o clave' });
});

app.get('/api/billing/status', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 200) : '';
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const subs = readSubs();
  if (!subs.users || typeof subs.users !== 'object') return res.json({ email, plan: 'FREE', status: 'inactive', features: featuresForPlan('FREE') });
  const user = Object.prototype.hasOwnProperty.call(subs.users, email) ? subs.users[email] : null;
  const plan = user?.plan || 'FREE';
  res.json({ email, plan, status: user?.status||'inactive', features: featuresForPlan(plan) });
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

  // Cliente se une a un room (DJ crea, Remote se une)
  socket.on('join_room', (data) => {
    try {
      if (++_roomJoins > 10) return; // rate limit: max 10 joins per connection
      const roomId = (data && data.roomId) ? String(data.roomId).substring(0, 20) : null;
      if (!roomId) return;
      if (myRoom) socket.leave(myRoom);
      myRoom = roomId;
      socket.join(roomId);
      const room = getRoom(roomId);
      socket.emit('room_joined', { roomId, teleprompter: room.teleprompter });
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit('room_count', roomSize);
    } catch (err) {
      console.error(`[WS] join_room error: ${err.message}`);
    }
  });

  // Init: cola/mesas/canciones are shared; teleprompter is per-session (NOT global)
  socket.emit('init', {
    cola: state.cola, mesas: state.mesas,
    canciones: state.canciones
  });

  socket.on('tp_scroll', (data) => {
    const word = typeof data.currentWord === 'number' ? data.currentWord : undefined;
    const playing = typeof data.isPlaying === 'boolean' ? data.isPlaying : undefined;
    if (myRoom) {
      // In a room: share with room members (DJ → Remote screen)
      const room = getRoom(myRoom);
      if (word !== undefined) room.teleprompter.currentWord = word;
      if (playing !== undefined) room.teleprompter.isPlaying = playing;
      socket.to(myRoom).emit('tp_update', room.teleprompter);
    }
    // Without room: teleprompter is local-only, no broadcast needed
  });

  socket.on('tp_lyrics', (data) => {
    const lyrics = typeof data.lyrics === 'string' ? data.lyrics.slice(0, 50000) : '';
    if (myRoom) {
      // In a room: share lyrics with all room members
      const room = getRoom(myRoom);
      room.teleprompter.lyrics = lyrics;
      room.teleprompter.currentWord = -1;
      io.to(myRoom).emit('tp_update', room.teleprompter);
    }
    // Without room: lyrics are local-only (client handles its own state)
  });

  socket.on('tp_speed', (data) => {
    const speed = Math.max(0.1, Math.min(10, Number(data.speed) || 1));
    if (myRoom) {
      // In a room: share speed with room members
      const room = getRoom(myRoom);
      room.teleprompter.scrollSpeed = speed;
      io.to(myRoom).emit('tp_speed_update', { speed });
    }
    // Without room: speed is local-only
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

// ── Arranque (await POS async init before listening) ─────────────────────
_posReady.then(() => server.listen(PORT, HOST, () => {
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
}));
