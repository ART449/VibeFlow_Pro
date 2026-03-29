(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const player = VF.modules.player = {};

  function bridge() {
    return VF.modules.twinBridge;
  }

  player.initAudioFX = function() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    fxGain = audioCtx.createGain();
    fxGain.gain.value = 0.8;

    fxEqLow = audioCtx.createBiquadFilter();
    fxEqLow.type = 'lowshelf';
    fxEqLow.frequency.value = 250;
    fxEqLow.gain.value = 0;

    fxEqHigh = audioCtx.createBiquadFilter();
    fxEqHigh.type = 'highshelf';
    fxEqHigh.frequency.value = 4000;
    fxEqHigh.gain.value = 0;

    fxDelay = audioCtx.createDelay(2.0);
    fxDelay.delayTime.value = 0.3;
    fxDelayGain = audioCtx.createGain();
    fxDelayGain.gain.value = 0;

    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * 2;
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }

    fxConvolver = audioCtx.createConvolver();
    fxConvolver.buffer = impulse;
    const fxReverbGain = audioCtx.createGain();
    fxReverbGain.gain.value = 0;
    window._fxReverbGain = fxReverbGain;

    fxGain.connect(fxEqLow);
    fxEqLow.connect(fxEqHigh);
    fxEqHigh.connect(audioCtx.destination);

    fxEqHigh.connect(fxDelay);
    fxDelay.connect(fxDelayGain);
    fxDelayGain.connect(fxDelay);
    fxDelayGain.connect(audioCtx.destination);

    fxEqHigh.connect(fxConvolver);
    fxConvolver.connect(fxReverbGain);
    fxReverbGain.connect(audioCtx.destination);
  };

  player.connectAudioToFX = function(audioElement) {
    if (!audioCtx) player.initAudioFX();
    if (fxSource) {
      try { fxSource.disconnect(); } catch {}
    }
    try {
      fxSource = audioCtx.createMediaElementSource(audioElement);
      fxSource.connect(fxGain);
    } catch {}
  };

  player.initFXSliders = function() {
    const slVol = document.getElementById('sl-vol');
    const slReverb = document.getElementById('sl-reverb');
    const slDelay = document.getElementById('sl-delay');
    const slEqLow = document.getElementById('sl-eq-low');
    const slEqHigh = document.getElementById('sl-eq-high');

    if (slVol) slVol.addEventListener('input', (e) => {
      if (!audioCtx) player.initAudioFX();
      fxGain.gain.setTargetAtTime(e.target.value / 100, audioCtx.currentTime, 0.02);
    });
    if (slReverb) slReverb.addEventListener('input', (e) => {
      if (!audioCtx) player.initAudioFX();
      window._fxReverbGain.gain.setTargetAtTime(e.target.value / 100, audioCtx.currentTime, 0.02);
    });
    if (slDelay) slDelay.addEventListener('input', (e) => {
      if (!audioCtx) player.initAudioFX();
      const val = e.target.value / 100;
      fxDelayGain.gain.setTargetAtTime(val * 0.4, audioCtx.currentTime, 0.02);
      fxDelay.delayTime.setTargetAtTime(0.1 + val * 0.5, audioCtx.currentTime, 0.02);
    });
    if (slEqLow) slEqLow.addEventListener('input', (e) => {
      if (!audioCtx) player.initAudioFX();
      fxEqLow.gain.setTargetAtTime(parseFloat(e.target.value), audioCtx.currentTime, 0.02);
    });
    if (slEqHigh) slEqHigh.addEventListener('input', (e) => {
      if (!audioCtx) player.initAudioFX();
      fxEqHigh.gain.setTargetAtTime(parseFloat(e.target.value), audioCtx.currentTime, 0.02);
    });
  };

  player.initVisualizer = function() {
    const canvas = document.getElementById('main-viz');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    window.addEventListener('resize', resize);
    resize();
    const bars = 64;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const h = (Math.sin(Date.now() * 0.002 + i * 0.3) + 1) * 0.5;
        const height = h * canvas.height * 0.4;
        const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - height);
        grad.addColorStop(0, 'rgba(255,0,110,0.5)');
        grad.addColorStop(1, 'rgba(131,56,236,0.05)');
        ctx.fillStyle = grad;
        ctx.fillRect(i * w + 1, canvas.height - height, w - 2, height);
      }
      requestAnimationFrame(draw);
    }

    draw();
  };

  player.abPlay = function(url, filename) {
    _playerEndIsCleanup = true;
    onPlayerEnd(_activePlayerType);
    _playerEndIsCleanup = false;
    if (abAudio) abAudio.pause();
    abAudio = new Audio(url);
    const name = filename.replace(/\.[^.]+$/, '');
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title: name,
        artist: '',
        sourceKind: 'audio-url',
        sourceRef: url,
        sourceAudioName: filename
      });
    }
    document.getElementById('ab-name').textContent = name;
    document.getElementById('audio-bar').classList.add('active');
    document.getElementById('ab-ico-play').style.display = 'none';
    document.getElementById('ab-ico-pause').style.display = 'block';
    try {
      player.connectAudioToFX(abAudio);
    } catch {}
    abAudio.addEventListener('play', () => {
      onPlayerPlay('audio');
      document.getElementById('ab-ico-play').style.display = 'none';
      document.getElementById('ab-ico-pause').style.display = 'block';
    });
    abAudio.addEventListener('pause', () => {
      onPlayerPause('audio');
      document.getElementById('ab-ico-play').style.display = 'block';
      document.getElementById('ab-ico-pause').style.display = 'none';
    });
    abAudio.addEventListener('timeupdate', () => {
      if (!abAudio || !abAudio.duration) return;
      const pct = (abAudio.currentTime / abAudio.duration) * 100;
      document.getElementById('ab-fill').style.width = pct + '%';
      document.getElementById('ab-time').textContent = player.fmtTime(abAudio.currentTime) + ' / ' + player.fmtTime(abAudio.duration);
      if (_twinMode && tpState.isLRC && tpState.autoScrolling) _feedTimeToLRC(abAudio.currentTime);
    });
    abAudio.addEventListener('ended', () => {
      onPlayerEnd('audio');
      document.getElementById('ab-ico-play').style.display = 'block';
      document.getElementById('ab-ico-pause').style.display = 'none';
    });
    abAudio.play().catch((e) => showToast('Error: ' + e.message));
  };

  player.abToggle = function() {
    if (!abAudio) return;
    if (abAudio.paused) {
      abAudio.play();
      document.getElementById('ab-ico-play').style.display = 'none';
      document.getElementById('ab-ico-pause').style.display = 'block';
    } else {
      abAudio.pause();
      document.getElementById('ab-ico-play').style.display = 'block';
      document.getElementById('ab-ico-pause').style.display = 'none';
    }
  };

  player.abSeek = function(e) {
    if (!abAudio || !abAudio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    abAudio.currentTime = pct * abAudio.duration;
  };

  player.abClose = function() {
    if (abAudio) {
      abAudio.pause();
      abAudio = null;
    }
    if (localAudio) {
      localAudio.pause();
      localAudio = null;
    }
    onPlayerEnd(_activePlayerType);
    document.getElementById('audio-bar').classList.remove('active');
  };

  player.fmtTime = function(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };

  player.openLocalAudio = function() {
    document.getElementById('local-audio-input').click();
  };

  player.handleLocalAudio = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (localAudio) {
      localAudio.pause();
      localAudio = null;
    }
    _playerEndIsCleanup = true;
    onPlayerEnd(_activePlayerType);
    _playerEndIsCleanup = false;

    const url = URL.createObjectURL(file);
    localAudio = new Audio(url);
    const filename = file.name.replace(/\.[^.]+$/, '');
    if (bridge() && typeof bridge().setTrackMeta === 'function') {
      bridge().setTrackMeta({
        title: filename,
        artist: '',
        sourceKind: 'local-audio',
        sourceRef: filename,
        sourceAudioName: file.name
      });
    }

    document.getElementById('ab-name').textContent = filename;
    document.getElementById('audio-bar').classList.add('active');
    document.getElementById('ab-ico-play').style.display = 'none';
    document.getElementById('ab-ico-pause').style.display = 'block';

    try {
      player.connectAudioToFX(localAudio);
    } catch {}

    localAudio.addEventListener('play', () => {
      onPlayerPlay('local');
      document.getElementById('ab-ico-play').style.display = 'none';
      document.getElementById('ab-ico-pause').style.display = 'block';
    });
    localAudio.addEventListener('pause', () => {
      onPlayerPause('local');
      document.getElementById('ab-ico-play').style.display = 'block';
      document.getElementById('ab-ico-pause').style.display = 'none';
    });
    localAudio.addEventListener('ended', () => {
      onPlayerEnd('local');
      document.getElementById('ab-ico-play').style.display = 'block';
      document.getElementById('ab-ico-pause').style.display = 'none';
    });
    localAudio.addEventListener('timeupdate', () => {
      if (!localAudio || !localAudio.duration) return;
      const pct = (localAudio.currentTime / localAudio.duration) * 100;
      document.getElementById('ab-fill').style.width = pct + '%';
      document.getElementById('ab-time').textContent = player.fmtTime(localAudio.currentTime) + ' / ' + player.fmtTime(localAudio.duration);
      if (_twinMode && tpState.isLRC && tpState.autoScrolling) {
        _feedTimeToLRC(localAudio.currentTime);
      }
    });

    abAudio = localAudio;
    localAudio.play().catch((e) => showToast('Error: ' + e.message));
    showToast('Musica: ' + filename);
    input.value = '';
  };
})(window.VibeFlow);
