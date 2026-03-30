(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const socketModule = VF.modules.socket = {};

  var _karaokeDisplayWin = null;

  function loadSocketIO() {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = '/socket.io/socket.io.js';
      s.onload = () => resolve(true);
      s.onerror = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
        s2.onload = () => resolve(true);
        s2.onerror = () => resolve(false);
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  socketModule.copyRoomLink = function() {
    const base = window.location.origin + '/?room=' + _myRoomId;
    navigator.clipboard.writeText(base).then(() => {
      showToast('Link de sala copiado: ' + base);
    }).catch(() => {
      prompt('Copia este link para compartir tu sala:', base);
    });
  };

  socketModule.showRoomBadge = function() {
    const badge = document.getElementById('room-badge');
    const display = document.getElementById('room-id-display');
    if (badge) badge.style.display = '';
    if (display) display.textContent = _myRoomId;
    const btnDisplay = document.getElementById('btn-open-display');
    if (btnDisplay) btnDisplay.style.display = 'flex';
  };

  socketModule.openKaraokeDisplay = function() {
    const url = location.origin + '/remote?room=' + _myRoomId;
    if (_karaokeDisplayWin && !_karaokeDisplayWin.closed) {
      _karaokeDisplayWin.focus();
      showToast('Pantalla de karaoke ya esta abierta');
      return;
    }
    _karaokeDisplayWin = window.open(url, 'byflow-karaoke-display', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no');
    if (_karaokeDisplayWin) {
      showToast('Pantalla de karaoke abierta');
    } else {
      showToast('Popup bloqueado', 'warning');
    }
  };

  socketModule.connectSocket = async function() {
    const loaded = await loadSocketIO();
    if (!loaded || typeof io === 'undefined') return;
    if (socket && socket.connected) return;
    socket = io(SOCKET_URL, { reconnectionDelay: 2000, reconnectionDelayMax: 10000 });
    let lastInit = 0;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId: _myRoomId });
    });

    socket.on('room_joined', (data) => {
      if (data.teleprompter && data.teleprompter.lyrics) setLyrics(data.teleprompter.lyrics);
      socketModule.showRoomBadge();
    });

    socket.on('room_count', (n) => {
      const el = document.getElementById('online-count');
      const num = document.getElementById('online-num');
      if (el && num) {
        num.textContent = n;
        el.style.display = n > 0 ? '' : 'none';
      }
    });

    socket.on('init', (data) => {
      const now = Date.now();
      if (now - lastInit < 1000) return;
      lastInit = now;
      if (data.cola) renderCola(data.cola);
      if (data.mesas) renderMesas(data.mesas);
    });

    socket.on('cola_update', (cola) => renderCola(cola));
    socket.on('mesas_update', (mesas) => renderMesas(mesas));

    socket.on('tp_update', (tp) => {
      if (tp.lyrics && tp.lyrics !== tpState.rawText) setLyrics(tp.lyrics);
      if (tp.currentWord >= 0) highlightWord(tp.currentWord);
      if (typeof tp.isPlaying === 'boolean' && tp.isPlaying !== tpState.autoScrolling) {
        tpState.autoScrolling = tp.isPlaying;
        updatePlayBtn();
      }
    });

    socket.on('tp_speed_update', (d) => {
      tpState.speed = d.speed;
      document.getElementById('speed-label').textContent = tpState.speed.toFixed(1) + 'x';
    });

    socket.on('singer_changed', async (singer) => {
      if (singer && singer.cancion && typeof currentMode !== 'undefined' && currentMode === 'remote') {
        await fetchSongs();
        const match = allSongs.find((s) =>
          s.titulo.toLowerCase().includes(singer.cancion.toLowerCase()) ||
          singer.cancion.toLowerCase().includes(s.titulo.toLowerCase())
        );
        if (match && match.letra) setLyrics(match.letra);
      }
    });

    if (typeof _setupEventoListeners === 'function') _setupEventoListeners();
  };
})(window.VibeFlow);
