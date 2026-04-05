(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const youtube = VF.modules.youtube = {};

  // YouTube search cache constants
  var YT_CACHE_PREFIX = 'bf_ytc_';
  var YT_CACHE_TTL = 1800000; // 30 minutes

  function bridge() {
    return VF.modules.twinBridge;
  }

  function buildYoutubeHeaders() {
    return ytApiKey ? { 'X-YouTube-Key': ytApiKey } : {};
  }

  function ensureScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    const script = document.createElement('script');
    script.src = src;
    document.head.appendChild(script);
  }

  youtube.ytInit = function() {
    var inp = document.getElementById('yt-api-key');
    var st = document.getElementById('yt-key-status');
    var keyRow = document.getElementById('yt-key-row');

    if (window.__ytServerConfigured) {
      // Server has the key — hide the API key field entirely
      if (keyRow) keyRow.style.display = 'none';
      if (st) {
        st.textContent = 'YouTube listo';
        st.className = 'yt-key-status ok';
      }
    } else if (ytApiKey && inp) {
      inp.value = ytApiKey;
      if (st) {
        st.textContent = 'API key guardada';
        st.className = 'yt-key-status ok';
      }
    } else if (st) {
      // No key anywhere — still works via Piped free search
      st.textContent = 'Busqueda libre activa';
      st.className = 'yt-key-status ok';
    }
  };

  youtube.ytSaveKey = function() {
    const val = document.getElementById('yt-api-key').value.trim();
    const st = document.getElementById('yt-key-status');
    if (!val) {
      st.textContent = 'Ingresa una API key';
      st.className = 'yt-key-status';
      return;
    }
    ytApiKey = val;
    localStorage.setItem('yt_api_key', val);
    st.textContent = 'API key guardada';
    st.className = 'yt-key-status ok';
    showToast('API key guardada');
  };

  youtube.ytParseDuration = function(iso) {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const h = parseInt(m[1] || 0, 10);
    const min = parseInt(m[2] || 0, 10);
    const s = parseInt(m[3] || 0, 10);
    if (h) return h + ':' + String(min).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return min + ':' + String(s).padStart(2, '0');
  };

  youtube.ytCacheGet = function(query) {
    try {
      const raw = localStorage.getItem(YT_CACHE_PREFIX + query.toLowerCase().trim());
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > YT_CACHE_TTL) {
        localStorage.removeItem(YT_CACHE_PREFIX + query.toLowerCase().trim());
        return null;
      }
      return cached.data;
    } catch {
      return null;
    }
  };

  youtube.ytCacheSet = function(query, data) {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(YT_CACHE_PREFIX));
      if (keys.length > 50) keys.slice(0, 20).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(
        YT_CACHE_PREFIX + query.toLowerCase().trim(),
        JSON.stringify({ ts: Date.now(), data })
      );
    } catch {}
  };

  youtube.ytFreeSearch = async function(q) {
    const r = await fetch('/api/youtube/free-search?q=' + encodeURIComponent(q));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    if (!d.items || !d.items.length) return null;

    const durs = {};
    d.items.forEach((item) => {
      if (!item._duration) return;
      const m = Math.floor(item._duration / 60);
      const s = item._duration % 60;
      durs[item.id.videoId] = m + ':' + String(s).padStart(2, '0');
    });
    return { items: d.items, durs };
  };

  youtube.ytSearch = async function() {
    const q = document.getElementById('yt-search-inp').value.trim();
    const res = document.getElementById('yt-results');
    if (!q) {
      showToast('Escribe algo para buscar');
      return;
    }

    const cached = youtube.ytCacheGet(q);
    if (cached) {
      youtube.ytRenderResults(cached.items, cached.durs, res);
      showToast('Resultados en cache');
      return;
    }

    res.innerHTML = '<div class="yt-empty">Buscando...</div>';
    try {
      let items;
      let durs = {};

      // Strategy: try server API key first, then client key, then Piped free
      var hasServerKey = !!window.__ytServerConfigured;
      var hasClientKey = !!ytApiKey;

      if (hasServerKey || hasClientKey) {
        try {
          var headers = buildYoutubeHeaders();
          var options = Object.keys(headers).length ? { headers } : {};
          var r = await fetch('/api/youtube/search?q=' + encodeURIComponent(q), options);
          var d = await r.json();
          if (!d.error && d.items && d.items.length) {
            items = d.items;
            var ids = d.items.map(function(i) { return i.id.videoId; }).join(',');
            var detRes = await fetch('/api/youtube/videos?ids=' + encodeURIComponent(ids), options);
            var detD = await detRes.json();
            if (detD.items) {
              detD.items.forEach(function(v) {
                durs[v.id] = youtube.ytParseDuration(v.contentDetails.duration);
              });
            }
          }
        } catch (apiErr) {}
      }

      // Fallback: Piped free search (always works, no key needed)
      if (!items) {
        var free = await youtube.ytFreeSearch(q);
        if (free) {
          items = free.items;
          durs = free.durs;
        }
      }

      if (!items || !items.length) {
        res.innerHTML = '<div class="yt-empty">Sin resultados</div>';
        return;
      }

      youtube.ytCacheSet(q, { items, durs });
      ytResults = items;
      youtube.ytRenderResults(items, durs, res);
    } catch (e) {
      res.innerHTML = '<div class="yt-empty">Error: ' + escHtml(e.message) + '</div>';
    }
  };

  youtube.ytRenderResults = function(items, durs, res) {
    ytResults = items;
    res.innerHTML = items.map((item, idx) => {
      const id = item.id.videoId;
      const title = item.snippet.title;
      const channel = item.snippet.channelTitle;
      const thumb = item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '';
      const dur = durs[id] || '';
      return `<div class="yt-card" id="ytcard-${idx}">
        <img class="yt-thumb" src="${escHtml(thumb)}" loading="lazy" alt="">
        <div class="yt-info">
          <div class="yt-song-title">${escHtml(title)}</div>
          <div class="yt-channel">${escHtml(channel)}</div>
          <div class="yt-meta">${dur ? '<span class="yt-dur">' + escHtml(dur) + '</span>' : ''}</div>
        </div>
        <div class="yt-actions">
          <button class="yt-btn yt-btn-dl" id="ytplay-${idx}"
            onclick="ytPlayWithLyrics('${id}','${escHtml(title.replace(/'/g, ''))}')"
            title="Reproducir">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Play
          </button>
        </div>
      </div>`;
    }).join('');
  };

  youtube.switchMusicSource = function(source) {
    currentMusicSource = source;
    const scSection = document.getElementById('sc-section');
    const jmSection = document.getElementById('jm-section');
    const tabs = {
      yt: document.getElementById('tab-yt'),
      sc: document.getElementById('tab-sc'),
      jm: document.getElementById('tab-jm')
    };

    document.querySelectorAll('.yt-panel > .yt-search-row, .yt-panel > .yt-results')
      .forEach((el) => { el.style.display = 'none'; });
    if (scSection) scSection.style.display = 'none';
    if (jmSection) jmSection.style.display = 'none';
    Object.values(tabs).forEach((t) => {
      if (!t) return;
      t.style.background = 'transparent';
      t.style.color = 'var(--sub)';
      t.classList.remove('active');
    });

    if (source === 'youtube') {
      document.querySelectorAll('.yt-panel > .yt-search-row, .yt-panel > .yt-results')
        .forEach((el) => { el.style.display = ''; });
      tabs.yt.style.background = 'var(--card)';
      tabs.yt.style.color = 'var(--text)';
      tabs.yt.classList.add('active');
      return;
    }
    if (source === 'soundcloud') {
      if (scSection) scSection.style.display = 'block';
      tabs.sc.style.background = 'var(--card)';
      tabs.sc.style.color = 'var(--text)';
      tabs.sc.classList.add('active');
      return;
    }
    if (source === 'jamendo') {
      if (jmSection) jmSection.style.display = 'block';
      tabs.jm.style.background = 'var(--card)';
      tabs.jm.style.color = 'var(--text)';
      tabs.jm.classList.add('active');
    }
  };

  youtube.ytPlayWithLyrics = async function(videoId, title) {
    youtube.ytEmbed(videoId, title);

    let artist = '';
    let track = title;
    addToHistory(title, '', 'youtube');
    const sep = title.match(/\s[-\u2013\u2014|]\s/);
    if (sep) {
      artist = title.substring(0, sep.index).trim();
      track = title.substring(sep.index + sep[0].length).trim();
    }
    track = track.replace(/\s*[\(\[](official|video|lyrics|audio|hd|hq|ft\.?|feat\.?|prod\.?|music video|visualizer|clip oficial|video oficial|letra)[^\)\]]*[\)\]]/gi, '').trim();
    artist = artist.replace(/\s*[\(\[](official|vevo|topic)[^\)\]]*[\)\]]/gi, '').trim();
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title: track || title,
        artist,
        sourceKind: 'youtube',
        sourceRef: videoId
      });
    }

    try {
      // Usar proxy del server para evitar CORS
      let url = '/api/lrclib/search?track_name=' + encodeURIComponent(track);
      if (artist) url += '&artist_name=' + encodeURIComponent(artist);
      const r = await fetch(url);
      if (!r.ok) return false;
      const data = await r.json();
      if (!data.length) return false;

      const lrc = data.find((d) => d.syncedLyrics && d.syncedLyrics.length > 10);
      const plain = data.find((d) => d.plainLyrics && d.plainLyrics.length > 10);
      const best = lrc || plain;
      if (!best) return false;

      const lyrics = lrc ? best.syncedLyrics : best.plainLyrics;
      setLyrics(lyrics);
      if (socket) socket.emit('tp_lyrics', { lyrics });
      showToast('Letra auto-cargada: ' + (best.trackName || track).substring(0, 30));

      if (!lrc && plain && iaOnline && iaBackend === 'grok') {
        youtube.generateLRCWithGrok(track, artist, best.plainLyrics);
      }
      return true;
    } catch {
      return false;
    }
  };

  youtube.generateLRCWithGrok = async function(track, artist, plainLyrics) {
    if (!iaOnline || iaBackend !== 'grok') {
      showToast('GFlow no disponible para generar LRC', 'warning');
      return;
    }
    if (!plainLyrics || plainLyrics.trim().length < 20) return;

    showToast('GFlow generando LRC sincronizado...', 'info');

    const systemPrompt = 'Eres un generador de archivos LRC (Lyric Resource Compiler). ' +
      'Tu trabajo es recibir la letra de una cancion y generar timestamps aproximados en formato LRC. ' +
      'REGLAS ESTRICTAS:\n' +
      '1. SOLO devuelves el archivo LRC, sin explicaciones ni comentarios\n' +
      '2. Formato exacto por linea: [MM:SS.CC]Texto de la linea\n' +
      '3. MM = minutos (2 digitos), SS = segundos (2 digitos), CC = centesimas (2 digitos)\n' +
      '4. Distribuye los timestamps de forma realista para una cancion pop/urbana tipica (~3-4 min)\n' +
      '5. Intro instrumental ~10-15 segundos antes de la primera linea\n' +
      '6. Versos: ~2-3 segundos entre lineas\n' +
      '7. Coros: ritmo ligeramente mas rapido\n' +
      '8. Pausas entre secciones: ~4-6 segundos\n' +
      '9. Si el artista canta mas rapido (rap/trap), reduce el tiempo entre lineas a ~1.5-2s\n' +
      '10. Si es balada, aumenta a ~3-4s entre lineas\n' +
      '11. NO incluyas lineas vacias, headers [ar:], [ti:], ni metadata - solo lineas con letra\n' +
      '12. Manten EXACTAMENTE el mismo texto de la letra, no cambies ni una palabra';

    const prompt = 'Genera el archivo LRC para esta cancion:\n' +
      'Artista: ' + (artist || 'Desconocido') + '\n' +
      'Cancion: ' + track + '\n\n' +
      'LETRA:\n' + plainLyrics.slice(0, 3000);

    try {
      const token = getLicenseToken();
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
        body: JSON.stringify({ prompt, system: systemPrompt })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      let lrcText = (d.text || '').trim();
      if (!lrcText) throw new Error('Sin respuesta');
      const lrcLines = lrcText.split('\n').filter((l) => /^\[\d{2}:\d{2}\.\d{2,3}\]/.test(l));
      if (lrcLines.length < 3) throw new Error('LRC invalido');

      lrcText = lrcLines.join('\n');
      setLyrics(lrcText);
      if (socket) socket.emit('tp_lyrics', { lyrics: lrcText });
      showToast('LRC generado por GFlow: ' + lrcLines.length + ' lineas', 'success');
    } catch {}
  };

  youtube.grokWriteLyrics = async function(track, artist) {
    if (!iaOnline || iaBackend !== 'grok') {
      showToast('GFlow no disponible', 'warning');
      return;
    }

    const results = document.getElementById('lyrics-results');
    if (results) {
      results.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:2rem;margin-bottom:12px;animation:spin 1s linear infinite;">AI</div><div style="color:var(--sub);font-size:12px;">GFlow buscando la letra y generando LRC...</div></div>';
    }

    const systemPrompt = 'Eres un experto en letras de canciones y generacion de archivos LRC. ' +
      'Tu trabajo: dado un artista y cancion, escribir la letra COMPLETA y darle timestamps LRC. ' +
      'REGLAS:\n' +
      '1. Devuelve SOLO el archivo LRC - nada mas\n' +
      '2. Formato: [MM:SS.CC]Linea de la letra\n' +
      '3. Debes conocer la letra real de la cancion - no inventes\n' +
      '4. Si no conoces la letra exacta, escribe lo mas cercano posible\n' +
      '5. Timestamps realistas: intro ~10s, versos ~2.5s/linea, coros ~2s/linea\n' +
      '6. NO metadata, NO comentarios, SOLO lineas LRC';

    const prompt = 'Genera el archivo LRC completo para:\nArtista: ' + (artist || 'Desconocido') + '\nCancion: ' + track;

    try {
      const token = getLicenseToken();
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
        body: JSON.stringify({ prompt, system: systemPrompt })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      let lrcText = (d.text || '').trim();
      const lrcLines = lrcText.split('\n').filter((l) => /^\[\d{2}:\d{2}\.\d{2,3}\]/.test(l));
      if (lrcLines.length < 3) throw new Error('GFlow no pudo generar LRC valido');
      lrcText = lrcLines.join('\n');

      setLyrics(lrcText);
      if (socket) socket.emit('tp_lyrics', { lyrics: lrcText });
      closeLyricsSearch();
      showToast('Letra + LRC generado por GFlow: ' + lrcLines.length + ' lineas', 'success');
    } catch (e) {
      if (results) {
        results.innerHTML = '<div style="text-align:center;padding:30px;color:#ff6b6b;"><div style="font-size:12px;">' + escHtml(e.message) + '</div></div>';
      }
      showToast('Error generando LRC: ' + e.message, 'error');
    }
  };

  youtube.generateLRCManual = async function() {
    if (!tpState.rawText || tpState.rawText.trim().length < 20) {
      showToast('Primero carga una letra en el teleprompter', 'warning');
      return;
    }
    if (tpState.isLRC) {
      showToast('Ya tienes letra sincronizada (LRC)', 'info');
      return;
    }

    let songTitle = '';
    let songArtist = '';
    const nowEl = document.getElementById('now-name');
    if (nowEl && nowEl.textContent.trim()) {
      const parts = nowEl.textContent.split(/\s[-\u2013\u2014]\s/);
      if (parts.length > 1) {
        songArtist = parts[0].trim();
        songTitle = parts.slice(1).join(' ').trim();
      } else {
        songTitle = nowEl.textContent.trim();
      }
    }
    await youtube.generateLRCWithGrok(songTitle || 'cancion', songArtist, tpState.rawText);
  };

  youtube.ytEmbed = function(videoId, title) {
    _playerEndIsCleanup = true;
    onPlayerEnd(_activePlayerType);
    _playerEndIsCleanup = false;
    if (_ytPlayer) {
      try { _ytPlayer.destroy(); } catch {}
      _ytPlayer = null;
    }

    const container = document.getElementById('embed-container');
    const player = document.getElementById('music-player-embed');
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title,
        artist: '',
        sourceKind: 'youtube',
        sourceRef: videoId
      });
    }
    container.innerHTML = `<div id="yt-api-player"></div>
      <div style="font-size:.75rem;color:var(--sub);margin-top:4px;text-align:center;">${escHtml(title)}</div>`;
    player.style.display = 'block';

    function createPlayer() {
      _ytPlayer = new YT.Player('yt-api-player', {
        height: '200',
        width: '100%',
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => onPlayerPlay('youtube'),
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) onPlayerPlay('youtube');
            else if (e.data === YT.PlayerState.PAUSED) onPlayerPause('youtube');
            else if (e.data === YT.PlayerState.ENDED) onPlayerEnd('youtube');
          }
        }
      });
    }

    if (window.YT && YT.Player) createPlayer();
    else window.onYouTubeIframeAPIReady = createPlayer;
    showToast('Play: ' + title.substring(0, 35));
  };

  youtube.scEmbed = function(trackUrl, title) {
    _playerEndIsCleanup = true;
    onPlayerEnd(_activePlayerType);
    _playerEndIsCleanup = false;
    _scWidget = null;

    const container = document.getElementById('embed-container');
    const player = document.getElementById('music-player-embed');
    const encoded = encodeURIComponent(trackUrl);
    const iframeId = 'sc-widget-iframe';
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title,
        artist: '',
        sourceKind: 'soundcloud',
        sourceRef: trackUrl
      });
    }
    container.innerHTML = `<iframe id="${iframeId}" width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay"
      style="border-radius:8px;"
      src="https://w.soundcloud.com/player/?url=${encoded}&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"></iframe>
      <div style="font-size:.75rem;color:var(--sub);margin-top:4px;text-align:center;">${escHtml(title)}</div>`;
    player.style.display = 'block';

    function initSCWidget() {
      const iframe = document.getElementById(iframeId);
      if (!iframe || !window.SC || !SC.Widget) {
        setTimeout(initSCWidget, 300);
        return;
      }
      _scWidget = SC.Widget(iframe);
      _scWidget.bind(SC.Widget.Events.PLAY, () => onPlayerPlay('soundcloud'));
      _scWidget.bind(SC.Widget.Events.PAUSE, () => onPlayerPause('soundcloud'));
      _scWidget.bind(SC.Widget.Events.FINISH, () => onPlayerEnd('soundcloud'));
    }

    setTimeout(initSCWidget, 500);
    showToast('Play: ' + title.substring(0, 35));
  };

  youtube.closeEmbed = function() {
    stopPlayerSync();
    if (_ytPlayer) {
      try { _ytPlayer.destroy(); } catch {}
      _ytPlayer = null;
    }
    _scWidget = null;
    const container = document.getElementById('embed-container');
    const player = document.getElementById('music-player-embed');
    container.innerHTML = '';
    player.style.display = 'none';
  };

  youtube.scSearch = async function() {
    const inp = document.getElementById('sc-search-inp');
    const query = inp?.value.trim();
    if (!query) return;
    const res = document.getElementById('sc-results');
    res.innerHTML = '<div class="yt-empty">Buscando en SoundCloud...</div>';
    try {
      const searchUrl = 'https://soundcloud.com/search/sounds?q=' + encodeURIComponent(query);
      res.innerHTML = `<div style="padding:12px;text-align:center;">
        <a href="${searchUrl}" target="_blank" rel="noopener" style="color:#ff5500;text-decoration:none;font-size:.85rem;">
          Buscar "${escHtml(query)}" en SoundCloud
        </a>
        <div style="margin-top:10px;font-size:.75rem;color:var(--sub);">
          Copia la URL de la cancion y pegala aqui:
        </div>
        <div class="yt-search-row" style="margin-top:8px;">
          <input class="yt-search-inp" id="sc-url-inp" placeholder="https://soundcloud.com/artista/cancion" style="font-size:.75rem;">
          <button class="yt-search-btn" onclick="scPlayUrl()">Play</button>
        </div>
      </div>`;
    } catch (e) {
      res.innerHTML = '<div class="yt-empty">' + escHtml(e.message) + '</div>';
    }
  };

  youtube.scPlayUrl = function() {
    const inp = document.getElementById('sc-url-inp');
    const url = inp?.value.trim();
    if (!url || !url.includes('soundcloud.com')) {
      showToast('Pega una URL valida de SoundCloud');
      return;
    }
    youtube.scEmbed(url, url.split('/').pop() || 'SoundCloud');
  };

  youtube.jmSearch = async function() {
    const inp = document.getElementById('jm-search-inp');
    const query = inp?.value.trim();
    if (!query) return;
    const res = document.getElementById('jm-results');
    const clientId = localStorage.getItem('byflow_jamendo_id') || '';
    if (!clientId) {
      res.innerHTML = `<div style="padding:12px;text-align:center;font-size:.8rem;">
        <div style="color:var(--sub);margin-bottom:8px;">Necesitas un Client ID gratuito de Jamendo</div>
        <a href="https://devportal.jamendo.com/" target="_blank" rel="noopener" style="color:#2dd4bf;">Registrate gratis en devportal.jamendo.com</a>
        <div class="yt-search-row" style="margin-top:10px;">
          <input class="yt-search-inp" id="jm-client-id" placeholder="Pega tu Client ID aqui..." style="font-size:.75rem;">
          <button class="yt-search-btn" onclick="jmSaveKey()">OK</button>
        </div>
      </div>`;
      return;
    }

    res.innerHTML = '<div class="yt-empty">Buscando en Jamendo...</div>';
    try {
      const r = await fetch('https://api.jamendo.com/v3.0/tracks/?client_id=' + clientId + '&format=json&search=' + encodeURIComponent(query) + '&limit=15&order=relevance');
      const data = await r.json();
      if (!data.results || !data.results.length) {
        res.innerHTML = '<div class="yt-empty">No se encontraron resultados</div>';
        return;
      }
      res.innerHTML = data.results.map((t) => `
        <div class="yt-card" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);">
          <img src="${escHtml(t.album_image || t.image || '')}" style="width:50px;height:50px;border-radius:6px;object-fit:cover;" loading="lazy" alt="">
          <div style="flex:1;min-width:0;">
            <div style="font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.name)}</div>
            <div style="font-size:.7rem;color:var(--sub);">${escHtml(t.artist_name)} &middot; ${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, '0')}</div>
            <div style="font-size:.7rem;color:#2dd4bf;opacity:.7;">Licencia libre</div>
          </div>
          <button onclick="jmPlay('${escHtml(t.audio)}','${escHtml(t.name.replace(/'/g, ''))}','${escHtml(t.artist_name.replace(/'/g, ''))}','${t.id}')"
            style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--accent);color:#fff;cursor:pointer;font-size:.75rem;white-space:nowrap;">
            Play
          </button>
        </div>`).join('');
    } catch (e) {
      res.innerHTML = '<div class="yt-empty">' + escHtml(e.message) + '</div>';
    }
  };

  youtube.jmSaveKey = function() {
    const val = document.getElementById('jm-client-id')?.value.trim();
    if (!val) return;
    localStorage.setItem('byflow_jamendo_id', val);
    showToast('Jamendo Client ID guardado');
    youtube.jmSearch();
  };

  youtube.jmPlay = function(audioUrl, title, artist, trackId) {
    _playerEndIsCleanup = true;
    onPlayerEnd(_activePlayerType);
    _playerEndIsCleanup = false;
    if (jmAudio) {
      jmAudio.pause();
      jmAudio = null;
    }

    const container = document.getElementById('embed-container');
    const player = document.getElementById('music-player-embed');
    const jmLink = trackId ? 'https://www.jamendo.com/track/' + trackId : 'https://www.jamendo.com';
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title,
        artist,
        sourceKind: 'jamendo',
        sourceRef: trackId || audioUrl
      });
    }
    container.innerHTML = `<div style="background:var(--card);border-radius:8px;padding:12px;text-align:center;">
      <div style="font-size:.8rem;font-weight:600;margin-bottom:4px;">${escHtml(title)}</div>
      <div style="font-size:.7rem;color:var(--sub);margin-bottom:8px;">por ${escHtml(artist || 'Artista')}</div>
      <audio id="jm-audio-player" controls autoplay style="width:100%;border-radius:6px;" src="${escHtml(audioUrl)}"></audio>
      <div style="font-size:.7rem;color:#2dd4bf;margin-top:6px;">
        Musica libre via <a href="${jmLink}" target="_blank" rel="noopener" style="color:#2dd4bf;text-decoration:underline;">Jamendo</a> &middot; Licencia CC
      </div>
    </div>`;
    player.style.display = 'block';

    const audioEl = document.getElementById('jm-audio-player');
    if (audioEl) {
      jmAudio = audioEl;
      audioEl.addEventListener('timeupdate', () => {
        if (_twinMode && tpState.isLRC && tpState.autoScrolling) _feedTimeToLRC(audioEl.currentTime);
      });
      audioEl.addEventListener('play', () => onPlayerPlay('jamendo'));
      audioEl.addEventListener('pause', () => onPlayerPause('jamendo'));
      audioEl.addEventListener('ended', () => onPlayerEnd('jamendo'));

      if (VF.modules.player && typeof VF.modules.player.connectAudioToFX === 'function') {
        VF.modules.player.connectAudioToFX(audioEl);
      } else if (typeof connectAudioToFX === 'function') {
        connectAudioToFX(audioEl);
      }
    }
    showToast('Play: ' + title.substring(0, 35));
  };

  ensureScript('https://www.youtube.com/iframe_api');
  ensureScript('https://w.soundcloud.com/player/api.js');
  window.onYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady || function() {};
})(window.VibeFlow);
