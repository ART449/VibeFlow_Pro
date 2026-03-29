/**
 * ByFlow POS — API Rate Limiter / Spending Brake
 * Kaizen 5S: prevents runaway API costs
 *
 * Tracks daily API calls and blocks when limit is reached.
 * Configurable from admin panel via bar_settings.
 * Scoped by bar_id for multi-tenant isolation.
 */

const { getDb } = require('./database');

/**
 * Check if an API call is allowed (under daily limit)
 * @param {string} [barId='default'] - bar_id for multi-tenant scoping
 * @returns {{ allowed: boolean, remaining: number, limit: number, used: number }}
 */
function checkApiLimit(barId) {
  const effectiveBarId = barId || 'default';
  const db = getDb();
  const settings = {};

  // Read settings scoped by bar_id
  const rows = db.prepare(
    "SELECT key, value FROM bar_settings WHERE key LIKE 'api_%' AND bar_id = ?"
  ).all(effectiveBarId);
  for (const r of rows) settings[r.key] = r.value;

  const limit = parseInt(settings.api_daily_limit) || 500;
  const used = parseInt(settings.api_calls_today) || 0;
  const action = settings.api_limit_action || 'block'; // 'block' or 'warn'

  // Auto-reset at midnight (check if date changed)
  const today = new Date().toISOString().slice(0, 10);
  const lastReset = settings.api_last_reset || '';
  if (lastReset !== today) {
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES ('api_calls_today', '0', ?)").run(effectiveBarId);
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES ('api_last_reset', ?, ?)").run(today, effectiveBarId);
    return { allowed: true, remaining: limit, limit, used: 0 };
  }

  const remaining = Math.max(0, limit - used);
  const allowed = action === 'warn' ? true : remaining > 0;

  return { allowed, remaining, limit, used, action };
}

/**
 * Record an API call (increment counter)
 * @param {number} count - number of calls to record (default 1)
 * @param {string} [barId='default'] - bar_id for multi-tenant scoping
 */
function recordApiCall(count, barId) {
  const effectiveBarId = barId || 'default';
  const db = getDb();
  const n = parseInt(count) || 1;
  db.prepare(
    "UPDATE bar_settings SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT) WHERE key = 'api_calls_today' AND bar_id = ?"
  ).run(n, effectiveBarId);
}

/**
 * Get current API usage stats
 * @param {string} [barId='default'] - bar_id for multi-tenant scoping
 */
function getApiUsage(barId) {
  const effectiveBarId = barId || 'default';
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM bar_settings WHERE key LIKE 'api_%' AND bar_id = ?").all(effectiveBarId);
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;

  const limit = parseInt(settings.api_daily_limit) || 500;
  const used = parseInt(settings.api_calls_today) || 0;
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;

  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    percentage: pct,
    action: settings.api_limit_action || 'block',
    status: pct >= 100 ? 'blocked' : pct >= 80 ? 'warning' : 'ok'
  };
}

module.exports = { checkApiLimit, recordApiCall, getApiUsage };
