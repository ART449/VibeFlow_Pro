(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const search = VF.modules.search = {};

  search._uSearchRenderLyrics = function(lyricsData) {
    if (!lyricsData.length) return '';
    let html = '<div class="usearch-group"><div class="usearch-group-title">Letras</div>';
    html += lyricsData.slice(0, 5).map((l, i) => {
      const preview = (l.plainLyrics || '').split('\n').slice(0, 2).join(' / ').substring(0, 80);
      const isLocal = l._local;
      return '<div class="usearch-item" onclick="uLoadLyrics(' + i + ')">' +
        '<div class="usearch-item-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;">' + (isLocal ? '&#128194;' : '&#127925;') + '</div>' +
        '<div class="usearch-item-info">' +
          '<div class="usearch-item-title">' + escHtml(l.trackName || l.titulo || '') + '</div>' +
          '<div class="usearch-item-sub">' + escHtml(l.artistName || 'ArT-AtR') + (isLocal ? ' &middot; LOCAL' : '') + '</div>' +
          '<div class="usearch-item-sub" style="opacity:.4;font-style:italic;">' + escHtml(preview) + '...</div>' +
        '</div>' +
        '<button class="usearch-item-action">Cargar</button>' +
      '</div>';
    }).join('');
    html += '</div>';
    return html;
  };

  search.uSearch = async function() {
    const q = document.getElementById('usearch-input').value.trim();
    if (!q) {
      showToast('Escribe algo para buscar');
      return;
    }

    const resultsEl = document.getElementById('usearch-results');
    const closeBtn = document.getElementById('usearch-close');
    resultsEl.style.display = 'block';
    closeBtn.style.display = 'inline';

    const localResults = [];
    try {
      if (window.__artLetrasReady && window.__artLetrasData) {
        const ql = q.toLowerCase();
        window.__artLetrasData.filter((l) => l.titulo.toLowerCase().includes(ql) || l.letra.toLowerCase().includes(ql))
          .slice(0, 5)
          .forEach((l) => localResults.push({ trackName: l.titulo, artistName: 'ArT-AtR', plainLyrics: l.letra, _local: true }));
      }
    } catch {}

    if (localResults.length) {
      window._uSearchLyrics = localResults;
      resultsEl.innerHTML = search._uSearchRenderLyrics(localResults) + '<div class="usearch-loading" style="font-size:10px;padding:8px;">Buscando en mas fuentes...</div>';
    } else {
      resultsEl.innerHTML = '<div class="usearch-loading">Buscando en todas las fuentes...</div>';
    }

    const [lyrics, yt, jm] = await Promise.allSettled([
      search.uSearchLyrics(q),
      search.uSearchYoutube(q),
      search.uSearchJamendo(q)
    ]);

    const lyricsData = lyrics.status === 'fulfilled' ? lyrics.value : [];
    const ytData = yt.status === 'fulfilled' ? yt.value : [];
    const jmData = jm.status === 'fulfilled' ? jm.value : [];

    if (!lyricsData.length && !ytData.length && !jmData.length) {
      resultsEl.innerHTML = '<div class="usearch-empty">Sin resultados para "' + escHtml(q) + '"</div>';
      return;
    }

    let html = '';
    const ql = q.toLowerCase().split(/\s+/);

    function scoreResult(title, artist) {
      const t = (title || '').toLowerCase();
      const a = (artist || '').toLowerCase();
      let score = 0;
      if (t.includes(q.toLowerCase())) score += 50;
      ql.forEach((w) => { if (t.includes(w)) score += 10; });
      ql.forEach((w) => { if (a.includes(w)) score += 5; });
      if (t.startsWith(q.toLowerCase())) score += 20;
      return score;
    }

    const paired = [];
    if (ytData.length && lyricsData.length) {
      ytData.slice(0, 5).forEach((v) => {
        const vTitle = (v.snippet?.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const match = lyricsData.find((l) => {
          const lTitle = (l.trackName || l.titulo || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const lArtist = (l.artistName || '').toLowerCase();
          const vWords = vTitle.split(/\s+/);
          const lWords = lTitle.split(/\s+/);
          const shared = vWords.filter((w) => w.length > 2 && lWords.some((lw) => lw.includes(w) || w.includes(lw)));
          return shared.length >= 2 || vTitle.includes(lTitle) || lTitle.includes(vTitle.split('-')[0].trim()) || (lArtist && vTitle.includes(lArtist));
        });
        if (match) {
          paired.push({
            video: v,
            lyrics: match,
            lyricsIdx: lyricsData.indexOf(match),
            score: scoreResult(v.snippet?.title, v.snippet?.channelTitle) + 30
          });
        }
      });
    }

    paired.sort((a, b) => b.score - a.score);
    const pairedLyricIdxs = paired.map((p) => p.lyricsIdx);
    const pairedVids = paired.map((p) => p.video.id?.videoId || p.video.id);

    if (paired.length) {
      html += '<div class="usearch-group"><div class="usearch-group-title">&#11088; Recomendados &middot; Video + Letra</div>';
      html += paired.slice(0, 3).map((p) => {
        const v = p.video;
        const l = p.lyrics;
        const thumb = v.snippet?.thumbnails?.default?.url || '';
        const title = v.snippet?.title || 'Video';
        const ch = v.snippet?.channelTitle || '';
        const vid = v.id?.videoId || v.id;
        const preview = (l.plainLyrics || '').split('\n').slice(0, 2).join(' / ').substring(0, 60);
        return `<div class="usearch-item" style="flex-wrap:wrap;gap:6px;padding:10px 14px;background:rgba(255,0,110,.04);border:1px solid rgba(255,0,110,.15);border-radius:10px;margin:4px 8px;">
          <img class="usearch-item-img" src="${escHtml(thumb)}" alt="" loading="lazy" style="border-radius:8px;">
          <div class="usearch-item-info">
            <div class="usearch-item-title">${escHtml(title)}</div>
            <div class="usearch-item-sub">${escHtml(ch)}</div>
            <div class="usearch-item-sub" style="opacity:.5;font-style:italic;">${escHtml(preview)}...</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="usearch-item-action" onclick="uPlayYoutube('${vid}','${escHtml(title.replace(/'/g, ''))}');uLoadLyrics(${p.lyricsIdx})" style="background:var(--p);color:#fff;border-color:var(--p);">&#9654; Play + Letra</button>
          </div>
        </div>`;
      }).join('');
      html += '</div>';
    }

    const remainingLyrics = lyricsData.filter((_, i) => !pairedLyricIdxs.includes(i));
    if (remainingLyrics.length) {
      html += '<div class="usearch-group"><div class="usearch-group-title">&#128221; Letras</div>';
      html += remainingLyrics.slice(0, 5).map((l) => {
        const origIdx = lyricsData.indexOf(l);
        const preview = (l.plainLyrics || '').split('\n').slice(0, 2).join(' / ').substring(0, 80);
        const isLocal = l._local;
        return `<div class="usearch-item" onclick="uLoadLyrics(${origIdx})">
          <div class="usearch-item-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;">${isLocal ? '&#128194;' : '&#127925;'}</div>
          <div class="usearch-item-info">
            <div class="usearch-item-title">${escHtml(l.trackName || l.titulo || '')}</div>
            <div class="usearch-item-sub">${escHtml(l.artistName || 'ArT-AtR')}${isLocal ? ' &middot; LOCAL' : ''}</div>
            <div class="usearch-item-sub" style="opacity:.4;font-style:italic;">${escHtml(preview)}...</div>
          </div>
          <button class="usearch-item-action">Cargar</button>
        </div>`;
      }).join('');
      html += '</div>';
    }

    const remainingYt = ytData.filter((v) => !pairedVids.includes(v.id?.videoId || v.id));
    if (remainingYt.length) {
      html += '<div class="usearch-group"><div class="usearch-group-title">&#9654;&#65039; YouTube</div>';
      html += remainingYt.slice(0, 5).map((v) => {
        const thumb = v.snippet?.thumbnails?.default?.url || '';
        const title = v.snippet?.title || 'Video';
        const ch = v.snippet?.channelTitle || '';
        const vid = v.id?.videoId || v.id;
        return `<div class="usearch-item" onclick="uPlayYoutube('${vid}','${escHtml(title.replace(/'/g, ''))}')">
          <img class="usearch-item-img" src="${escHtml(thumb)}" alt="" loading="lazy">
          <div class="usearch-item-info">
            <div class="usearch-item-title">${escHtml(title)}</div>
            <div class="usearch-item-sub">${escHtml(ch)}</div>
          </div>
          <button class="usearch-item-action">&#9654; Play</button>
        </div>`;
      }).join('');
      html += '</div>';
    }

    if (jmData.length) {
      html += '<div class="usearch-group"><div class="usearch-group-title">&#9835; Jamendo &middot; Libre</div>';
      html += jmData.slice(0, 5).map((t) => {
        const dur = Math.floor(t.duration / 60) + ':' + String(t.duration % 60).padStart(2, '0');
        return `<div class="usearch-item" onclick="jmPlay('${escHtml(t.audio)}','${escHtml((t.name || '').replace(/'/g, ''))}','${escHtml((t.artist_name || '').replace(/'/g, ''))}','${t.id}')">
          <img class="usearch-item-img" src="${escHtml(t.album_image || t.image || '')}" alt="" loading="lazy">
          <div class="usearch-item-info">
            <div class="usearch-item-title">${escHtml(t.name)}</div>
            <div class="usearch-item-sub">${escHtml(t.artist_name)} &middot; ${dur}</div>
            <div class="usearch-item-sub" style="color:#2dd4bf;">&#9835; CC Libre</div>
          </div>
          <button class="usearch-item-action">&#9654; Play</button>
        </div>`;
      }).join('');
      html += '</div>';
    }

    resultsEl.innerHTML = html;
    window._uSearchLyrics = lyricsData;
  };

  search.uSearchLyrics = async function(q) {
    const results = [];
    try {
      const r = await fetch('/api/lrclib/search?track_name=' + encodeURIComponent(q), { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const data = await r.json();
        data.slice(0, 5).forEach((d) => results.push(d));
      }
    } catch {}

    try {
      if (window.__artLetrasReady && window.__artLetrasData) {
        const ql = q.toLowerCase();
        window.__artLetrasData.filter((l) => l.titulo.toLowerCase().includes(ql) || l.letra.toLowerCase().includes(ql))
          .slice(0, 3)
          .forEach((l) => results.push({ trackName: l.titulo, artistName: 'ArT-AtR', plainLyrics: l.letra, _local: true }));
      }
    } catch {}

    return results;
  };

  search.uSearchYoutube = async function(q) {
    const key = localStorage.getItem('yt_api_key') || '';
    try {
      const headers = key ? { 'X-YouTube-Key': key } : {};
      const r = await fetch('/api/youtube/search?q=' + encodeURIComponent(q), {
        signal: AbortSignal.timeout(5000),
        ...(Object.keys(headers).length ? { headers } : {})
      });
      const d = await r.json();
      if (d.items && d.items.length) return d.items;
    } catch {}

    try {
      if (typeof ytFreeSearch === 'function') {
        const free = await ytFreeSearch(q);
        if (free && free.items) return free.items;
      }
    } catch {}

    return [];
  };

  search.uSearchJamendo = async function(q) {
    const clientId = localStorage.getItem('byflow_jamendo_id') || '';
    if (!clientId) return [];
    try {
      const r = await fetch('https://api.jamendo.com/v3.0/tracks/?client_id=' + clientId + '&format=json&search=' + encodeURIComponent(q) + '&limit=5&order=relevance', { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      return data.results || [];
    } catch {
      return [];
    }
  };

  search.uLoadLyrics = function(index) {
    const l = (window._uSearchLyrics || [])[index];
    if (!l) return;
    const lyrics = l.plainLyrics || l.letra || '';
    setLyrics(lyrics);
    if (socket) socket.emit('tp_lyrics', { lyrics });
    showToast('Letra cargada: ' + (l.trackName || l.titulo || ''));
    search.uSearchClose();
    if (currentMode !== 'karaoke') setMode('karaoke');
  };

  search.uPlayYoutube = function(videoId, title) {
    search.uSearchClose();
    if (typeof ytEmbed === 'function') {
      ytEmbed(videoId, title);
    } else {
      const container = document.getElementById('embed-container');
      const player = document.getElementById('music-player-embed');
      if (container && player) {
        container.innerHTML = '<iframe width="100%" height="200" src="https://www.youtube.com/embed/' + videoId + '?autoplay=1" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen style="border-radius:8px;"></iframe>';
        player.style.display = 'block';
      }
    }
    showToast('Play: ' + title);
  };

  search.uSearchClose = function() {
    const results = document.getElementById('usearch-results');
    const closeBtn = document.getElementById('usearch-close');
    if (results) results.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
  };

  if (!window.__vfUniversalSearchBound) {
    window.__vfUniversalSearchBound = true;
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('usearch-wrap');
      if (wrap && !wrap.contains(e.target)) search.uSearchClose();
    });
  }
})(window.VibeFlow);
