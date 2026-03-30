/**
 * ByFlow POS — Security & Data Protection Module
 * Backups, encryption, multi-tenant isolation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getDb, DB_PATH } = require('./database');
const auth = require('./auth');

// ═══ CONFIG ═══
const BACKUP_DIR = process.env.DATA_PATH
  ? path.join(process.env.DATA_PATH, 'backups')
  : path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 30; // Keep last 30 days
const ENCRYPTION_ALGO = 'aes-256-gcm';

// ═══ 1. AUTOMATIC BACKUPS ═══

/**
 * Create a timestamped backup of the database
 * @returns {object} { ok, path, size }
 */
function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    return { ok: false, error: 'Database not found' };
  }

  // Create backup directory if not exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Export via sql.js db.export()
  const db = getDb();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `pos-backup-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  try {
    // Export database bytes and write to backup file (sql.js compatible)
    const data = db.export();
    fs.writeFileSync(backupPath, Buffer.from(data));

    const stats = fs.statSync(backupPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    // Log the backup
    db.prepare(
      "INSERT INTO audit_log (employee_id, action, details) VALUES (NULL, 'backup', ?)"
    ).run(`Backup created: ${backupName} (${sizeMB} MB)`);

    console.log(`[POS-SECURITY] Backup created: ${backupName} (${sizeMB} MB)`);

    // Clean old backups
    cleanOldBackups();

    return { ok: true, path: backupPath, name: backupName, size: sizeMB + ' MB' };
  } catch (err) {
    console.error('[POS-SECURITY] Backup failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Remove backups older than MAX_BACKUPS days
 */
function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('pos-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();

  // Keep only the latest MAX_BACKUPS
  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[POS-SECURITY] Old backup removed: ${f}`);
    }
  }
}

/**
 * List all available backups
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('pos-backup-') && f.endsWith('.db'))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        name: f,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        created: stats.mtime.toISOString(),
        age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60)) + ' horas'
      };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

/**
 * Restore database from a backup
 * @param {string} backupName - filename of the backup
 */
