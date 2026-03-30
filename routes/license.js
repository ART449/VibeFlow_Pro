// ── Licencias — routes/license.js ───────────────────────────────────────────
const crypto = require('crypto');
const os = require('os');

function registerRoutes(app, state, helpers) {
  const { saveJSON, checkRateLimit, ADMIN_SECRET, MASTER_ADMIN,
          LICENSE_SECRET, getDeviceFingerprint, getLicenseByToken } = helpers;

  function generateLicenseKey() {
    const payload = crypto.randomBytes(8).toString('hex').toUpperCase();
    const sig = crypto.createHmac('sha256', LICENSE_SECRET)
      .update(payload).digest('hex').slice(0, 4).toUpperCase();
    const raw = payload + sig;
    return `VFP-${raw.slice(0,5)}-${raw.slice(5,10)}-${raw.slice(10,15)}-${raw.slice(15,20)}`;
  }

  function validateKeySignature(key) {
    const clean = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 23 || !key.startsWith('VFP-')) return false;
    const raw = clean.slice(3);
    const payload = raw.slice(0, 16);
    const sig = raw.slice(16, 20);
    const expected = crypto.createHmac('sha256', LICENSE_SECRET)
      .update(payload).digest('hex').slice(0, 4).toUpperCase();
    return sig === expected;
  }

  // ── License status ──────────────────────────────────────────────────────────
  app.get('/api/license/status', (req, res) => {
    const gp = state.globalPromo;
    if (gp && gp.active) {
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

    const token = req.headers['x-license-token'] || req.query.token || '';
    if (token) {
      const lic = getLicenseByToken(token);
      if (lic) {
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
    return res.json({ activated: false, features: [] });
  });

  // ── Activate ────────────────────────────────────────────────────────────────
  app.post('/api/license/activate', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera 1 minuto.' });
    }
    const key = (req.body.key || '').trim().toUpperCase();
    // Demo key — PRO gratis por 1 hora, sin restriccion
    if (key === 'DEMO-BYFLOW-2026') {
      const demoToken = crypto.randomBytes(24).toString('hex');
      const demoExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return res.json({
        success: true, token: demoToken,
        features: ['bares', 'music_streaming', 'ollama_ai', 'youtube', 'ia', 'estudio', 'vistas', 'remote'],
        expiresAt: demoExpiry, demo: true,
        message: 'Demo PRO activado por 1 hora. Disfruta todas las funciones!'
      });
    }
    if (!validateKeySignature(key)) {
      return res.status(403).json({ error: 'Clave de licencia invalida' });
    }
    const entry = state.license.licenses.find(l => l.key === key);
    if (!entry) {
      return res.status(404).json({ error: 'Licencia no encontrada en el sistema' });
    }
    if (entry.activated && entry.userToken && req.body.token && entry.userToken !== req.body.token) {
      return res.status(409).json({ error: 'Esta licencia ya esta activada por otro usuario' });
    }
    const userToken = entry.userToken || crypto.randomBytes(24).toString('hex');
    entry.activated = true;
    entry.activatedAt = new Date().toISOString();
    entry.userToken = userToken;
    entry.deviceFingerprint = getDeviceFingerprint();
    saveJSON('licenses.json', state.license);
    res.json({
      success: true,
      features: entry.features,
      owner: entry.owner || '',
      keyFragment: key.slice(-9),
      token: userToken
    });
  });

  // ── Deactivate ──────────────────────────────────────────────────────────────
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

  // ── Admin: generate ─────────────────────────────────────────────────────────
  app.post('/api/license/admin/generate', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key invalida' });
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

  // ── Admin: bulk promo ───────────────────────────────────────────────────────
  app.post('/api/license/admin/promo', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key invalida' });
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

  // ── Admin: list ─────────────────────────────────────────────────────────────
  app.get('/api/license/admin/list', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key invalida' });
    }
    res.json(state.license.licenses);
  });

  // ── Admin: superuser ────────────────────────────────────────────────────────
  app.post('/api/license/admin/superuser', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key invalida' });
    }
    const ownerName = (req.body.owner || 'SUPERUSER-IARTLABS').trim();
    const allFeatures = ['bares', 'music_streaming', 'ollama_ai', 'stem_engine', 'dj_mode', 'analytics'];

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

  // ── Admin: global promo ─────────────────────────────────────────────────────
  app.post('/api/license/admin/global-promo', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key invalida' });
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
      return res.status(401).json({ error: 'Admin key invalida' });
    }
    res.json(state.globalPromo);
  });
}

module.exports = { registerRoutes };
