/**
 * Colmena ByFlow — Electron Main Process
 * Sistema multi-agente autónomo con dashboard 3D
 * powered by IArtLabs — ArT-AtR (Arturo Torres)
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createTray } = require('./tray');
const { setupIPC } = require('./ipc-handlers');
const Orchestrator = require('../core/orchestrator');
const { initDb } = require('../core/db');
const { createLogger } = require('../core/logger');

// Agentes
const ClipFlow = require('../agents/clip-flow');
const BolitaDJ = require('../agents/bolita-dj');
const GFlow = require('../agents/gflow');
const Michi = require('../agents/michi');
const RobotDJ = require('../agents/robot-dj');

const log = createLogger('main');
let mainWindow = null;
let tray = null;
let orchestrator = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Colmena ByFlow',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: true,
      sandbox: false
    },
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0f',
      symbolColor: '#ffffff',
      height: 36
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Minimizar al tray en vez de cerrar
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
}

function initOrchestrator() {
  orchestrator = new Orchestrator();

  // Registrar los 5 agentes
  orchestrator.registerAgent(new ClipFlow());
  orchestrator.registerAgent(new BolitaDJ());
  orchestrator.registerAgent(new GFlow());
  orchestrator.registerAgent(new Michi());
  orchestrator.registerAgent(new RobotDJ());

  // Activar schedules
  orchestrator.setupSchedules();

  log.info('🐝 Colmena ByFlow iniciada — 5 agentes registrados');
  return orchestrator;
}

app.whenReady().then(async () => {
  log.info('Electron ready');

  // Inicializar DB (async por sql.js WASM)
  await initDb();

  // Inicializar orquestador y agentes
  orchestrator = initOrchestrator();

  // Crear ventana
  mainWindow = createWindow();

  // System tray
  tray = createTray(mainWindow);

  // IPC
  setupIPC(orchestrator, mainWindow);

  // macOS: reabrir ventana
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

// Cleanup
app.on('before-quit', () => {
  app.isQuitting = true;
  if (orchestrator) orchestrator.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
