/**
 * Colmena ByFlow — IPC Handlers
 * Maneja comunicación entre renderer y main process
 */
const { ipcMain } = require('electron');
const { createLogger } = require('../core/logger');
const log = createLogger('ipc');

function setupIPC(orchestrator, mainWindow) {
  // Enviar tarea
  ipcMain.handle('colmena:submit-task', async (_event, { agentId, type, params }) => {
    try {
      if (!agentId || !type) throw new Error('agentId y type son requeridos');
      const taskId = await orchestrator.submitTask(agentId, type, params || {});
      return { ok: true, taskId };
    } catch (err) {
      log.error('submit-task error', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  // Estado completo
  ipcMain.handle('colmena:get-status', () => {
    try {
      return { ok: true, data: orchestrator.getStatus() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Historial
  ipcMain.handle('colmena:get-history', (_event, { agentId, limit }) => {
    try {
      return { ok: true, data: orchestrator.getHistory(agentId, limit || 20) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // App info
  ipcMain.handle('colmena:app-info', () => ({
    ok: true,
    data: {
      version: '1.0.0',
      name: 'Colmena ByFlow',
      author: 'ArT-AtR (Arturo Torres)',
      company: 'IArtLabs'
    }
  }));

  // Config update (placeholder)
  ipcMain.handle('colmena:config-update', (_event, { key, value }) => {
    log.info('Config update', { key, value });
    return { ok: true };
  });

  // Eventos del orquestador → renderer
  orchestrator.onEvent((event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`colmena:${event}`, data);
    }
  });

  log.info('IPC handlers registrados');
}

module.exports = { setupIPC };
