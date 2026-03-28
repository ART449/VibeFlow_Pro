/**
 * ByFlow POS — API Rate Limiter / Spending Brake
 * Kaizen 5S: prevents runaway API costs
 *
 * Tracks daily API calls and blocks when limit is reached.
 * Configurable from admin panel via bar_settings.
 */

const { getDb } = require('./database');

/**
 * Check if an API call is allowed (under daily limit)
 * @returns {{ allowed: boolean, remaining: number, limit: number, used: number }}
 */
function checkApiLimit() {
  const db = getDb();
  const settings = {};
  db.prepare('SELECT key, value FROM bar_settings WHERE key IN (?, ?, ?)').bind(
    'api_daily_limit', 'api_calls_today', 'api_limit_action'
  );

  // Read settings
  const rows = db.prepare(
    "SELECT key, value FROM bar_settings WHERE key LIKE 'api_%'"
  ).all();
  for (const r of rows) settings[r.key] = r.value;

  const limit = parseInt(settings.api_daily_limit) || 500;
  const used = parseInt(settings.api_calls_today) || 0;
  const action = settings.api_limit_action || 'block'; // 'block' or 'warn'

  // Auto-reset at midnight (check if date changed)
  const today = new Date().toISOString().slice(0, 10);
  const lastReset = settings.api_last_reset || '';
  if (lastReset !== today) {
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value) VALUES ('api_calls_today', '0')").run();
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value) VALUES ('api_last_reset', ?)").run(today);
    return { allowed: true, remaining: limit, limit, used: 0 };
  }

  const remaining = Math.max(0, limit - used);
  const allowed = action === 'warn' ? true : remaining > 0;

  return { allowed, remaining, limit, used, action };
}

/**
 * Record an API call (increment counter)
 * @param {number} count - number of calls to record (default 1)
 */
function recordApiCall(count) {
  const db = getDb();
  const n = parseInt(count) || 1;
  db.prepare(
    "UPDATE bar_settings SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT) WHERE key = 'api_calls_today'"
  ).run(n);
}

/**
 * Get current API usage stats
 */
function getApiUsage() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM bar_settings WHERE key LIKE 'api_%'").all();
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
