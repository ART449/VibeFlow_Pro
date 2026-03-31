const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUBS_FILE = process.env.DATA_PATH
  ? path.join(process.env.DATA_PATH, 'subscriptions.json')
  : path.join(__dirname, '..', 'data', 'subscriptions.json');

function readSubscriptions() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return { users: {}, posLicenses: {} };
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
  } catch (_) {
    return { users: {}, posLicenses: {} };
  }
}

function writeSubscriptions(data) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[POS-LICENSE] Write error:', err.message);
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function emailToBarId(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return '';
  const hash = crypto.createHash('sha256').update(cleanEmail).digest('hex');
  return 'bar_' + hash.slice(0, 16);
}

function isActiveLicenseRecord(license, user) {
  if (!license) return false;
  return user?.status === 'active' || license.plan === 'POS_VITALICIO';
}

function getLicenseStatusByEmail(email, subs) {
  const cleanEmail = normalizeEmail(email);
  const source = subs || readSubscriptions();
  if (!cleanEmail) return null;

  // Owner always has vitalicio license (hardcoded founder)
  const FOUNDER_EMAILS = ['elricondelgeekdearturo@gmail.com'];
  if (FOUNDER_EMAILS.includes(cleanEmail)) {
    // Auto-seed if not in file yet
    if (!source.posLicenses?.[cleanEmail]) {
      if (!source.posLicenses) source.posLicenses = {};
      source.posLicenses[cleanEmail] = {
        key: 'VFP-FOUNDER', plan: 'POS_VITALICIO', email: cleanEmail, type: 'pos',
        activated: true, activatedAt: new Date().toISOString(), founder: true
      };
      if (!source.users) source.users = {};
      source.users[cleanEmail] = { posLicenseKey: 'VFP-FOUNDER', posActive: true, plan: 'POS_VITALICIO', status: 'active' };
      writeSubscriptions(source);
    }
    return {
      ok: true, active: true, plan: 'POS_VITALICIO', email: cleanEmail,
      activatedAt: source.posLicenses[cleanEmail]?.activatedAt || new Date().toISOString(),
      bar_id: emailToBarId(cleanEmail)
    };
  }

  const license = source.posLicenses?.[cleanEmail];
  if (!license) return null;

  const user = source.users?.[cleanEmail] || {};
  return {
    ok: true,
    active: isActiveLicenseRecord(license, user),
    plan: license.plan,
    email: cleanEmail,
    activatedAt: license.activatedAt,
    bar_id: emailToBarId(cleanEmail)
  };
}

function getLicenseStatusByBarId(barId, subs) {
  const cleanBarId = typeof barId === 'string' ? barId.trim() : '';
  const source = subs || readSubscriptions();
  if (!cleanBarId) return null;

  for (const [email, license] of Object.entries(source.posLicenses || {})) {
    if (emailToBarId(email) !== cleanBarId) continue;
    const user = source.users?.[email] || {};
    return {
      ok: true,
      active: isActiveLicenseRecord(license, user),
      plan: license.plan,
      email,
      activatedAt: license.activatedAt,
      bar_id: cleanBarId
    };
  }

  return null;
}

module.exports = {
  SUBS_FILE,
  readSubscriptions,
  writeSubscriptions,
  normalizeEmail,
  emailToBarId,
  getLicenseStatusByEmail,
  getLicenseStatusByBarId
};
