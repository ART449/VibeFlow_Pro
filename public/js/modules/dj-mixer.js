/**
 * DJ Mixer Module — ByFlow
 * Dual deck, crossfader, 3-band EQ, BPM detection, sync, cue points
 */
(function(VF) {
  'use strict';
  VF.modules = VF.modules || {};
  var dj = VF.modules.djMixer = {};

  // ═══ STATE ═══
  var ctx = null; // AudioContext (reuse from player.js)
  var masterGain = null;
  var analyser = null;
  var decks = { a: null, b: null };
  var crossfadeValue = 0.5; // 0=A, 0.5=center, 1=B
  var _animFrame = 0;

  // ═══ DECK CLASS ═══
  function Deck(id) {
    this.id = id;
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.source = null;
    this.gainNode = null;
    this.crossGain = null;
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;
    this.analyser = null;
    this.volume = 0.8;
    this.trackName = '';
    this.bpm = 0;
    this.cuePoint = 0;
    this.hotCues = [null, null];
    this.isPlaying = false;
    this.waveformData = new Uint8Array(128);
    this._bpmBuffer = [];
    this._bpmLastPeak = 0;
    this._connected = false;
  }

  Deck.prototype.connect = function() {
    if (this._connected) return;
    if (!ctx) return;

    this.source = ctx.createMediaElementSource(this.audio);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.volume;

    // 3-band EQ
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.value = 0;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4000;
    this.eqHigh.gain.value = 0;

    // Crossfade gain
    this.crossGain = ctx.createGain();

    // Analyser for waveform
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.waveformData = new Uint8Array(this.analyser.frequencyBinCount);

    // Chain: source → gain → eqLow → eqMid → eqHigh → crossGain → masterGain
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.crossGain);
    this.crossGain.connect(masterGain);

    // Analyser tap (from after EQ, before crossfade)
    this.eqHigh.connect(this.analyser);

    this._connected = true;
  };

  Deck.prototype.loadTrack = function(url, name) {
    this.audio.src = url;
    this.trackName = name || url.split('/').pop();
    this.audio.load();
    this.bpm = 0;
    this.cuePoint = 0;
    this.hotCues = [null, null];
    this._bpmBuffer = [];
    this._bpmLastPeak = 0;
    if (!this._connected) this.connect();
    _updateDeckUI(this.id);
  };

  Deck.prototype.loadFile = function(file) {
    var url = URL.createObjectURL(file);
    this.loadTrack(url, file.name);
  };

  Deck.prototype.play = function() {
    if (!this._connected) this.connect();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    this.audio.play();
    this.isPlaying = true;
    _updateDeckUI(this.id);
  };

  Deck.prototype.pause = function() {
    this.audio.pause();
    this.isPlaying = false;
    _updateDeckUI(this.id);
  };

  Deck.prototype.togglePlay = function() {
    if (this.isPlaying) this.pause();
    else this.play();
  };

  Deck.prototype.seek = function(ratio) {
    if (this.audio.duration) {
      this.audio.currentTime = ratio * this.audio.duration;
    }
  };

  Deck.prototype.setVolume = function(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.02);
    _updateDeckUI(this.id);
  };

  Deck.prototype.setEQ = function(band, db) {
    var node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    if (node) node.gain.setTargetAtTime(db, ctx.currentTime, 0.02);
  };

  Deck.prototype.killEQ = function(band) {
    var node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    if (!node) return;
    var current = node.gain.value;
    if (current <= -24) {
      node.gain.setTargetAtTime(0, ctx.currentTime, 0.02); // restore
    } else {
      node.gain.setTargetAtTime(-30, ctx.currentTime, 0.02); // kill
    }
  };

  Deck.prototype.setCue = function() {
    this.cuePoint = this.audio.currentTime;
    showToast('CUE ' + this.id.toUpperCase() + ': ' + _formatTime(this.cuePoint));
  };

  Deck.prototype.gotoCue = function() {
    this.audio.currentTime = this.cuePoint;
    if (!this.isPlaying) this.play();
  };

  Deck.prototype.setHotCue = function(idx) {
    this.hotCues[idx] = this.audio.currentTime;
    showToast('Hot Cue ' + (idx + 1) + ' ' + this.id.toUpperCase() + ': ' + _formatTime(this.hotCues[idx]));
  };

  Deck.prototype.gotoHotCue = function(idx) {
    if (this.hotCues[idx] !== null) {
      this.audio.currentTime = this.hotCues[idx];
      if (!this.isPlaying) this.play();
    }
  };

  Deck.prototype.detectBPM = function() {
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.waveformData);

    // Simple peak detection
    var now = performance.now();
    var peak = 0;
    for (var i = 0; i < this.waveformData.length; i++) {
      var val = Math.abs(this.waveformData[i] - 128);
      if (val > peak) peak = val;
    }

    // Detect beats (peaks above threshold)
    if (peak > 40 && (now - this._bpmLastPeak) > 200) { // min 200ms between beats (300 BPM max)
      this._bpmBuffer.push(now);
      this._bpmLastPeak = now;

      // Keep last 20 peaks
      if (this._bpmBuffer.length > 20) this._bpmBuffer.shift();

      // Calculate BPM from intervals
      if (this._bpmBuffer.length >= 4) {
        var intervals = [];
        for (var j = 1; j < this._bpmBuffer.length; j++) {
          intervals.push(this._bpmBuffer[j] - this._bpmBuffer[j - 1]);
        }
        var avgInterval = intervals.reduce(function(a, b) { return a + b; }, 0) / intervals.length;
        var bpm = Math.round(60000 / avgInterval);
        if (bpm >= 60 && bpm <= 200) {
          this.bpm = bpm;
        }
      }
    }
  };

  // ═══ INIT ═══
  dj.init = function() {
    // Reuse existing AudioContext from player.js
    ctx = window.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    window.audioCtx = ctx;

    masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    decks.a = new Deck('a');
    decks.b = new Deck('b');

    // Audio event listeners
    ['a', 'b'].forEach(function(id) {
      var d = decks[id];
      d.audio.addEventListener('timeupdate', function() { _updateDeckUI(id); });
      d.audio.addEventListener('ended', function() { d.isPlaying = false; _updateDeckUI(id); });
      d.audio.addEventListener('loadedmetadata', function() { _updateDeckUI(id); });
    });

    _applyCrossfade();
    _startAnimLoop();
    _injectUI();
  };

  // ═══ CROSSFADER ═══
  dj.setCrossfade = function(value) {
    crossfadeValue = Math.max(0, Math.min(1, value));
    _applyCrossfade();
  };

  function _applyCrossfade() {
    if (!decks.a || !decks.b) return;
    var x = crossfadeValue;
    // Equal-power crossfade
    var gainA = Math.cos(x * Math.PI * 0.5);
    var gainB = Math.sin(x * Math.PI * 0.5);
    if (decks.a.crossGain) decks.a.crossGain.gain.setTargetAtTime(gainA, ctx.currentTime, 0.02);
    if (decks.b.crossGain) decks.b.crossGain.gain.setTargetAtTime(gainB, ctx.currentTime, 0.02);
  }

  // ═══ SYNC ═══
  dj.syncBtoA = function() {
    if (!decks.a.bpm || !decks.b.bpm) {
      showToast('Necesito BPM de ambos decks para sync');
      return;
    }
    var ratio = decks.a.bpm / decks.b.bpm;
    ratio = Math.max(0.5, Math.min(2.0, ratio));
    decks.b.audio.playbackRate = ratio;
    showToast('Sync: Deck B a ' + (ratio * 100).toFixed(0) + '% (' + decks.a.bpm + ' BPM)');
  };

  // ═══ ANIMATION LOOP ═══
  function _startAnimLoop() {
    function loop() {
      _animFrame = requestAnimationFrame(loop);

      // BPM detection
      if (decks.a.isPlaying) decks.a.detectBPM();
      if (decks.b.isPlaying) decks.b.detectBPM();

      // Vinyl rotation + progress rings
      _updateVinyls();

      // Draw waveforms
      _drawWaveform('a');
      _drawWaveform('b');

      // Update BPM display
      var bpmA = document.getElementById('dj-bpm-a');
      var bpmB = document.getElementById('dj-bpm-b');
      if (bpmA) bpmA.textContent = decks.a.bpm ? decks.a.bpm + ' BPM' : '— BPM';
      if (bpmB) bpmB.textContent = decks.b.bpm ? decks.b.bpm + ' BPM' : '— BPM';

      // Update time
      _updateTimeDisplay('a');
      _updateTimeDisplay('b');
    }
    loop();
  }

  function _drawWaveform(id) {
    var canvas = document.getElementById('dj-wave-' + id);
    if (!canvas) return;
    var d = decks[id];
    if (!d || !d.analyser) return;

    d.analyser.getByteFrequencyData(d.waveformData);
    var c = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    c.clearRect(0, 0, w, h);

    var bars = d.waveformData.length;
    var barW = w / bars;
    var colorA = id === 'a' ? '#00f5a0' : '#3a86ff';
    var colorB = id === 'a' ? '#00d9f5' : '#8338ec';

    for (var i = 0; i < bars; i++) {
      var val = d.waveformData[i] / 255;
      var barH = val * h * 0.9;
      var grad = c.createLinearGradient(0, h, 0, h - barH);
      grad.addColorStop(0, colorA);
      grad.addColorStop(1, colorB);
      c.fillStyle = grad;
      c.fillRect(i * barW, h - barH, barW - 1, barH);
    }
  }

  function _updateTimeDisplay(id) {
    var d = decks[id];
    var el = document.getElementById('dj-time-' + id);
    if (!el || !d) return;
    el.textContent = _formatTime(d.audio.currentTime) + ' / ' + _formatTime(d.audio.duration || 0);
  }

  function _updateDeckUI(id) {
    var d = decks[id];
    if (!d) return;
    var nameEl = document.getElementById('dj-name-' + id);
    if (nameEl) nameEl.textContent = d.trackName || 'Sin track';
    var playBtn = document.getElementById('dj-play-' + id);
    if (playBtn) playBtn.innerHTML = d.isPlaying ? '&#x23F8;' : '&#x25B6;';
    var vtitle = document.getElementById('dj-vtitle-' + id);
    if (vtitle) vtitle.textContent = d.trackName ? d.trackName.substring(0, 12) : 'ByFlow';
    // Vinyl spinning class
    var vinyl = document.getElementById('dj-vinyl-' + id);
    if (vinyl) vinyl.classList.toggle('dj-spinning', d.isPlaying);
  }

  function _formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  // ═══ VINYL ROTATION ═══
  var _vinylAngleA = 0;
  var _vinylAngleB = 0;

  function _updateVinyls() {
    if (decks.a && decks.a.isPlaying) _vinylAngleA = (_vinylAngleA + 1.8) % 360;
    if (decks.b && decks.b.isPlaying) _vinylAngleB = (_vinylAngleB + 1.8) % 360;
    var va = document.getElementById('dj-vinyl-a');
    var vb = document.getElementById('dj-vinyl-b');
    if (va) va.style.transform = 'rotate(' + _vinylAngleA + 'deg)';
    if (vb) vb.style.transform = 'rotate(' + _vinylAngleB + 'deg)';

    // Progress rings
    _updateProgressRing('a');
    _updateProgressRing('b');
  }

  function _updateProgressRing(id) {
    var d = decks[id];
    if (!d || !d.audio.duration) return;
    var pct = (d.audio.currentTime / d.audio.duration) * 100;
    var ring = document.getElementById('dj-ring-' + id);
    if (ring) ring.style.background = 'conic-gradient(' + (id === 'a' ? '#00f5a0' : '#3a86ff') + ' ' + pct + '%, transparent ' + pct + '%)';
  }

  // ═══ UI INJECTION ═══
  function _injectUI() {
    if (document.getElementById('dj-mixer-panel')) return;

    function deckHTML(id, color, label) {
      var c1 = id === 'a' ? '#00f5a0' : '#3a86ff';
      var c2 = id === 'a' ? '#00d9f5' : '#8338ec';
      return ''
        + '<div class="dj-deck" id="dj-deck-' + id + '">'
        + '  <div class="dj-deck-label" style="color:' + c1 + ';">DECK ' + label + '</div>'
        // Vinyl + artwork
        + '  <div class="dj-vinyl-wrap">'
        + '    <div class="dj-ring" id="dj-ring-' + id + '"></div>'
        + '    <div class="dj-vinyl" id="dj-vinyl-' + id + '">'
        + '      <div class="dj-vinyl-groove"></div>'
        + '      <div class="dj-vinyl-groove dj-vg2"></div>'
        + '      <div class="dj-vinyl-groove dj-vg3"></div>'
        + '      <div class="dj-vinyl-label" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ');">'
        + '        <div class="dj-vinyl-dot"></div>'
        + '        <div class="dj-vinyl-title" id="dj-vtitle-' + id + '">ByFlow</div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        // Waveform
        + '  <canvas id="dj-wave-' + id + '" class="dj-waveform" width="400" height="50"></canvas>'
        // Info
        + '  <div class="dj-info-row">'
        + '    <div class="dj-name" id="dj-name-' + id + '">Sin track</div>'
        + '    <div class="dj-bpm" id="dj-bpm-' + id + '" style="color:' + c1 + ';">— BPM</div>'
        + '  </div>'
        + '  <div class="dj-time" id="dj-time-' + id + '">0:00 / 0:00</div>'
        // Controls
        + '  <div class="dj-controls">'
        + '    <button class="dj-btn dj-play" id="dj-play-' + id + '" onclick="djDeckToggle(\'' + id + '\')" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ');">&#x25B6;</button>'
        + '    <button class="dj-btn dj-cue" onclick="djDeckCue(\'' + id + '\')">CUE</button>'
        + '    <button class="dj-btn dj-hot" onclick="djDeckHotCue(\'' + id + '\',0)">&#x266B;1</button>'
        + '    <button class="dj-btn dj-hot" onclick="djDeckHotCue(\'' + id + '\',1)">&#x266B;2</button>'
        + (id === 'b' ? '    <button class="dj-btn dj-sync" onclick="djSync()">SYNC</button>' : '')
        + '  </div>'
        // EQ
        + '  <div class="dj-eq">'
        + '    <div class="dj-eq-band"><span class="dj-eq-label">LOW</span><input type="range" min="-12" max="12" value="0" oninput="djDeckEQ(\'' + id + '\',\'low\',this.value)"><button class="dj-kill" onclick="djDeckKill(\'' + id + '\',\'low\')">K</button></div>'
        + '    <div class="dj-eq-band"><span class="dj-eq-label">MID</span><input type="range" min="-12" max="12" value="0" oninput="djDeckEQ(\'' + id + '\',\'mid\',this.value)"><button class="dj-kill" onclick="djDeckKill(\'' + id + '\',\'mid\')">K</button></div>'
        + '    <div class="dj-eq-band"><span class="dj-eq-label">HI</span><input type="range" min="-12" max="12" value="0" oninput="djDeckEQ(\'' + id + '\',\'high\',this.value)"><button class="dj-kill" onclick="djDeckKill(\'' + id + '\',\'high\')">K</button></div>'
        + '  </div>'
        // Volume
        + '  <div class="dj-vol"><span class="dj-vol-label">VOL</span><input type="range" min="0" max="100" value="80" oninput="djDeckVol(\'' + id + '\',this.value/100)"></div>'
        // Load
        + '  <button class="dj-load" onclick="djLoadFile(\'' + id + '\')" style="border-color:' + c1 + '33;color:' + c1 + ';">&#x1F4C2; CARGAR ' + label + '</button>'
        + '</div>';
    }

    var panel = document.createElement('div');
    panel.id = 'dj-mixer-panel';
    panel.className = 'dj-mixer-panel';
    panel.style.display = 'none';
    panel.innerHTML = ''
      + '<div class="dj-header">'
      + '  <div class="dj-logo">&#x1F3A7; DJ MIXER</div>'
      + '  <div class="dj-master-bpm" id="dj-master-bpm">—</div>'
      + '  <button class="dj-close" onclick="djMixerClose()">&#x2715;</button>'
      + '</div>'
      + '<div class="dj-decks">'
      + deckHTML('a', '#00f5a0', 'A')
      + deckHTML('b', '#3a86ff', 'B')
      + '</div>'
      + '<div class="dj-crossfader-zone">'
      + '  <div class="dj-cf-label">A</div>'
      + '  <div class="dj-cf-track"><input type="range" min="0" max="100" value="50" id="dj-crossfader" oninput="djCrossfade(this.value/100)"></div>'
      + '  <div class="dj-cf-label">B</div>'
      + '</div>'
      + '<input type="file" id="dj-file-a" accept="audio/*" style="display:none" onchange="djFileLoaded(\'a\',this)">'
      + '<input type="file" id="dj-file-b" accept="audio/*" style="display:none" onchange="djFileLoaded(\'b\',this)">';

    document.body.appendChild(panel);
  }

  // ═══ PUBLIC API ═══
  dj.open = function() {
    if (!decks.a) dj.init();
    var panel = document.getElementById('dj-mixer-panel');
    if (panel) panel.style.display = 'flex';
  };

  dj.close = function() {
    var panel = document.getElementById('dj-mixer-panel');
    if (panel) panel.style.display = 'none';
  };

  dj.getDeck = function(id) { return decks[id]; };

  dj.loadFile = function(deckId) {
    document.getElementById('dj-file-' + deckId).click();
  };

  dj.fileLoaded = function(deckId, input) {
    if (input.files && input.files[0]) {
      decks[deckId].loadFile(input.files[0]);
    }
  };

  dj.deckToggle = function(id) { decks[id].togglePlay(); };
  dj.deckCue = function(id) { decks[id].setCue(); };
  dj.deckHotCue = function(id, idx) {
    if (decks[id].hotCues[idx] !== null) decks[id].gotoHotCue(idx);
    else decks[id].setHotCue(idx);
  };
  dj.deckEQ = function(id, band, val) { decks[id].setEQ(band, parseFloat(val)); };
  dj.deckKill = function(id, band) { decks[id].killEQ(band); };
  dj.deckVol = function(id, val) { decks[id].setVolume(val); };
  dj.sync = function() { dj.syncBtoA(); };

  // Auto-init on DOMContentLoaded if DJ mode triggered
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { dj.init(); });
  } else {
    setTimeout(function() { dj.init(); }, 300);
  }

})(window.VibeFlow = window.VibeFlow || {});
