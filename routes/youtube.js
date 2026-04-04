// ── YouTube Search (proxy para evitar CORS) — routes/youtube.js ─────────────

// Piped instances (fallback sin API key) — actualizado 2026-04-04
// Piped es inestable; rotamos y cacheamos la instancia que responda
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.orangenet.cc'
];
let _lastWorkingPiped = null;
let _lastPipedCheck = 0;
const PIPED_CACHE_TTL = 300000; // 5 min

function resolveYouTubeKey(req) {
  const headerKey = typeof req.headers['x-youtube-key'] === 'string' ? req.headers['x-youtube-key'].trim() : '';
  const queryKey = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  return headerKey || queryKey || process.env.YOUTUBE_API_KEY || '';
}

function registerRoutes(app, _state, _helpers) {

  // Busqueda libre via Piped — NO necesita API key
  app.get('/api/youtube/free-search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Falta parametro: q' });

    // Intentar la instancia cacheada primero
    const now = Date.now();
    const orderedInstances = (_lastWorkingPiped && (now - _lastPipedCheck) < PIPED_CACHE_TTL)
      ? [_lastWorkingPiped, ...PIPED_INSTANCES.filter(i => i !== _lastWorkingPiped)]
      : PIPED_INSTANCES;

    let lastErr = 'Todos los servidores fallaron';
    for (const instance of orderedInstances) {
      try {
        const r = await fetch(`${instance}/search?q=${encodeURIComponent(q)}&filter=videos`, {
          headers: { 'User-Agent': 'ByFlow/2.1' },
          signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) { lastErr = `${instance}: HTTP ${r.status}`; continue; }
        const data = await r.json();
        // Piped a veces devuelve texto como "Service has been shutdown"
        if (!data.items && typeof data === 'string') { lastErr = `${instance}: servicio cerrado`; continue; }
        const items = (data.items || []).filter(i => i.type === 'stream').slice(0, 12);
        if (!items.length) { lastErr = `${instance}: sin resultados`; continue; }

        // Cache esta instancia como funcional
        _lastWorkingPiped = instance;
        _lastPipedCheck = Date.now();

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
            _duration: v.duration || 0
          }))
        };
        return res.json(formatted);
      } catch (e) {
        lastErr = `${instance}: ${e.message}`;
        continue;
      }
    }
    // Invalidar cache si ningun server respondio
    _lastWorkingPiped = null;
    res.status(502).json({ error: 'Busqueda libre no disponible. Configura una YouTube API key en Settings para mejores resultados.' });
  });

  // Busqueda con API key de Google (metodo original)
  app.get('/api/youtube/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken.trim() : '';
    const key = resolveYouTubeKey(req);
    if (!q || !key) return res.status(400).json({ error: 'Faltan parametros: q y key' });
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
    const ids = typeof req.query.ids === 'string' ? req.query.ids.trim().slice(0, 500) : '';
    const key = resolveYouTubeKey(req);
    if (!ids || !key) return res.status(400).json({ error: 'Faltan ids y key' });
    try {
      const params = new URLSearchParams({ part: 'contentDetails,snippet', id: ids, key: String(key).slice(0, 80) });
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: `YouTube API error: ${r.status}` });
      const d = await r.json();
      if (d.error) return res.status(d.error.code || 400).json({ error: d.error.message || 'YouTube API error' });
      res.json(d);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { registerRoutes };
