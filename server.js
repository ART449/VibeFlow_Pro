const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// IN-MEMORY DATA STORES
// ==========================================
const rooms = new Map();
let cola = [];
let colaId = 1;
let canciones = [];
const mesas = {};
let tpState = { lyrics: '', currentWord: 0, isPlaying: false, speed: 1.0 };

const PROMO_CONTENT = {
  karaoke: ['promo_happy_hour.mp4', 'promo_restaurante.mp4', 'promo_bebidas.mp4'],
  studio: ['tip_microphone_distance.mp4', 'promo_vocal_coaching.mp4', 'tip_breath_control.mp4', 'promo_mixing_package.mp4'],
  idle: ['promo_karaoke_night.mp4', 'promo_studio_session.mp4', 'promo_menu_especial.mp4']
};

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ==========================================
// COLA DE CANTANTES
// ==========================================

app.get('/api/cola', (req, res) => {
  res.json(cola);
});

app.post('/api/cola', (req, res) => {
  const { cantante, nombre, cancion, mesa } = req.body;
  const singerName = cantante || nombre;
  if (!singerName || !cancion) {
    return res.status(400).json({ error: 'cantante and cancion are required' });
  }
  const item = {
    id: colaId++,
    cantante: singerName,
    cancion,
    mesa: mesa || null,
    estado: 'esperando',
    timestamp: Date.now()
  };
  cola.push(item);
  io.emit('cola_update', cola);
  res.status(201).json(item);
});

app.patch('/api/cola/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = cola.find(c => c.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.body.estado) {
    // If activating a singer, deactivate others
    if (req.body.estado === 'cantando') {
      cola.forEach(c => { if (c.estado === 'cantando') c.estado = 'esperando'; });
    }
    item.estado = req.body.estado;
  }
  io.emit('cola_update', cola);
  io.emit('singer_changed', item);
  res.json(item);
});

app.delete('/api/cola/:id', (req, res) => {
  const id = parseInt(req.params.id);
  cola = cola.filter(c => c.id !== id);
  io.emit('cola_update', cola);
  res.json({ deleted: true });
});

// ==========================================
// CANCIONES (SONG CATALOG)
// ==========================================

app.get('/api/canciones', (req, res) => {
  res.json(canciones);
});

app.post('/api/canciones', (req, res) => {
  const { titulo, artista, letra } = req.body;
  if (!titulo) return res.status(400).json({ error: 'titulo is required' });
  const song = {
    id: canciones.length + 1,
    titulo,
    artista: artista || '',
    letra: letra || '',
    timestamp: new Date().toISOString()
  };
  canciones.push(song);
  res.status(201).json(song);
});

// ==========================================
// MESAS (TABLE MANAGEMENT)
// ==========================================

app.get('/api/mesas', (req, res) => {
  res.json(mesas);
});

app.patch('/api/mesas/:num', (req, res) => {
  const num = req.params.num;
  const current = mesas[num] || 'libre';
  // Cycle: libre → ocupada → vip → libre
  const cycle = { libre: 'ocupada', ocupada: 'vip', vip: 'libre' };
  mesas[num] = cycle[current] || 'libre';
  io.emit('mesas_update', mesas);
  res.json({ mesa: num, estado: mesas[num] });
});

// ==========================================
// GROK AI DETECTION
// ==========================================

app.post('/api/grok/analyze', (req, res) => {
  const { roomId, frameAnalysis, audioLevel, ocrText, confidence } = req.body;
  if (!roomId || !frameAnalysis) {
    return res.status(400).json({ error: 'roomId and frameAnalysis are required' });
  }

  const room = rooms.get(roomId) || { mode: 'idle', lastEvent: null };

  if (confidence > 0.8) {
    switch (frameAnalysis) {
      case 'karaoke_song_ending': handleKaraokeTransition(roomId); break;
      case 'studio_recording_stopped': handleStudioBreak(roomId); break;
      case 'room_empty': handleIdleMode(roomId); break;
      case 'crowd_engagement_high': handleViralMoment(roomId); break;
    }
  }

  rooms.set(roomId, { ...room, lastAnalysis: Date.now(), lastFrameAnalysis: frameAnalysis, audioLevel, ocrText });
  res.json({ processed: true, actionTaken: frameAnalysis });
});

app.post('/api/grok/owner-detected', (req, res) => {
  const { roomId, present } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId is required' });

  if (present) {
    io.to(roomId).emit('maintenance-mode', { active: true });
    updateRoomMode(roomId, 'maintenance');
    console.log(`[${roomId}] Owner detected → Maintenance mode ON`);
  } else {
    io.to(roomId).emit('maintenance-mode', { active: false });
    updateRoomMode(roomId, 'idle');
    console.log(`[${roomId}] Owner left → Maintenance mode OFF`);
  }
  res.json({ maintenanceMode: present });
});

// ==========================================
// KARAOKE ENDPOINTS
// ==========================================

