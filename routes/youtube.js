// ── YouTube Search (proxy para evitar CORS) — routes/youtube.js ─────────────

// Piped instances (fallback sin API key)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt'
];

function registerRoutes(app, _state, _helpers) {

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
    res.status(502).json({ error: 'Busqueda libre no disponible: ' + lastErr });
  });

  // Busqueda con API key de Google (metodo original)
  app.get('/api/youtube/search', async (req, res) => {
    const { q, key, pageToken } = req.query;
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
}

module.exports = { registerRoutes };
