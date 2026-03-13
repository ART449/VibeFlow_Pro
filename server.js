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

// Room state tracking
const rooms = new Map();

// Promotional content pool
const PROMO_CONTENT = {
  karaoke: [
    'promo_happy_hour.mp4',
    'promo_restaurante.mp4',
    'promo_bebidas.mp4'
  ],
  studio: [
    'tip_microphone_distance.mp4',
    'promo_vocal_coaching.mp4',
    'tip_breath_control.mp4',
    'promo_mixing_package.mp4'
  ],
  idle: [
    'promo_karaoke_night.mp4',
    'promo_studio_session.mp4',
    'promo_menu_especial.mp4'
  ]
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==========================================
// GROK AI DETECTION ENDPOINTS
// ==========================================

// Grok sends screen analysis results here
app.post('/api/grok/analyze', (req, res) => {
  const {
    roomId,
    frameAnalysis,
    audioLevel,
    ocrText,
    confidence
  } = req.body;

  if (!roomId || !frameAnalysis) {
    return res.status(400).json({ error: 'roomId and frameAnalysis are required' });
  }

  const room = rooms.get(roomId) || { mode: 'idle', lastEvent: null };

  if (confidence > 0.8) {
    switch (frameAnalysis) {
      case 'karaoke_song_ending':
        handleKaraokeTransition(roomId);
        break;
      case 'studio_recording_stopped':
        handleStudioBreak(roomId);
        break;
      case 'room_empty':
        handleIdleMode(roomId);
        break;
      case 'crowd_engagement_high':
        handleViralMoment(roomId);
        break;
    }
  }

  rooms.set(roomId, {
    ...room,
    lastAnalysis: Date.now(),
    lastFrameAnalysis: frameAnalysis,
    audioLevel,
    ocrText
  });

  res.json({ processed: true, actionTaken: frameAnalysis });
});

// ==========================================
// KARAOKE ENDPOINTS
// ==========================================

app.post('/api/karaoke/song-end', (req, res) => {
  const { roomId, confidence } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }

  if (confidence > 0.85) {
    handleKaraokeTransition(roomId);
  }

  res.json({ next: 'awaiting-selection' });
});

// ==========================================
// STUDIO ENDPOINTS
// ==========================================

app.post('/api/studio/take-break', (req, res) => {
  const { boothId, lastTakeDuration } = req.body;

  if (!boothId) {
    return res.status(400).json({ error: 'boothId is required' });
  }

  let content;
  if (lastTakeDuration < 30) {
    content = 'tip_breath_control.mp4';
  } else {
    content = 'promo_mixing_package.mp4';
  }

  io.to(boothId).emit('studio-overlay', {
    content,
    duration: 10000,
    skippable: true
  });

  res.json({ status: 'break-content-shown' });
});

// ==========================================
// YOUTUBE SEARCH (planned)
// ==========================================

app.get('/api/youtube/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  // Placeholder — will integrate YouTube Data API
  res.json({ query, results: [], message: 'YouTube integration pending' });
});

// ==========================================
// ADMIN / DASHBOARD
// ==========================================

app.get('/api/rooms/status', (req, res) => {
  const status = Array.from(rooms.entries()).map(([id, data]) => ({
    roomId: id,
    mode: data.mode,
    lastActivity: data.lastAnalysis,
    lastFrameAnalysis: data.lastFrameAnalysis
  }));
  res.json(status);
});

app.post('/api/admin/force-promo', (req, res) => {
  const { roomId, promoId, duration } = req.body;

  if (!roomId || !promoId) {
    return res.status(400).json({ error: 'roomId and promoId are required' });
  }

  io.to(roomId).emit('force-overlay', {
    content: promoId,
    duration: duration || 15000
  });

  res.json({ forced: true });
});

// ==========================================
// OWNER DETECTION — MAINTENANCE MODE
// ==========================================

app.post('/api/grok/owner-detected', (req, res) => {
  const { roomId, present } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    rooms: rooms.size,
    timestamp: new Date().toISOString()
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

  io.to(boothId).emit('studio-overlay', {
    content: tip,
    duration: 10000,
    skippable: true
  });

  updateRoomMode(boothId, 'studio_break');
  console.log(`[${boothId}] Studio break → Tip: ${tip}`);
}

function handleIdleMode(roomId) {
  const promo = pickRandom(PROMO_CONTENT.idle);

  io.to(roomId).emit('idle-screensaver', {
    content: promo,
    loop: true
  });

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
// WEBSOCKET — REAL-TIME DISPLAY CONTROL
// ==========================================

io.on('connection', (socket) => {
  console.log(`Display connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    updateRoomMode(roomId, 'connected');
    console.log(`Display ${socket.id} joined room ${roomId}`);
  });

  socket.on('karaoke-select-song', (data) => {
    io.to(data.roomId).emit('cancel-overlay');
    io.to(data.roomId).emit('load-song', data.songId);
    updateRoomMode(data.roomId, 'karaoke_playing');
  });

  socket.on('studio-start-recording', (boothId) => {
    io.to(boothId).emit('clear-overlay');
    io.to(boothId).emit('recording-started');
    updateRoomMode(boothId, 'studio_recording');
  });

  socket.on('disconnect', () => {
    console.log(`Display disconnected: ${socket.id}`);
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`VibeFlow Pro running on port ${PORT}`);
  console.log(`Display UI: http://localhost:${PORT}/display.html?room=sala1`);
  console.log(`Health:     http://localhost:${PORT}/api/health`);
});