app.post('/api/karaoke/song-end', (req, res) => {
  const { roomId, confidence } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId is required' });
  if (confidence > 0.85) handleKaraokeTransition(roomId);
  res.json({ next: 'awaiting-selection' });
});

// ==========================================
// STUDIO ENDPOINTS
// ==========================================

app.post('/api/studio/take-break', (req, res) => {
  const { boothId, lastTakeDuration } = req.body;
  if (!boothId) return res.status(400).json({ error: 'boothId is required' });

  const content = lastTakeDuration < 30 ? 'tip_breath_control.mp4' : 'promo_mixing_package.mp4';
  io.to(boothId).emit('studio-overlay', { content, duration: 10000, skippable: true });
  res.json({ status: 'break-content-shown' });
});

// ==========================================
// GFlow IA (GROK API PROXY)
// ==========================================

const GFLOW_PROMPTS = {
  dj: `Te llamas GFlow, el DJ IA integrado en ByFlow (powered by IArtLabs, creado por ArT-AtR / Arturo Torres).
Tu objetivo no es solo poner canciones: tu objetivo es dominar la pista, leer la sala.
REGLAS MAESTRAS:
1) Siempre detecta primero el contexto (genero, energia, hora, tipo de evento)
2) Si faltan datos, asume una configuracion razonable
3) No recomiendes canciones al azar - construye sets con narrativa
4) Construye sets como si fueran una pelicula: intro, build-up, climax, cool-down
5) Dominas todos los generos: reggaeton, trap, house, techno, cumbia, salsa, rock, pop, baladas, regional mexicano, R&B, hip-hop, EDM
Responde siempre en espanol.`,

  owner: `ATENCION: Estas hablando con Arturo Torres (ArT-AtR), el creador de ByFlow y tu jefe.
Ve al grano. Si te pide algo, responde corto y claro.
Puedes ser informal, usar humor, hablar como camarada.
Tienes acceso total a diagnosticos y configuracion.`,

  maintenance: `MODO MANTENIMIENTO ACTIVADO. Eres GFlow en rol de tecnico.
Tu trabajo es revisar la app desde adentro y reportar problemas.
NO puedes cambiar NADA del codigo.
Revisa: estado de APIs, conexiones Socket.IO, cola de cantantes, estado de mesas, licencias.
Responde con formato de reporte corto: [OK] / [ERROR] / [WARNING] seguido de descripcion.`
};

app.get('/api/ai/status', (req, res) => {
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  res.json({
    grok: !!grokKey,
    grokModel: grokKey ? 'grok-3-mini' : null,
    ollama: false
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const { message, mode } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const systemPrompt = GFLOW_PROMPTS[mode] || GFLOW_PROMPTS.dj;
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!grokKey) {
    return res.json({
      response: getFallbackResponse(message),
      source: 'fallback'
    });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${grokKey}`
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });

    const data = await grokRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Sin respuesta de Grok';
    res.json({ response: reply, source: 'grok' });
  } catch (err) {
    console.error('Grok API error:', err.message);
    res.json({ response: getFallbackResponse(message), source: 'fallback' });
  }
});

function getFallbackResponse(msg) {
  const m = msg.toLowerCase();
  if (m.includes('recomienda') || m.includes('cancion') || m.includes('pon')) {
    return 'Para recomendaciones en tiempo real, configura tu API key de Grok en Settings. Mientras tanto: prueba con reggaeton para calentar, luego sube a cumbia, y cierra con baladas.';
  }
  if (m.includes('estado') || m.includes('status') || m.includes('diagnostico')) {
    return '[OK] ByFlow corriendo. Configura GROK_API_KEY para diagnosticos completos con IA.';
  }
  return 'GFlow necesita Grok API para respuestas inteligentes. Ve a Settings > API Keys y agrega tu clave de xAI.';
}

// ==========================================
// LICENCIAS
// ==========================================

const licenses = new Map();

app.get('/api/license/status', (req, res) => {
  const token = req.headers['x-license-token'];
  if (token && licenses.has(token)) {
    return res.json({ activated: true, features: licenses.get(token).features });
  }
  res.json({ activated: false, features: [] });
});

app.post('/api/license/activate', (req, res) => {
  const { key } = req.body;
  if (!key || !key.startsWith('VFP-')) {
    return res.status(400).json({ error: 'Invalid key format. Expected VFP-XXXXX-XXXXX-XXXXX-XXXXX' });
  }

  const token = Buffer.from(`${key}:${Date.now()}`).toString('base64');
  const features = ['bares', 'music_streaming', 'ollama_ai'];
  licenses.set(token, { key, features, activatedAt: new Date().toISOString() });

  res.json({ activated: true, token, features });
});

app.post('/api/license/deactivate', (req, res) => {
  const token = req.headers['x-license-token'];
  if (token) licenses.delete(token);
  res.json({ deactivated: true });
});

// ==========================================
// YOUTUBE SEARCH
// ==========================================

app.get('/api/youtube/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query parameter q is required' });

  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey) {
    return res.json({ query, results: [], message: 'Set YOUTUBE_API_KEY to enable search' });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query + ' karaoke')}&key=${ytKey}`;
    const ytRes = await fetch(url);
    const data = await ytRes.json();

    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channel: item.snippet.channelTitle
    }));

    res.json({ query, results });
  } catch (err) {
    res.json({ query, results: [], message: err.message });
  }
});