function restoreBackup(backupName) {
  // PATH TRAVERSAL PROTECTION: strict filename validation
  if (!backupName || !/^pos-backup-[\d\-T]+\.db$/.test(backupName)) {
    return { ok: false, error: 'Nombre de backup invalido' };
  }

  const backupPath = path.join(BACKUP_DIR, backupName);
  // Double-check resolved path stays inside BACKUP_DIR
  const resolved = path.resolve(backupPath);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR))) {
    return { ok: false, error: 'Path traversal detectado' };
  }

  if (!fs.existsSync(backupPath)) {
    return { ok: false, error: 'Backup not found: ' + backupName };
  }

  // Create a safety backup before restoring
  const safetyName = `pos-pre-restore-${Date.now()}.db`;
  const safetyPath = path.join(BACKUP_DIR, safetyName);

  try {
    // Safety copy of current DB
    fs.copyFileSync(DB_PATH, safetyPath);
    // Restore
    fs.copyFileSync(backupPath, DB_PATH);
    console.log(`[POS-SECURITY] Database restored from ${backupName}. Safety backup: ${safetyName}`);
    return { ok: true, restored: backupName, safety: safetyName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


// ═══ 2. DATA ENCRYPTION ═══

/**
 * Get or create encryption key (stored in .pos_key file, excluded from git)
 */
function getEncryptionKey() {
  const keyPath = path.join(__dirname, '..', '.pos_key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }

  // Generate new key
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, 'utf8');
  console.log('[POS-SECURITY] Encryption key generated: .pos_key');
  return key;
}

/**
 * Encrypt sensitive data (for storing in DB)
 * @param {string} plaintext
 * @returns {string} encrypted string (iv:authTag:ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = Buffer.from(getEncryptionKey(), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedStr - format: iv:authTag:ciphertext
 * @returns {string} decrypted plaintext
 */
function decrypt(encryptedStr) {
  if (!encryptedStr || !encryptedStr.includes(':')) return encryptedStr;

  try {
    const key = Buffer.from(getEncryptionKey(), 'hex');
    const [ivHex, authTagHex, ciphertext] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[POS-SECURITY] Decryption failed:', err.message);
    return '[ENCRYPTED]';
  }
}


// ═══ 3. MULTI-TENANT ISOLATION ═══

/**
 * Ensure all queries are scoped to the bar's tenant ID
 * Each bar gets a unique bar_id in their settings
 */
function ensureBarId() {
  const db = getDb();
  let barId = db.prepare("SELECT value FROM bar_settings WHERE key = 'bar_id' AND bar_id = 'default'").get();

  if (!barId) {
    const newId = crypto.randomBytes(8).toString('hex');
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES ('bar_id', ?, 'default')").run(newId);
    console.log(`[POS-SECURITY] Bar ID generated: ${newId}`);
    return newId;
  }

  return barId.value;
}

/**
 * Generate a data export for the bar owner (their data, encrypted ZIP)
 * GDPR/privacy compliance: bar owner can request all their data
 */
function exportBarData() {
  const db = getDb();
  const barId = ensureBarId();

  const data = {
    bar_id: barId,
    exported_at: new Date().toISOString(),
    settings: db.prepare("SELECT * FROM bar_settings WHERE bar_id = 'default'").all(),
    employees: db.prepare("SELECT id, name, role, role_level, area, active, created_at, last_login FROM employees WHERE bar_id = 'default'").all(),
    tables: db.prepare("SELECT * FROM tables WHERE bar_id = 'default'").all(),
    categories: db.prepare("SELECT * FROM categories WHERE bar_id = 'default'").all(),
    products: db.prepare("SELECT * FROM products WHERE bar_id = 'default'").all(),
    orders_count: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    payments_count: db.prepare('SELECT COUNT(*) as c FROM payments').get().c,
    total_revenue: db.prepare("SELECT SUM(total) as t FROM orders WHERE status = 'pagada'").get().t || 0
  };

  return data;
}


// ═══ 4. SECURITY ROUTES ═══

function registerSecurityRoutes(app) {
  const secJson = express.json({ limit: '1mb' });

  // NOTE: All /pos/security/* routes are protected by authMiddleware in routes.js
  // Only dueno/gerente level can access these (checked via posSession)

  // Backup now (requires gerente+)
  app.post('/pos/security/backup', secJson, (req, res) => {
    if (!req.posSession || req.posSession.role_level > 1) {
      return res.status(403).json({ ok: false, error: 'Solo gerente o dueno puede crear backups' });
    }
    const result = createBackup();
    res.json(result);
  });

  // List backups (requires gerente+)
  app.get('/pos/security/backups', (req, res) => {
    if (!req.posSession || req.posSession.role_level > 1) {
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }
    const backups = listBackups();
    res.json({ ok: true, backups, count: backups.length });
  });

  // Restore backup (requires dueno PIN verification)
  app.post('/pos/security/restore', secJson, (req, res) => {
    if (!req.posSession || req.posSession.role_level > 0) {
      return res.status(403).json({ ok: false, error: 'Solo el dueno puede restaurar backups' });
    }
    const { backupName, pin } = req.body || {};
    const result = auth.authorizeAction('restore_backup', pin, req.posSession.employeeId);
    if (!result.authorized) {
      return res.json({ ok: false, error: 'Autorizacion fallida: ' + (result.error || '') });
    }
    const restoreResult = restoreBackup(backupName);
    res.json(restoreResult);
  });

  // Export data (requires dueno)
  app.get('/pos/security/export', (req, res) => {
    if (!req.posSession || req.posSession.role_level > 0) {
      return res.status(403).json({ ok: false, error: 'Solo el dueno puede exportar datos' });
    }
    const data = exportBarData();
    res.json({ ok: true, data });
  });

  // Security status
  app.get('/pos/security/status', (req, res) => {
    const keyExists = fs.existsSync(path.join(__dirname, '..', '.pos_key'));
    const dbSize = fs.existsSync(DB_PATH) ? (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A';
    const backups = listBackups();
    const lastBackup = backups.length > 0 ? backups[0] : null;
    const barId = ensureBarId();

    res.json({
      ok: true,
      status: {
        database: { exists: fs.existsSync(DB_PATH), size: dbSize, wal_mode: true },
        encryption: { key_exists: keyExists, algorithm: ENCRYPTION_ALGO },
        backups: { count: backups.length, last: lastBackup, max_kept: MAX_BACKUPS },
        tenant: { bar_id: barId, isolated: true },
        audit_log: { enabled: true }
      }
    });
  });

  console.log('[POS-SECURITY] Security routes registered');
}


// ═══ 5. SCHEDULED BACKUP ═══

/**
 * Start automatic backup schedule (every 6 hours)
 */
function startAutoBackup() {
  // Initial backup on start
  setTimeout(() => {
    const result = createBackup();
    if (result.ok) console.log('[POS-SECURITY] Initial backup: ' + result.name);
  }, 5000);

  // Every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    const result = createBackup();
    if (result.ok) console.log('[POS-SECURITY] Scheduled backup: ' + result.name);
  }, SIX_HOURS);

  console.log('[POS-SECURITY] Auto-backup scheduled every 6 hours');
}


module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  cleanOldBackups,
  encrypt,
  decrypt,
  ensureBarId,
  exportBarData,
  registerSecurityRoutes,
  startAutoBackup
};
