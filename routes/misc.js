// ── Miscellaneous endpoints — routes/misc.js ────────────────────────────────
// QR, teleprompter, stats, LRCLIB proxy, security log, config keys, ads, health

function registerRoutes(app, state, helpers) {
  const { saveJSON, loadJSON, debouncedSave, clampStr,
          getLocalIp, getRoom, isValidRoomAccess, stats, securityLog,
          ADMIN_SECRET, MASTER_ADMIN, PORT, server, io } = helpers;

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

  // Teleprompter state (deprecated for user-facing use — admin/debug only)
  app.get('/api/teleprompter', (req, res) => {
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : '';
    const roomToken = req.headers['x-room-token'] || req.query.roomToken || '';
    if (roomId) {
      if (!isValidRoomAccess(roomId, roomToken)) {
        return res.status(403).json({ error: 'Room token invalido o faltante' });
      }
      const room = getRoom(roomId, roomToken);
      return res.json(room.teleprompter);
    }
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key requerida' });
    }
    return res.json(state.teleprompter);
  });
  app.post('/api/teleprompter', (req, res) => {
    const roomId = req.body.roomId;
    const roomToken = req.headers['x-room-token'] || req.body.roomToken || req.query.roomToken || '';
    const allowed = ['lyrics', 'currentWord', 'scrollSpeed', 'isPlaying'];
    if (roomId) {
      if (!isValidRoomAccess(roomId, roomToken)) {
        return res.status(403).json({ error: 'Room token invalido o faltante' });
      }
      const room = getRoom(roomId, roomToken);
      for (const key of allowed) {
        if (req.body[key] !== undefined) room.teleprompter[key] = req.body[key];
      }
      io.to(roomId).emit('tp_update', room.teleprompter);
      return res.json(room.teleprompter);
    }
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET && adminKey !== MASTER_ADMIN) {
      return res.status(401).json({ error: 'Admin key requerida' });
    }
    for (const key of allowed) {
      if (req.body[key] !== undefined) state.teleprompter[key] = req.body[key];
    }
    debouncedSave('teleprompter.json', state.teleprompter);
    res.json(state.teleprompter);
  });

  // Stats
  app.get('/api/stats', (req, res) => {
    const topSongs = Object.entries(stats.songCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    const topSingers = Object.entries(stats.singerCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    const last7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      last7[key] = stats.dailyCounts[key] || 0;
    }
    res.json({
      totalSongs: stats.totalSongs, totalSingers: stats.totalSingers,
      topSongs, topSingers, last7,
      totalDays: Object.keys(stats.dailyCounts).length
    });
  });

  // LRCLIB proxy
  app.get('/api/lrclib/search', async (req, res) => {
    const track_name = typeof req.query.track_name === 'string' ? req.query.track_name.trim() : '';
    const artist_name = typeof req.query.artist_name === 'string' ? req.query.artist_name.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchTrack = track_name || q;
    if (!searchTrack) return res.status(400).json({ error: 'track_name o q requerido' });
    try {
      const params = new URLSearchParams({ track_name: searchTrack });
      if (artist_name) params.append('artist_name', artist_name);
      const r = await fetch(`https://lrclib.net/api/search?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: `LRCLIB responded with ${r.status}` });
      const d = await r.json();
      res.json(d);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Security Log API
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
      recent, shield_active: true
    });
  });

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

  // API Keys endpoint — only serve keys from env vars, no hardcoded fallbacks
  app.get('/api/config/keys', (req, res) => {
    res.json({
      youtubeConfigured: !!process.env.YOUTUBE_API_KEY,
      jamendo: process.env.JAMENDO_CLIENT_ID || '',
      ga: process.env.GA_MEASUREMENT_ID || ''
    });
  });

  // Ads
  app.get('/api/ads', (req, res) => {
    const defaults = [
      { id: 'pro', title: 'ByFlow PRO', text: 'Quita los anuncios y desbloquea todo. Desde $49/mes', cta: 'Activar PRO', url: '#pro', bg: 'linear-gradient(135deg, #ff006e, #7c4dff)' },
      { id: 'negocio', title: 'Anuncia tu negocio aqui', text: 'Llega a miles de usuarios en Aguascalientes. WhatsApp: 449-491-7648', cta: 'Contactar', url: 'https://wa.me/524494917648', bg: 'linear-gradient(135deg, #00b4d8, #0077b6)' },
      { id: 'espacio', title: 'Tu anuncio aqui', text: 'Espacio disponible para tu bar, restaurante o negocio local', cta: 'Mas info', url: 'https://wa.me/524494917648', bg: 'linear-gradient(135deg, #f97316, #ea580c)' }
    ];
    const rawAds = loadJSON('ads.json', defaults);
    const ads = (Array.isArray(rawAds) ? rawAds : defaults)
      .filter(ad => ad && typeof ad === 'object')
      .slice(0, 12)
      .map((ad, idx) => ({
        id: clampStr(ad.id || `ad_${idx + 1}`, 40),
        title: clampStr(ad.title || 'ByFlow', 80),
        text: clampStr(ad.text || '', 200),
        cta: clampStr(ad.cta || 'Ver', 40),
        url: clampStr(ad.url || '#', 300),
        bg: clampStr(ad.bg || defaults[0].bg, 120)
      }));
    res.json(ads.length ? ads : defaults);
  });

  // Analytics — cuantos usuarios, sesiones, para vender espacios publicitarios
  const _analytics = { sessions: 0, uniqueUsers: new Set(), pageViews: 0, lastReset: Date.now() };
  app.post('/api/analytics/ping', (req, res) => {
    const uid = req.body.uid || req.ip;
    _analytics.sessions++;
    _analytics.uniqueUsers.add(uid);
    _analytics.pageViews++;
    res.json({ ok: true });
  });
  app.get('/api/analytics/summary', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_SECRET) return res.status(403).json({ ok: false });
    const hoursUp = (Date.now() - _analytics.lastReset) / 3600000;
    res.json({
      ok: true,
      sessions: _analytics.sessions,
      uniqueUsers: _analytics.uniqueUsers.size,
      pageViews: _analytics.pageViews,
      hoursTracked: Math.round(hoursUp * 10) / 10,
      sessionsPerHour: hoursUp > 0 ? Math.round(_analytics.sessions / hoursUp * 10) / 10 : 0
    });
  });

  // Health
  app.get('/api/health', (req, res) => res.json({
    status: 'ok', version: '2.1.0-shield', uptime: process.uptime(),
    ip: getLocalIp(),
    port: (typeof server.address() === 'object' && server.address()) ? server.address().port : PORT,
    songs: state.canciones.length,
    queue: state.cola.length,
    shield: true,
    blocked_total: securityLog.summary.total
  }));

  // ── Error tracking from client ─────────────────
  const _clientErrors = [];
  const MAX_CLIENT_ERRORS = 200;

  app.post('/api/errors', (req, res) => {
    const { message, source, line, col, stack, url, ua } = req.body || {};
    if (!message) return res.json({ ok: false });
    _clientErrors.push({
      message: String(message).substring(0, 500),
      source: String(source || '').substring(0, 200),
      line: parseInt(line) || 0,
      col: parseInt(col) || 0,
      stack: String(stack || '').substring(0, 1000),
      url: String(url || '').substring(0, 200),
      ua: String(ua || '').substring(0, 200),
      ip: req.ip,
      ts: new Date().toISOString()
    });
    if (_clientErrors.length > MAX_CLIENT_ERRORS) _clientErrors.shift();
    res.json({ ok: true });
  });

  app.get('/api/errors', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_SECRET) return res.status(403).json({ ok: false });
    res.json({ ok: true, errors: _clientErrors, count: _clientErrors.length });
  });
}

module.exports = { registerRoutes };
