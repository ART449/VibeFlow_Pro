
// ═══════════════════════════════════════════════════════════════════════════
// BYFLOW — Vive Cantando (powered by IArtLabs)
// ═══════════════════════════════════════════════════════════════════════════

const SOCKET_URL = location.origin;
var socket = null;

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

// ── Room ID: cada dispositivo tiene su sesion aislada ───────────────────────
function getMyRoomId() {
  // Check URL param first (Remote mode joins DJ's room)
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  if (urlRoom) { sessionStorage.setItem('bf_room', urlRoom); return urlRoom; }
  // DJ: generate or reuse session room
  let rid = sessionStorage.getItem('bf_room');
  if (!rid) {
    rid = Math.random().toString(36).substring(2, 8).toUpperCase();
    sessionStorage.setItem('bf_room', rid);
  }
  return rid;
}
const _myRoomId = getMyRoomId();

function copyRoomLink() { return window.VibeFlow.modules.socket.copyRoomLink.apply(this, arguments); }
function showRoomBadge() { return window.VibeFlow.modules.socket.showRoomBadge.apply(this, arguments); }
function openKaraokeDisplay() { return window.VibeFlow.modules.socket.openKaraokeDisplay.apply(this, arguments); }
function connectSocket() { return window.VibeFlow.modules.socket.connectSocket.apply(this, arguments); }

const tpState = {
  words: [],        // flat word array for backward compat
  lines: [],        // [{text, words:[{text,globalIdx}], lineIdx}]
  rawText: '',
  lrcData: null,    // [{time, text}] if LRC mode
  isLRC: false,
  currentIdx: -1,   // current word index (global)
  currentLine: -1,  // current line index
  speed: 1.0,
  autoScrolling: false,
  intervalId: null,
  lrcTimerId: null,
  startTime: 0,     // for LRC playback
  pauseOffset: 0,   // accumulated pause time for LRC
  syncOffset: 0,    // user-adjustable offset in seconds (+ = lyrics earlier, - = lyrics later)
};

// ── Sync offset controls ─────────────────────────────────────────────
let _wordToLine = {};
function tpSyncNudge() { return window.VibeFlow.modules.lyrics.tpSyncNudge.apply(this, arguments); }
function tpSyncReset() { return window.VibeFlow.modules.lyrics.tpSyncReset.apply(this, arguments); }
function parseLRC() { return window.VibeFlow.modules.lyrics.parseLRC.apply(this, arguments); }
function setLyrics() { return window.VibeFlow.modules.lyrics.setLyrics.apply(this, arguments); }
function buildLRCDisplay() { return window.VibeFlow.modules.lyrics.buildLRCDisplay.apply(this, arguments); }
function buildPlainDisplay() { return window.VibeFlow.modules.lyrics.buildPlainDisplay.apply(this, arguments); }
function tpClickWord() { return window.VibeFlow.modules.lyrics.tpClickWord.apply(this, arguments); }
function highlightWord() { return window.VibeFlow.modules.lyrics.highlightWord.apply(this, arguments); }
function updateLineHighlights() { return window.VibeFlow.modules.lyrics.updateLineHighlights.apply(this, arguments); }
function updateProgress() { return window.VibeFlow.modules.lyrics.updateProgress.apply(this, arguments); }
function updateModeBadge() { return window.VibeFlow.modules.lyrics.updateModeBadge.apply(this, arguments); }
function tpNext() { return window.VibeFlow.modules.lyrics.tpNext.apply(this, arguments); }
function tpPrev() { return window.VibeFlow.modules.lyrics.tpPrev.apply(this, arguments); }
function tpNextLine() { return window.VibeFlow.modules.lyrics.tpNextLine.apply(this, arguments); }
function tpPrevLine() { return window.VibeFlow.modules.lyrics.tpPrevLine.apply(this, arguments); }
function tpReset() { return window.VibeFlow.modules.lyrics.tpReset.apply(this, arguments); }
function tpSpeedUp() { return window.VibeFlow.modules.lyrics.tpSpeedUp.apply(this, arguments); }
function tpSpeedDown() { return window.VibeFlow.modules.lyrics.tpSpeedDown.apply(this, arguments); }
function toggleAutoScroll() { return window.VibeFlow.modules.lyrics.toggleAutoScroll.apply(this, arguments); }
function startAutoScroll() { return window.VibeFlow.modules.lyrics.startAutoScroll.apply(this, arguments); }
function startManualScroll() { return window.VibeFlow.modules.lyrics.startManualScroll.apply(this, arguments); }
function startLRCPlayback() { return window.VibeFlow.modules.lyrics.startLRCPlayback.apply(this, arguments); }
function stopAutoScroll() { return window.VibeFlow.modules.lyrics.stopAutoScroll.apply(this, arguments); }
function updatePlayBtn() { return window.VibeFlow.modules.lyrics.updatePlayBtn.apply(this, arguments); }
function updateWordCounter() { return window.VibeFlow.modules.lyrics.updateWordCounter.apply(this, arguments); }
function tpToggleFullscreen() { return window.VibeFlow.modules.lyrics.tpToggleFullscreen.apply(this, arguments); }
function openLyricsSearch() { return window.VibeFlow.modules.lyrics.openLyricsSearch.apply(this, arguments); }
function closeLyricsSearch() { return window.VibeFlow.modules.lyrics.closeLyricsSearch.apply(this, arguments); }
function searchLyricsOnline() { return window.VibeFlow.modules.lyrics.searchLyricsOnline.apply(this, arguments); }
function loadOnlineLyrics() { return window.VibeFlow.modules.lyrics.loadOnlineLyrics.apply(this, arguments); }

