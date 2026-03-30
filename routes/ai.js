// ── AI (Grok proxy) — routes/ai.js ──────────────────────────────────────────

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.GFLOW_API_KEY || '';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL   = process.env.GROK_MODEL || 'grok-3-mini';

function registerRoutes(app, _state, helpers) {
  const { checkAiRateLimit } = helpers;

  app.post('/api/ai/chat', async (req, res) => {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkAiRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Limite de IA alcanzado (10/hora). Intenta mas tarde.' });
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
          ? 'API key bloqueada por x.ai. Genera una nueva en console.x.ai y configurala en GROK_API_KEY.'
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

  app.get('/api/ai/status', (req, res) => {
    res.json({
      grok: !!GROK_API_KEY,
      grokModel: GROK_MODEL,
      ollama: false,
      tts: !!GROK_API_KEY
    });
  });

  // GFlow genera LRC sincronizado para una cancion
  app.post('/api/ai/generate-lrc', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkAiRateLimit(clientIp)) return res.status(429).json({ ok: false, error: 'Limite alcanzado' });
    const { title, artist } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, error: 'Falta titulo' });
    if (!GROK_API_KEY) return res.status(503).json({ ok: false, error: 'API no configurada' });
    try {
      const r = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + GROK_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            { role: 'system', content: 'Eres un experto en musica. Genera letras sincronizadas en formato LRC con timestamps precisos. Solo devuelve el contenido LRC, sin explicaciones.' },
            { role: 'user', content: 'Genera LRC para "' + title + '"' + (artist ? ' de ' + artist : '') + '. Formato: [mm:ss.ms] Linea de letra' }
          ],
          max_tokens: 3000, temperature: 0.3
        })
      });
      const data = await r.json();
      const lrc = data.choices?.[0]?.message?.content || '';
      res.json({ ok: true, lrc, title, artist });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Buscar lyrics en LRCLIB
  app.get('/api/ai/search-lyrics', async (req, res) => {
    const q = req.query.q || '';
    if (!q) return res.status(400).json({ ok: false, results: [] });
    const results = [];
    try {
      const lr = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
      if (lr.ok) {
        const data = await lr.json();
        data.slice(0, 8).forEach(r => results.push({
          source: 'lrclib', title: r.trackName || '', artist: r.artistName || '',
          hasLRC: !!(r.syncedLyrics), lyrics: r.plainLyrics || '', lrc: r.syncedLyrics || ''
        }));
      }
    } catch (e) {}
    res.json({ ok: true, results, query: q });
  });

  // Grok TTS — texto a voz
  app.post('/api/ai/tts', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkAiRateLimit(clientIp)) return res.status(429).json({ ok: false, error: 'Limite alcanzado' });
    const { text, voice } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: 'Falta texto' });
    if (!GROK_API_KEY) return res.status(503).json({ ok: false, error: 'API no configurada' });
    try {
      const r = await fetch('https://api.x.ai/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + GROK_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-2-tts', input: text.substring(0, 4096), voice: voice || 'leo' })
      });
      if (!r.ok) return res.status(r.status).json({ ok: false, error: await r.text() });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = { registerRoutes };
