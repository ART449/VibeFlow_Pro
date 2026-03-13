/**
 * Grok Client — Runs on the local PC/device connected to the TV.
 *
 * Captures the screen periodically, performs basic OCR analysis,
 * and sends detection results to the VibeFlow Pro backend.
 *
 * Required local dependencies (not bundled with Railway deploy):
 *   npm install axios screenshot-desktop tesseract.js
 *
 * Environment variables:
 *   VIBEFLOW_URL  — Backend URL (default: http://localhost:3000)
 *   ROOM_ID       — Room identifier for this display
 *   SCAN_INTERVAL — Milliseconds between scans (default: 2000)
 *   LANG          — OCR language (default: spa)
 */

const axios = require('axios');

let screenshot, createWorker;
try {
  screenshot = require('screenshot-desktop');
  ({ createWorker } = require('tesseract.js'));
} catch {
  console.error(
    'Missing local dependencies. Install them:\n' +
    '  npm install screenshot-desktop tesseract.js\n'
  );
  process.exit(1);
}

const VIBEFLOW_URL = process.env.VIBEFLOW_URL || 'http://localhost:3000';
const ROOM_ID = process.env.ROOM_ID || 'sala1';
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL, 10) || 2000;
const LANG = process.env.LANG || 'spa';

// Debounce: don't fire the same event twice within this window
const DEBOUNCE_MS = 3000;
let lastEvent = '';
let lastEventTime = 0;

function classifyFrame(ocrText) {
  const text = (ocrText || '').toUpperCase();

  if (text.includes('PUNTUACIÓN') || text.includes('SCORE') || text.includes('PUNTOS')) {
    return { frameAnalysis: 'karaoke_song_ending', confidence: 0.9 };
  }
  if (text.includes('GRABANDO') || text.includes('● REC') || text.includes('RECORDING')) {
    return { frameAnalysis: 'studio_recording_active', confidence: 0.95 };
  }
  if (text.includes('STOP') || text.includes('PAUSA') || text.includes('REVIEW TAKE')) {
    return { frameAnalysis: 'studio_recording_stopped', confidence: 0.85 };
  }
  if (text.includes('AD') && text.length < 50) {
    // YouTube ad detected — skip, don't trigger promo
    return { frameAnalysis: 'youtube_ad', confidence: 0.7 };
  }
  if (text.length < 10) {
    return { frameAnalysis: 'room_empty', confidence: 0.7 };
  }

  return { frameAnalysis: 'unknown', confidence: 0.3 };
}

function shouldDebounce(event) {
  const now = Date.now();
  if (event === lastEvent && now - lastEventTime < DEBOUNCE_MS) {
    return true;
  }
  lastEvent = event;
  lastEventTime = now;
  return false;
}

async function analyzeScreen() {
  let worker;
  try {
    const imgBuffer = await screenshot();

    worker = await createWorker(LANG);
    const { data: { text } } = await worker.recognize(imgBuffer);
    await worker.terminate();
    worker = null;

    const { frameAnalysis, confidence } = classifyFrame(text);

    // Skip unknown/low-confidence or debounced events
    if (frameAnalysis === 'unknown' || frameAnalysis === 'youtube_ad') {
      return;
    }
    if (shouldDebounce(frameAnalysis)) {
      return;
    }

    await axios.post(`${VIBEFLOW_URL}/api/grok/analyze`, {
      roomId: ROOM_ID,
      frameAnalysis,
      confidence,
      ocrText: text.substring(0, 500),
      audioLevel: null,
      timestamp: Date.now()
    });

    const ts = new Date().toISOString();
    console.log(`[${ts}] ${frameAnalysis} (${confidence}) → sent`);
  } catch (err) {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
  }
}

console.log(`VibeFlow Grok Client started`);
console.log(`  Backend:  ${VIBEFLOW_URL}`);
console.log(`  Room:     ${ROOM_ID}`);
console.log(`  Interval: ${SCAN_INTERVAL}ms`);
console.log(`  Language: ${LANG}`);

setInterval(analyzeScreen, SCAN_INTERVAL);