let colaCache = [];
function fetchCola() { return window.VibeFlow.modules.queue.fetchCola.apply(this, arguments); }
function renderCola() { return window.VibeFlow.modules.queue.renderCola.apply(this, arguments); }
function agregarCola() { return window.VibeFlow.modules.queue.agregarCola.apply(this, arguments); }
function eliminarCola() { return window.VibeFlow.modules.queue.eliminarCola.apply(this, arguments); }
function openColaModal() { return window.VibeFlow.modules.queue.openColaModal.apply(this, arguments); }
function closeColaModal() { return window.VibeFlow.modules.queue.closeColaModal.apply(this, arguments); }
function renderColaModal() { return window.VibeFlow.modules.queue.renderColaModal.apply(this, arguments); }
function mAgregarCola() { return window.VibeFlow.modules.queue.mAgregarCola.apply(this, arguments); }
function activarCantante() { return window.VibeFlow.modules.queue.activarCantante.apply(this, arguments); }

// renderMesas extraida a /js/modules/catalog-admin.js
// toggleMesa extraida a /js/modules/catalog-admin.js

// ── Canciones ─────────────────────────────────────────────────────────────
// agregarCancion extraida a /js/modules/catalog-admin.js

// buscarLetraYoutube extraida a /js/modules/catalog-admin.js

// ── Mode Switch ───────────────────────────────────────────────────────────
// mode switch extraido a /js/modules/mode-switch.js

// ── License System (Online Activation) ────────────────────────────────────
// sistema de licencias extraido a /js/modules/license-system.js

// estado de bares extraido a /js/modules/license-system.js

// ── Menú del Establecimiento ──────────────────────────────────────────────
// menu de bares extraido a /js/modules/bares-panel.js

// noches de talento y QR extraidos a /js/modules/events-talent.js

const OLLAMA_URL = 'http://localhost:11434';
var iaOnline     = false;
var iaBackend    = 'none'; // 'grok' | 'ollama' | 'none'
var iaGrokModel  = '';

function checkOllamaStatus() { return window.VibeFlow.modules.gflow.checkOllamaStatus.apply(this, arguments); }
function getOllamaModels() { return window.VibeFlow.modules.gflow.getOllamaModels.apply(this, arguments); }
function iaAddMsg() { return window.VibeFlow.modules.gflow.iaAddMsg.apply(this, arguments); }
function iaSend() { return window.VibeFlow.modules.gflow.iaSend.apply(this, arguments); }
function iaQuick() { return window.VibeFlow.modules.gflow.iaQuick.apply(this, arguments); }
function iaQuery() { return window.VibeFlow.modules.gflow.iaQuery.apply(this, arguments); }
function _bfEncode() { return window.VibeFlow.modules.gflow._bfEncode.apply(this, arguments); }
function _bfDecode() { return window.VibeFlow.modules.gflow._bfDecode.apply(this, arguments); }
function _bfWatermark() { return window.VibeFlow.modules.gflow._bfWatermark.apply(this, arguments); }
function bfDetectWatermark() { return window.VibeFlow.modules.gflow.bfDetectWatermark.apply(this, arguments); }
function stampSignature() { return window.VibeFlow.modules.gflow.stampSignature.apply(this, arguments); }
function offerLoadLyrics() { return window.VibeFlow.modules.gflow.offerLoadLyrics.apply(this, arguments); }
function getFallbackResponse() { return window.VibeFlow.modules.gflow.getFallbackResponse.apply(this, arguments); }

