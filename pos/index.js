/**
 * ByFlow POS Eatertainment — Main Module
 * Integrates database, auth, routes, sockets, and security
 *
 * Usage in server.js:
 *   const pos = require('./pos');
 *   pos.init(app, io);
 */

const { getDb } = require('./database');
const { registerRoutes } = require('./routes');
const { registerPOSSockets } = require('./sockets');
const { registerSecurityRoutes, startAutoBackup, ensureBarId } = require('./security');

function init(app, io) {
  // Initialize database (creates tables + seeds if first run)
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
  console.log('[POS] Database: data/pos.db');
  console.log('[POS] API: /pos/*');
  console.log('[POS] Security: backups + encryption + audit');
  console.log('[POS] Sockets: /pos namespace');
  console.log('[POS] ═══════════════════════════════════════');
}

module.exports = { init };
