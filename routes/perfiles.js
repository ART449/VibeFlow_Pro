// ── Perfiles de Creador + Actividad — routes/perfiles.js ────────────────────
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PERFILES_FILE = path.join(__dirname, '..', 'data', 'perfiles.json');
const ACTIVIDAD_FILE = path.join(__dirname, '..', 'data', 'actividad.json');

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
  if (act.length > 500) act.splice(0, act.length - 500);
  writeActividad(act);
}

// Profile token store (with expiration)
const _profileTokens = new Map();
// Clean expired tokens every 30 min (24h lifetime)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of _profileTokens) {
    if (typeof data === 'string') { _profileTokens.delete(token); continue; }
    if (now - data.createdAt > 24 * 60 * 60 * 1000) _profileTokens.delete(token);
  }
}, 30 * 60 * 1000);

function registerRoutes(app, _state, helpers) {
  const { readLetrasBeat } = helpers;

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
}

module.exports = { registerRoutes, addActividad };