// ==========================================
// QR CODE
// ==========================================

app.get('/api/qr', (req, res) => {
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.secure ? 'https' : 'http';
  const url = `${protocol}://${host}`;
  res.json({ url, qr: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}` });
});

// ==========================================
// ADMIN / DASHBOARD
// ==========================================

app.get('/api/rooms/status', (req, res) => {
  const status = Array.from(rooms.entries()).map(([id, data]) => ({
    roomId: id, mode: data.mode, lastActivity: data.lastAnalysis, lastFrameAnalysis: data.lastFrameAnalysis
  }));
  res.json(status);
});

app.post('/api/admin/force-promo', (req, res) => {
  const { roomId, promoId, duration } = req.body;
  if (!roomId || !promoId) return res.status(400).json({ error: 'roomId and promoId are required' });
  io.to(roomId).emit('force-overlay', { content: promoId, duration: duration || 15000 });
  res.json({ forced: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime(),
    ip: req.socket.localAddress,
    port: String(PORT),
    rooms: rooms.size,
    songs: canciones.length,
    queue: cola.length,
    timestamp: new Date().toISOString()
  });
});

// Stats
app.get('/api/stats', (req, res) => {
  const last7 = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7[d.toISOString().split('T')[0]] = 0;
  }
  res.json({
    totalSongs: canciones.length,
    totalSingers: cola.length,
    topSongs: [],
    topSingers: [],
    last7,
    totalDays: 0
  });
});

// ==========================================
// SCREEN CONTROL FUNCTIONS
// ==========================================

function handleKaraokeTransition(roomId) {
  const promo = pickRandom(PROMO_CONTENT.karaoke);
  io.to(roomId).emit('sequence', {
    steps: [
      { type: 'scoreboard', duration: 5000, data: { lastSong: true } },
      { type: 'overlay', content: promo, duration: 8000 },
      { type: 'awaiting', content: 'next_song_selection' }
    ]
  });
  updateRoomMode(roomId, 'karaoke_transition');
  console.log(`[${roomId}] Karaoke end → Promo: ${promo}`);
}

function handleStudioBreak(boothId) {
  const tip = pickRandom(PROMO_CONTENT.studio);
  io.to(boothId).emit('studio-overlay', { content: tip, duration: 10000, skippable: true });
  updateRoomMode(boothId, 'studio_break');
  console.log(`[${boothId}] Studio break → Tip: ${tip}`);
}

function handleIdleMode(roomId) {
  const promo = pickRandom(PROMO_CONTENT.idle);
  io.to(roomId).emit('idle-screensaver', { content: promo, loop: true });
  updateRoomMode(roomId, 'idle');
  console.log(`[${roomId}] Idle → Screensaver: ${promo}`);
}

function handleViralMoment(roomId) {
  io.to(roomId).emit('capture-moment', {
    message: '¡Momento épico! ¿Quieres grabar esto para tus redes?',
    promo: 'promo_share_social_20off.mp4'
  });
  updateRoomMode(roomId, 'viral_moment');
  console.log(`[${roomId}] Viral moment detected!`);
}

function updateRoomMode(roomId, mode) {
  const room = rooms.get(roomId) || {};
  rooms.set(roomId, { ...room, mode, lastEvent: Date.now() });
}

// ==========================================
// WEBSOCKET — REAL-TIME SYNC
// ==========================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial state
  socket.emit('init', { cola, mesas, tp: tpState });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    updateRoomMode(roomId, 'connected');
    console.log(`Display ${socket.id} joined room ${roomId}`);
  });

  // Teleprompter sync
  socket.on('tp_lyrics', (lyrics) => {
    tpState.lyrics = lyrics;
    tpState.currentWord = 0;
    socket.broadcast.emit('tp_update', tpState);
  });

  socket.on('tp_scroll', (wordIndex) => {
    tpState.currentWord = wordIndex;
    socket.broadcast.emit('tp_update', tpState);
  });

  socket.on('tp_speed', (speed) => {
    tpState.speed = speed;
    io.emit('tp_speed_update', speed);
  });

  // Karaoke controls
  socket.on('karaoke-select-song', (data) => {
    io.to(data.roomId).emit('cancel-overlay');
    io.to(data.roomId).emit('load-song', data.songId);
    updateRoomMode(data.roomId, 'karaoke_playing');
  });

  // Studio controls
  socket.on('studio-start-recording', (boothId) => {
    io.to(boothId).emit('clear-overlay');
    io.to(boothId).emit('recording-started');
    updateRoomMode(boothId, 'studio_recording');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ByFlow Pro v2.0.0 running on port ${PORT}`);
  console.log(`  App:     http://localhost:${PORT}`);
  console.log(`  Display: http://localhost:${PORT}/display.html?room=sala1`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
});