function openLyricStudio() { return window.VibeFlow.modules.studio.openLyricStudio.apply(this, arguments); }
function closeLyricStudio() { return window.VibeFlow.modules.studio.closeLyricStudio.apply(this, arguments); }
// catalogo y datos del estudio extraidos a /js/modules/studio-data.js

// utilidades de UI, catalogo y paneles extraidas a /js/modules/misc-ui.js

function saveUserProfile() { return window.VibeFlow.modules.settings.saveUserProfile.apply(this, arguments); }
function settingsActivateLicense() { return window.VibeFlow.modules.settings.settingsActivateLicense.apply(this, arguments); }
function updateLicenseUI() { return window.VibeFlow.modules.settings.updateLicenseUI.apply(this, arguments); }
function loadUserProfile() { return window.VibeFlow.modules.settings.loadUserProfile.apply(this, arguments); }
function toggleDarkMode() { return window.VibeFlow.modules.settings.toggleDarkMode.apply(this, arguments); }
function setTpFontSize() { return window.VibeFlow.modules.settings.setTpFontSize.apply(this, arguments); }
function toggleVisualizer() { return window.VibeFlow.modules.settings.toggleVisualizer.apply(this, arguments); }
function toggleJingle() { return window.VibeFlow.modules.settings.toggleJingle.apply(this, arguments); }
function toggleAutoPromo() { return window.VibeFlow.modules.settings.toggleAutoPromo.apply(this, arguments); }
function toggleAutoQueue() { return window.VibeFlow.modules.settings.toggleAutoQueue.apply(this, arguments); }
function loadSettingsState() { return window.VibeFlow.modules.settings.loadSettingsState.apply(this, arguments); }

function gflowEstQuick() { return window.VibeFlow.modules.gflow.gflowEstQuick.apply(this, arguments); }
function gflowEstSend() { return window.VibeFlow.modules.gflow.gflowEstSend.apply(this, arguments); }
function gflowEstAddMsg() { return window.VibeFlow.modules.gflow.gflowEstAddMsg.apply(this, arguments); }
function gflowEstQuery() { return window.VibeFlow.modules.gflow.gflowEstQuery.apply(this, arguments); }
function gflowEstLoadTP() { return window.VibeFlow.modules.gflow.gflowEstLoadTP.apply(this, arguments); }
function gflowEstSaveLetter() { return window.VibeFlow.modules.gflow.gflowEstSaveLetter.apply(this, arguments); }
function gflowEstUpdateStatus() { return window.VibeFlow.modules.gflow.gflowEstUpdateStatus.apply(this, arguments); }

function _uSearchRenderLyrics() { return window.VibeFlow.modules.search._uSearchRenderLyrics.apply(this, arguments); }
function uSearch() { return window.VibeFlow.modules.search.uSearch.apply(this, arguments); }
function uSearchLyrics() { return window.VibeFlow.modules.search.uSearchLyrics.apply(this, arguments); }
function uSearchYoutube() { return window.VibeFlow.modules.search.uSearchYoutube.apply(this, arguments); }
function uSearchJamendo() { return window.VibeFlow.modules.search.uSearchJamendo.apply(this, arguments); }
function uLoadLyrics() { return window.VibeFlow.modules.search.uLoadLyrics.apply(this, arguments); }
function uPlayYoutube() { return window.VibeFlow.modules.search.uPlayYoutube.apply(this, arguments); }
function uSearchClose() { return window.VibeFlow.modules.search.uSearchClose.apply(this, arguments); }

// menu DJ extraido a /js/modules/bares-panel.js

function loadStats() { return window.VibeFlow.modules.settings.loadStats.apply(this, arguments); }

// shell UI, bienvenida, tutorial y reproductor local extraidos a /js/modules/misc-ui.js

// estudio de beats extraido a /js/modules/estudio-beats.js

// panel vistas extraido a /js/modules/vistas-panel.js

<script src="/js/core/namespace.js">