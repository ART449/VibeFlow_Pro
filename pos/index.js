/**
 * ByFlow POS Eatertainment — Main Module
 * Integrates database, auth, routes, sockets, and security
 *
 * Usage in server.js:
 *   const pos = require('./pos');
 *   await pos.init(app, io);
 */

const { getDb, ensureDbReady, DB_PATH } = require('./database');
const { registerRoutes } = require('./routes');
const { registerPOSSockets } = require('./sockets');
const { registerSecurityRoutes, startAutoBackup, ensureBarId } = require('./security');

async function init(app, io) {
  // Initialize sql.js database (async — must complete before any getDb() call)
  await ensureDbReady();

  const db = getDb();
  console.log('[POS] Database initialized');

  // Ensure bar has unique ID
  const barId = ensureBarId();

  // Register REST API routes
  registerRoutes(app);

  // Register security routes + auto-backup
  registerSecurityRoutes(app);
  startAutoBackup();

  // Register Socket.IO events
  registerPOSSockets(io);

  console.log('[POS] ═══════════════════════════════════════');
  console.log('[POS] ByFlow POS Eatertainment v1.0');
  console.log('[POS] Bar ID: ' + barId);
  console.log('[POS] Database: ' + require('path').basename(DB_PATH));
  console.log('[POS] API: /pos/*');
  console.log('[POS] Security: backups + encryption + audit');
  console.log('[POS] Sockets: /pos namespace');
  console.log('[POS] ═══════════════════════════════════════');
}

module.exports = { init };
