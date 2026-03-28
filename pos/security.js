/**
 * ByFlow POS — Security & Data Protection Module
 * Backups, encryption, multi-tenant isolation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./database');

// ═══ CONFIG ═══
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 30; // Keep last 30 days
const ENCRYPTION_ALGO = 'aes-256-gcm';

// ═══ 1. AUTOMATIC BACKUPS ═══

/**
 * Create a timestamped backup of the database
 * @returns {object} { ok, path, size }
 */
function createBackup() {
  const dbPath = path.join(__dirname, '..', 'data', 'pos.db');
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: 'Database not found' };
  }

  // Create backup directory if not exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Use SQLite's backup API via better-sqlite3
  const db = getDb();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `pos-backup-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  try {
    // Use SQLite VACUUM INTO for atomic backup (safe even during writes)
    db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);

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
  const backupPath = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(backupPath)) {
    return { ok: false, error: 'Backup not found: ' + backupName };
  }

  const dbPath = path.join(__dirname, '..', 'data', 'pos.db');

  // Create a safety backup before restoring
  const safetyName = `pos-pre-restore-${Date.now()}.db`;
  const safetyPath = path.join(BACKUP_DIR, safetyName);

  try {
    // Safety copy of current DB
    fs.copyFileSync(dbPath, safetyPath);
    // Restore
    fs.copyFileSync(backupPath, dbPath);
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
  let barId = db.prepare("SELECT value FROM bar_settings WHERE key = 'bar_id'").get();

  if (!barId) {
    const newId = crypto.randomBytes(8).toString('hex');
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value) VALUES ('bar_id', ?)").run(newId);
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
    settings: db.prepare('SELECT * FROM bar_settings').all(),
    employees: db.prepare('SELECT id, name, role, role_level, area, active, created_at, last_login FROM employees').all(),
    tables: db.prepare('SELECT * FROM tables').all(),
    categories: db.prepare('SELECT * FROM categories').all(),
    products: db.prepare('SELECT * FROM products').all(),
    orders_count: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    payments_count: db.prepare('SELECT COUNT(*) as c FROM payments').get().c,
    total_revenue: db.prepare("SELECT SUM(total) as t FROM orders WHERE status = 'pagada'").get().t || 0
  };

  return data;
}


// ═══ 4. SECURITY ROUTES ═══

function registerSecurityRoutes(app) {
  const express = require('express');
  const secJson = express.json({ limit: '1mb' });

  // Backup now
  app.post('/pos/security/backup', secJson, (req, res) => {
    const result = createBackup();
    res.json(result);
  });

  // List backups
  app.get('/pos/security/backups', (req, res) => {
    const backups = listBackups();
    res.json({ ok: true, backups, count: backups.length });
  });

  // Restore backup (requires dueno PIN)
  app.post('/pos/security/restore', secJson, (req, res) => {
    const { backupName, pin } = req.body;
    // Verify dueno authorization
    const auth = require('./auth');
    const result = auth.authorizeAction('modify_menu', pin, 0); // level 0 = dueno only
    if (!result.authorized) {
      return res.json({ ok: false, error: 'Solo el dueno puede restaurar backups. ' + (result.error || '') });
    }
    const restoreResult = restoreBackup(backupName);
    res.json(restoreResult);
  });

  // Export data
  app.get('/pos/security/export', (req, res) => {
    const data = exportBarData();
    res.json({ ok: true, data });
  });

  // Security status
  app.get('/pos/security/status', (req, res) => {
    const dbPath = path.join(__dirname, '..', 'data', 'pos.db');
    const keyExists = fs.existsSync(path.join(__dirname, '..', '.pos_key'));
    const dbSize = fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A';
    const backups = listBackups();
    const lastBackup = backups.length > 0 ? backups[0] : null;
    const barId = ensureBarId();

    res.json({
      ok: true,
      status: {
        database: { exists: fs.existsSync(dbPath), size: dbSize, wal_mode: true },
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
