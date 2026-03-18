/**
 * Colmena ByFlow — Preload Script
 * Context bridge seguro entre main y renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('colmena', {
  // Enviar tarea
  submitTask: (agentId, type, params) =>
    ipcRenderer.invoke('colmena:submit-task', { agentId, type, params }),

  // Obtener estado completo
  getStatus: () => ipcRenderer.invoke('colmena:get-status'),

  // Historial de tareas
  getHistory: (agentId, limit) =>
    ipcRenderer.invoke('colmena:get-history', { agentId, limit }),

  // Escuchar eventos del orquestador
  onTaskComplete: (callback) =>
    ipcRenderer.on('colmena:task-complete', (_e, data) => callback(data)),

  onAgentState: (callback) =>
    ipcRenderer.on('colmena:agent-state', (_e, data) => callback(data)),

  onStatusUpdate: (callback) =>
    ipcRenderer.on('colmena:status-update', (_e, data) => callback(data)),

  // Config
  updateConfig: (key, value) =>
    ipcRenderer.invoke('colmena:config-update', { key, value }),

  // App info
  getAppInfo: () => ipcRenderer.invoke('colmena:app-info')
});
