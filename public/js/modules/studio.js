(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const studio = VF.modules.studio = {};

  studio.openLyricStudio = function() {
    const el = document.getElementById('lyric-studio-overlay');
    if (el) {
      el.classList.add('open');
      el.style.display = 'flex';
    }
    studio.lsRenderMisLetras();
    studio.lsRenderSuno();
  };

  studio.closeLyricStudio = function() {
    const el = document.getElementById('lyric-studio-overlay');
    if (el) {
      el.classList.remove('open');
      el.style.display = 'none';
    }
  };

  studio.lsTab = function(tab) {
    ['gen', 'mis', 'suno'].forEach((t) => {
      const panel = document.getElementById('ls-panel-' + t);
      const btn = document.getElementById('ls-tab-' + t);
      if (panel) panel.style.display = t === tab ? '' : 'none';
      if (btn) {
        btn.classList.toggle('active', t === tab);
        btn.style.background = t === tab ? 'linear-gradient(135deg,var(--p),var(--s))' : 'transparent';
        btn.style.color = t === tab ? '#fff' : 'var(--sub)';
      }
    });
  };

  studio.lsRenderMisLetras = function(filter) {
    const container = document.getElementById('ls-mis-list');
    if (!container) return;
    const f = (filter || '').toLowerCase();
    const filtered = _artLetras.filter((l) => !f || l.titulo.toLowerCase().includes(f) || l.tema.toLowerCase().includes(f));
    container.innerHTML = filtered.map((l) =>
      '<div onclick="lsShowLetra(' + l.id + ')" style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;margin-bottom:4px;cursor:pointer;transition:all .2s;" onmouseover="this.style.borderColor=\'var(--p)\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
        '<div style="font-size:12px;font-weight:700;color:var(--text);">' + escHtml(l.titulo) + '</div>' +
        '<div style="font-size:10px;color:var(--sub);display:flex;gap:8px;">' +
          '<span>' + escHtml(l.tema) + '</span>' +
          '<span style="opacity:.5;">' + escHtml(l.fuente) + '</span>' +
        '</div>' +
      '</div>'
    ).join('') || '<div style="text-align:center;padding:20px;opacity:.5;font-size:11px;">No se encontraron letras</div>';
  };

  studio.lsFilterMisLetras = function(val) {
    studio.lsRenderMisLetras(val);
  };

  studio.lsShowLetra = function(id) {
    const l = _artLetras.find((x) => x.id === id);
    if (!l) return;
    const output = document.getElementById('ls-output');
    const wmType = l.fuente === 'Suno' ? 'SUNO' : 'OG';
    const ogSig = '\n\n------------------------------\n✍️ ArT - AtR (Arturo Torres)\n📝 Letra original - Propiedad 100% de Arturo Torres / IArtLabs\n🔒 Protegida con marca de agua digital\n------------------------------';
    const fullText = _bfWatermark(l.letra, wmType) + ogSig;
    output.innerHTML =
      '<div style="margin-bottom:10px;">' +
        '<div style="font-size:14px;font-weight:800;margin-bottom:4px;">' + escHtml(l.titulo) + '</div>' +
        '<span style="font-size:10px;background:var(--p);color:#fff;padding:2px 8px;border-radius:4px;margin-right:4px;">' + escHtml(l.tema) + '</span>' +
        '<span style="font-size:10px;background:rgba(255,255,255,.1);color:var(--sub);padding:2px 8px;border-radius:4px;">' + escHtml(l.fuente) + '</span>' +
      '</div>' +
      '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8;color:var(--text);margin:0;">' + escHtml(fullText) + '</pre>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="lsLoadLetraToTp(' + l.id + ')" style="flex:1;padding:8px;background:var(--g);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">📝 Cargar en Teleprompter</button>' +
        '<button onclick="lsCopyCurrentLetra()" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:var(--text);font-size:12px;font-weight:700;cursor:pointer;">📋 Copiar</button>' +
      '</div>';
  };

  studio.lsLoadLetraToTp = function(id) {
    const l = _artLetras.find((x) => x.id === id);
    if (!l) return;
    const wmType = l.fuente === 'Suno' ? 'SUNO' : 'OG';
    setLyrics(_bfWatermark(l.letra, wmType));
    if (socket) socket.emit('tp_lyrics', { lyrics: l.letra });
    showToast('"' + l.titulo + '" cargada en teleprompter');
    studio.closeLyricStudio();
  };

  studio.lsCopyCurrentLetra = function() {
    const pre = document.querySelector('#ls-output pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => showToast('Letra copiada'));
  };

  studio.lsRenderSuno = function(filter) {
    const container = document.getElementById('ls-suno-list');
    if (!container) return;
    const f = (filter || '').toLowerCase();
    const filtered = _sunoTracks.filter((t) => !f || t.titulo.toLowerCase().includes(f) || t.tema.toLowerCase().includes(f) || t.genero.toLowerCase().includes(f));
    container.innerHTML = filtered.map((t) =>
      '<div style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;margin-bottom:4px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text);">' + escHtml(t.titulo) + '</div>' +
          (t.plays ? '<span style="font-size:9px;color:var(--sub);background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px;">▶ ' + t.plays + '</span>' : '') +
        '</div>' +
        '<div style="font-size:10px;color:var(--sub);display:flex;gap:8px;flex-wrap:wrap;">' +
          '<span style="color:var(--a);">' + escHtml(t.genero) + '</span>' +
          '<span>' + escHtml(t.tema) + '</span>' +
          (t.nota ? '<span style="opacity:.5;">' + escHtml(t.nota) + '</span>' : '') +
        '</div>' +
      '</div>'
    ).join('') || '<div style="text-align:center;padding:20px;opacity:.5;font-size:11px;">No se encontraron canciones</div>';
  };

  studio.lsFilterSuno = function(val) {
    studio.lsRenderSuno(val);
  };

  studio.generateOfflineLyrics = function() {
    const theme = document.getElementById('ls-theme').value;
    const style = document.getElementById('ls-style').value;
    const structure = document.getElementById('ls-structure').value;
    const stanzas = parseInt(document.getElementById('ls-stanzas').value, 10);
    const output = document.getElementById('ls-output');

    const pool = _artGetThemePool(theme);
    const usedLines = new Set();
    const lines = [];
    const hasChorus = structure === 'verse-chorus';

    let chorus = [];
    if (hasChorus) {
      const [c1, c2] = _artPickRhymingPair(pool, usedLines);
      usedLines.add(c1);
      usedLines.add(c2);
      const [c3, c4] = _artPickRhymingPair(pool, usedLines);
      usedLines.add(c3);
      usedLines.add(c4);
      chorus = [c1, c2, c3, c4];
    }

    for (let s = 0; s < stanzas; s++) {
      const isChorus = hasChorus && s > 0 && s % 2 === 0;
      if (isChorus) {
        lines.push('[CORO]');
        chorus.forEach((l) => lines.push(l));
      } else {
        lines.push(hasChorus ? '[VERSO ' + Math.ceil((s + 1) / 2) + ']' : '[ESTROFA ' + (s + 1) + ']');
        if (structure === 'aabb' || structure === 'verse-chorus') {
          const [a1, a2] = _artPickRhymingPair(pool, usedLines);
          usedLines.add(a1);
          usedLines.add(a2);
          const [b1, b2] = _artPickRhymingPair(pool, usedLines);
          usedLines.add(b1);
          usedLines.add(b2);
          lines.push(a1, a2, b1, b2);
        } else if (structure === 'abab') {
          const [a1, a2] = _artPickRhymingPair(pool, usedLines);
          usedLines.add(a1);
          usedLines.add(a2);
          const [b1, b2] = _artPickRhymingPair(pool, usedLines);
          usedLines.add(b1);
          usedLines.add(b2);
          lines.push(a1, b1, a2, b2);
        } else {
          const count = 4 + Math.floor(Math.random() * 3);
          const avail = _lsShuffle(pool.filter((l) => !usedLines.has(l)));
          for (let i = 0; i < count && i < avail.length; i++) {
            lines.push(avail[i]);
            usedLines.add(avail[i]);
          }
        }
      }
      lines.push('');
    }

    if (lines.length > 4) {
      const dtLine = _artGenerarDoubleTempo(theme);
      const insertAt = 2 + Math.floor(Math.random() * (lines.length - 3));
      lines.splice(insertAt, 0, dtLine);
    }

    const firmaPos = ['inicio', 'medio', 'final', 'integrado', 'random'];
    _artInsertFirma(lines, firmaPos[Math.floor(Math.random() * firmaPos.length)]);

    if (hasChorus && chorus.length) {
      lines.push('[CORO FINAL]');
      chorus.forEach((l) => lines.push(l));
    }

    lines.push('');
    lines.push('------------------------------');
    lines.push('🎤 Generado con ByFlow - powered by IArtLabs');
    lines.push('📝 Propiedad intelectual: 100% del autor.');
    lines.push('💰 Clausula comercial: Si esta letra genera ingresos,');
    lines.push('   aplica un 15% de regalias a IArtLabs.');
    lines.push('------------------------------');

    const rawText = lines.join('\n').trim();
    const fullText = _bfWatermark(rawText);
    const styleEmoji = { rap: '🎤', trap: '🔥', reggaeton: '💃', balada: '💕', rock: '🎸', pop: '🎵' };
    const themeEmoji = { amor: '❤️', desamor: '💔', superacion: '🚀', calle: '🏙️', tech: '💻', redencion: '🪽', fiesta: '🎉', melanc: '🌧️' };

    output.innerHTML = '<div style="margin-bottom:12px;">' +
      '<span style="font-size:11px;background:var(--p);color:#fff;padding:2px 8px;border-radius:4px;margin-right:5px;">' + (themeEmoji[theme] || '') + ' ' + theme + '</span>' +
      '<span style="font-size:11px;background:var(--a);color:#fff;padding:2px 8px;border-radius:4px;margin-right:5px;">' + (styleEmoji[style] || '') + ' ' + style + '</span>' +
      '<span style="font-size:11px;background:rgba(255,255,255,.1);color:var(--sub);padding:2px 8px;border-radius:4px;">' + structure + '</span>' +
      '<span style="font-size:9px;background:rgba(255,215,0,.15);color:#ffd700;padding:2px 6px;border-radius:4px;margin-left:5px;">100% ArT-AtR</span>' +
      '</div>' +
      '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8;color:var(--text);margin:0;">' + escHtml(fullText) + '</pre>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="lsLoadToTeleprompter()" style="flex:1;padding:8px;background:var(--g);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">📝 Cargar en Teleprompter</button>' +
        '<button onclick="lsCopyLyrics()" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:var(--text);font-size:12px;font-weight:700;cursor:pointer;">📋 Copiar</button>' +
        '<button onclick="generateOfflineLyrics()" style="padding:8px 14px;background:var(--p);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">🔄</button>' +
      '</div>';
  };

  studio.generateGrokLyrics = async function() {
    if (!iaOnline || iaBackend !== 'grok') {
      showToast('GFlow no disponible - usa el generador offline', 'warning');
      return;
    }
    const theme = document.getElementById('ls-theme').value;
    const style = document.getElementById('ls-style').value;
    const structure = document.getElementById('ls-structure').value;
    const stanzas = parseInt(document.getElementById('ls-stanzas').value, 10);
    const custom = document.getElementById('ls-custom').value.trim();
    const output = document.getElementById('ls-output');

    const themeNames = { amor: 'amor y romance', desamor: 'desamor y traicion', superacion: 'superacion personal', calle: 'calle y barrio', tech: 'tecnologia y hacking', redencion: 'redencion y familia', fiesta: 'fiesta y celebracion', melanc: 'melancolia y nostalgia' };
    const styleNames = { rap: 'rap consciente', trap: 'trap latino', reggaeton: 'reggaeton', balada: 'balada romantica', rock: 'rock', pop: 'pop' };
    const structNames = { 'verse-chorus': 'verso-coro-verso con coro repetido', aabb: 'rima pareada AABB', abab: 'rima alterna ABAB', free: 'freestyle libre' };

    const prompt = 'Escribe una letra de cancion en español con estas especificaciones:\n' +
      '- Tema: ' + (themeNames[theme] || theme) + '\n' +
      '- Estilo musical: ' + (styleNames[style] || style) + '\n' +
      '- Estructura: ' + (structNames[structure] || structure) + '\n' +
      '- Estrofas/secciones: ' + stanzas + '\n' +
      (custom ? '- Indicacion extra del usuario: ' + custom + '\n' : '') +
      '\nREGLAS OBLIGATORIAS:\n' +
      '1. Usa metrica de octosilabos (8 silabas por verso)\n' +
      '2. Rimas consonantes pareadas (AABB) en los coros\n' +
      '3. Cada seccion marcada con [VERSO 1], [CORO], [PUENTE], etc.\n' +
      '4. 4 lineas por estrofa minimo\n' +
      '5. Incluye metaforas originales, evita cliches\n' +
      '6. Estilo lirico de ArT-AtR: tecnico-sentimental, mezcla crudeza de calle con precision tecnologica\n' +
      '7. Solo devuelve la letra, sin explicaciones ni comentarios\n';

    output.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:2rem;margin-bottom:12px;animation:spin 1s linear infinite;">🤖</div><div style="color:var(--sub);font-size:12px;">GFlow escribiendo tu letra...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';

    const systemPrompt = 'Eres GFlow Lyricist, el motor lirico de ByFlow creado por ArT-AtR (Arturo Torres). Escribes letras de canciones en español con maestria. Tu estilo base es tecnico-sentimental: metricas de octosilabos, rimas consonantes pareadas AABB para estribillos, terminologia de software con metaforas de vida y superacion. Adaptas el tono al genero pedido pero siempre mantienes calidad lirica alta. Solo devuelves la letra, sin explicaciones ni comentarios previos ni posteriores.';

    try {
      const token = getLicenseToken();
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
        body: JSON.stringify({ prompt, system: systemPrompt })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'HTTP ' + r.status);
      }
      const d = await r.json();
      let grokLyric = (d.text || '').trim();
      if (!grokLyric) throw new Error('GFlow no devolvio texto');
      grokLyric = stampSignature(grokLyric);

      const styleEmoji = { rap: '🎤', trap: '🔥', reggaeton: '💃', balada: '💕', rock: '🎸', pop: '🎵' };
      const themeEmoji = { amor: '❤️', desamor: '💔', superacion: '🚀', calle: '🏙️', tech: '💻', redencion: '🪽', fiesta: '🎉', melanc: '🌧️' };

      output.innerHTML = '<div style="margin-bottom:12px;">' +
        '<span style="font-size:11px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);color:#fff;padding:2px 8px;border-radius:4px;margin-right:5px;">🤖 GFlow PRO</span>' +
        '<span style="font-size:11px;background:var(--p);color:#fff;padding:2px 8px;border-radius:4px;margin-right:5px;">' + (themeEmoji[theme] || '') + ' ' + theme + '</span>' +
        '<span style="font-size:11px;background:var(--a);color:#fff;padding:2px 8px;border-radius:4px;">' + (styleEmoji[style] || '') + ' ' + style + '</span>' +
        '</div>' +
        '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8;color:var(--text);margin:0;">' + escHtml(grokLyric) + '</pre>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button onclick="lsLoadToTeleprompter()" style="flex:1;padding:8px;background:var(--g);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">📝 Cargar en Teleprompter</button>' +
          '<button onclick="lsCopyLyrics()" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:var(--text);font-size:12px;font-weight:700;cursor:pointer;">📋 Copiar</button>' +
          '<button onclick="generateGrokLyrics()" style="padding:8px 14px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">🔄</button>' +
        '</div>';
    } catch (e) {
      output.innerHTML = '<div style="text-align:center;padding:30px;color:#ff6b6b;"><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><div style="font-size:12px;">Error: ' + escHtml(e.message) + '</div><button onclick="generateOfflineLyrics()" style="margin-top:12px;padding:8px 16px;background:var(--p);border:none;border-radius:8px;color:#fff;font-size:12px;cursor:pointer;">Usar generador offline</button></div>';
    }
  };

  studio._updateGrokLyricBtn = function() {
    const btn = document.getElementById('ls-grok-btn');
    if (!btn) return;
    if (iaOnline && iaBackend === 'grok') {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = 'Generar letra con GFlow IA (PRO)';
    } else {
      btn.disabled = true;
      btn.style.opacity = '.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'Requiere GFlow online (PRO)';
    }
  };

  studio.lsLoadToTeleprompter = function() {
    const pre = document.querySelector('#ls-output pre');
    if (!pre) return;
    const text = pre.textContent;
    setLyrics(text);
    if (socket) socket.emit('tp_lyrics', { lyrics: text });
    showToast('Letra cargada en teleprompter');
    studio.closeLyricStudio();
  };

  studio.lsCopyLyrics = function() {
    const pre = document.querySelector('#ls-output pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => showToast('Letra copiada'));
  };
})(window.VibeFlow);
