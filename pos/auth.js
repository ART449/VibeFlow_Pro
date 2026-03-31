/**
 * ByFlow POS — Authentication & RBAC Module
 * PIN-based auth with bcrypt, token store, rate limiting
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('./database');
const {
  normalizeEmail,
  getLicenseStatusByEmail,
  getLicenseStatusByBarId
} = require('./license-utils');

// ═══ CONSTANTS ═══
const BCRYPT_ROUNDS = 10;
const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 min lockout after max attempts

// Role hierarchy: lower number = more power
const ROLE_LEVELS = {
  dueno: 0, gerente: 1, capitan: 2, cajero: 3,
  mesero: 4, bartender: 5, cocinero: 6, dj: 7, seguridad: 8
};

// Allowed roles for validation
const VALID_ROLES = Object.keys(ROLE_LEVELS);

// What each role can access
const ROLE_PERMISSIONS = {
  dueno: ['*'],
  gerente: [
    'tables', 'orders', 'payments', 'kitchen', 'bar', 'karaoke',
    'inventory', 'reports', 'employees', 'shifts', 'covers',
    'discounts', 'cancel_items', 'corte_all', 'happy_hour', 'reservations', 'config'
  ],
  capitan: [
    'tables', 'orders', 'payments', 'kitchen', 'bar', 'karaoke',
    'covers', 'assign_tables', 'assign_waiters', 'cancel_items',
    'discounts_10', 'reservations'
  ],
  cajero: ['payments', 'corte_own', 'tickets', 'cfdi', 'tables_view'],
  mesero: ['tables_own', 'orders_own', 'request_payment', 'karaoke_add'],
  bartender: ['bar_monitor', 'bar_ready', 'inventory_bar', 'bar'],
  cocinero: ['kitchen_monitor', 'kitchen_ready', 'kitchen'],
  dj: ['karaoke_queue', 'karaoke_next', 'karaoke_add', 'soundboard', 'karaoke'],
  seguridad: ['covers', 'entry_log', 'capacity']
};

// Actions that require authorization from a higher role
const AUTH_REQUIREMENTS = {
  cancel_item: { min_level: 2, label: 'Cancelar item' },
  discount_10: { min_level: 2, label: 'Descuento hasta 10%' },
  discount_20: { min_level: 1, label: 'Descuento 10-20%' },
  discount_max: { min_level: 0, label: 'Descuento 20%+' },
  cortesia: { min_level: 1, label: 'Cortesia (100% gratis)' },
  corte_all: { min_level: 1, label: 'Corte de todas las cajas' },
  modify_menu: { min_level: 0, label: 'Modificar menu/precios' },
  delete_employee: { min_level: 0, label: 'Eliminar empleado' },
  void_payment: { min_level: 1, label: 'Anular pago' },
  restore_backup: { min_level: 0, label: 'Restaurar backup' }
};

// ═══ TOKEN STORE (in-memory, server-side) ═══
const tokenStore = new Map(); // token -> { employeeId, role, role_level, expiresAt }

// Clean expired tokens every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenStore) {
    if (data.expiresAt < now) tokenStore.delete(token);
  }
}, 30 * 60 * 1000);

// ═══ RATE LIMITING (per-IP login attempts) ═══
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

function checkLoginRate(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, error: `Demasiados intentos. Espera ${remaining} segundos.` };
  }

  // Reset if lockout expired
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }

  const record = loginAttempts.get(ip) || { count: 0 };
  record.count += 1;

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
  }

  loginAttempts.set(ip, record);
}

// ═══ PIN HASHING (bcrypt) ═══
function hashPin(pin) {
  return bcrypt.hashSync(pin, BCRYPT_ROUNDS);
}

function verifyPin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}

/**
 * Authenticate employee by PIN, scoped to a specific bar
 * @param {string} pin - 4-6 digit PIN
 * @param {string} ip - client IP for rate limiting
 * @param {string} [barId='default'] - bar_id for multi-tenant isolation
 * @returns {object|null} employee record or null
 */
function authenticate(pin, ip, barId) {
  const effectiveBarId = barId || 'default';

  // Rate limit check
  if (ip) {
    const rateCheck = checkLoginRate(ip);
    if (!rateCheck.allowed) return { error: rateCheck.error };
  }

  const db = getDb();

  // Get active employees scoped to this bar and compare PINs with bcrypt
  const employees = db.prepare(
    'SELECT id, name, pin, role, role_level, active, area, avatar, bar_id FROM employees WHERE active = 1 AND bar_id = ?'
  ).all(effectiveBarId);

  let matched = null;
  for (const emp of employees) {
    if (verifyPin(pin, emp.pin)) {
      matched = emp;
      break;
    }
  }

  if (!matched) {
    if (ip) recordLoginAttempt(ip, false);

    // Audit log failed attempt
    db.prepare(
      "INSERT INTO audit_log (employee_id, action, details, bar_id) VALUES (NULL, 'login_failed', ?, ?)"
    ).run(`Failed login attempt from ${ip || 'unknown'}`, effectiveBarId);

    return null;
  }

  if (ip) recordLoginAttempt(ip, true);

  // Update last login
  db.prepare("UPDATE employees SET last_login = datetime('now') WHERE id = ?").run(matched.id);

  // Audit log
  db.prepare(
    "INSERT INTO audit_log (employee_id, action, details, bar_id) VALUES (?, 'login', ?, ?)"
  ).run(matched.id, `Login: ${matched.name} (${matched.role}) from ${ip || 'unknown'}`, effectiveBarId);

  // Generate and store token (includes bar_id)
  const token = generateToken(matched.id, matched.role, matched.role_level, effectiveBarId);

  // Return without pin hash
  const { pin: _, ...safe } = matched;
  return {
    ...safe,
    bar_id: effectiveBarId,
    permissions: getPermissions(matched.role),
    token
  };
}

/**
 * Generate and store a session token (includes bar_id for multi-tenant)
 */
function generateToken(employeeId, role, roleLevel, barId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, {
    employeeId,
    role,
    role_level: roleLevel,
    bar_id: barId || 'default',
    expiresAt: Date.now() + TOKEN_EXPIRY_MS
  });
  return token;
}

/**
 * Validate a token and return the session data
 * @param {string} token
 * @returns {object|null} session data or null
 */
function validateToken(token) {
  if (!token) return null;
  const session = tokenStore.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  return session;
}

/**
 * Express middleware: require valid token on all POS routes.
 * Attaches req.posSession (with bar_id) and req.barId for tenant isolation.
 */
function authMiddleware(req, res, next) {
  // Skip auth for login, authorize, and first-time owner setup routes
  if (req.path === '/auth/login' || req.path === '/pos/auth/login') return next();
  if (req.path === '/auth/authorize' || req.path === '/pos/auth/authorize') return next();
  if (req.path === '/auth/setup-owner' || req.path === '/pos/auth/setup-owner') return next();
  if (req.path === '/auth/login-email' || req.path === '/pos/auth/login-email') return next();

  // Skip auth for GET on public-ish routes (products, categories for menu display)
  const publicGets = ['/products', '/categories', '/happy-hour/active',
                      '/pos/products', '/pos/categories', '/pos/happy-hour/active'];
  if (req.method === 'GET' && publicGets.includes(req.path)) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;
    const session = validateToken(token);
    req.posSession = session || null;
    req.barId = session?.bar_id || resolveBarId(req);
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido. Inicia sesion con tu PIN.' });
  }

  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Sesion expirada. Vuelve a iniciar sesion.' });
  }

  // Attach session to request
  req.posSession = session;
  // bar_id priority: token session > X-Bar-ID header > 'default'
  req.barId = session.bar_id || req.headers['x-bar-id'] || 'default';

  const licenseStatus = getBarLicenseStatus(req.barId);
  if (!licenseStatus || !licenseStatus.active) {
    return res.status(402).json({ ok: false, error: 'Licencia POS inactiva para este bar. Contacta IArtLabs.' });
  }
  req.posLicense = licenseStatus;
  next();
}

/**
 * Resolve bar_id from request headers (for unauthenticated or public routes)
 */
function resolveBarId(req) {
  return req.headers['x-bar-id'] || 'default';
}

/**
 * Check if employee has permission for an action
 */
function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

function hasAnyPermission(role, permissions) {
  return (permissions || []).some((permission) => hasPermission(role, permission));
}

function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function requireAnyPermission(...permissions) {
  return function(req, res, next) {
    if (!req.posSession) {
      return res.status(401).json({ ok: false, error: 'Sesion requerida' });
    }
    const role = req.posSession.role;
    const allowed = permissions.some((perm) => hasPermission(role, perm));
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'No tienes permisos para esta accion' });
    }
    next();
  };
}

function requireRoleLevel(maxRoleLevel) {
  return function(req, res, next) {
    if (!req.posSession) {
      return res.status(401).json({ ok: false, error: 'Sesion requerida' });
    }
    if ((req.posSession.role_level ?? 999) > maxRoleLevel) {
      return res.status(403).json({ ok: false, error: 'No tienes permisos para esta accion' });
    }
    next();
  };
}

function getBarOwnerEmail(barId) {
  if (!barId || barId === 'default') return '';
  const db = getDb();
  const owner = db.prepare(
    "SELECT email FROM employees WHERE bar_id = ? AND role = 'dueno' AND active = 1 ORDER BY id ASC LIMIT 1"
  ).get(barId);
  return normalizeEmail(owner?.email);
}

function getBarLicenseStatus(barId, ownerEmailHint) {
  if (!barId || barId === 'default') {
    return { ok: true, active: true, plan: 'DEMO', bar_id: barId || 'default', demo: true };
  }

  const hintedEmail = normalizeEmail(ownerEmailHint);
  if (hintedEmail) {
    const byEmail = getLicenseStatusByEmail(hintedEmail);
    if (byEmail && byEmail.bar_id === barId) return byEmail;
  }

  const ownerEmail = getBarOwnerEmail(barId);
  if (ownerEmail) {
    const byOwner = getLicenseStatusByEmail(ownerEmail);
    if (byOwner) return byOwner;
  }

  return getLicenseStatusByBarId(barId);
}

/**
 * Authorize a protected action with a supervisor's PIN
 * @param {string} barId - bar_id for multi-tenant scoping
 * @returns {object} { authorized, authorizer, error }
 */
function authorizeAction(action, supervisorPin, requesterId, barId) {
  const effectiveBarId = barId || 'default';
  const req = AUTH_REQUIREMENTS[action];

  // FIXED: Unknown actions are DENIED, not auto-approved
  if (!req) return { authorized: false, error: 'Accion desconocida: ' + action };

  const db = getDb();
  const employees = db.prepare(
    'SELECT id, name, pin, role, role_level FROM employees WHERE active = 1 AND bar_id = ?'
  ).all(effectiveBarId);

  let supervisor = null;
  for (const emp of employees) {
    if (verifyPin(supervisorPin, emp.pin)) {
      supervisor = emp;
      break;
    }
  }

  if (!supervisor) {
    return { authorized: false, error: 'PIN invalido' };
  }

  if (supervisor.role_level > req.min_level) {
    const needed = getRoleName(req.min_level);
    return {
      authorized: false,
      error: `Se requiere ${needed} o superior. ${supervisor.name} es ${supervisor.role}.`
    };
  }

  // Audit log
  db.prepare(
    "INSERT INTO audit_log (employee_id, action, details) VALUES (?, 'authorize', ?)"
  ).run(supervisor.id, `${supervisor.name} autorizo "${req.label}" para empleado #${requesterId}`);

  return { authorized: true, authorizer: supervisor.name, authorizer_id: supervisor.id };
}

function getRoleName(level) {
  const names = { 0: 'Dueno', 1: 'Gerente', 2: 'Capitan', 3: 'Cajero' };
  return names[level] || 'Nivel ' + level;
}

/**
 * Get the default view/route for a role
 */
function getDefaultView(role) {
  const views = {
    dueno: 'mesas', gerente: 'mesas', capitan: 'mesas', cajero: 'cobrar',
    mesero: 'mis-mesas', bartender: 'barra', cocinero: 'cocina',
    dj: 'karaoke', seguridad: 'cover'
  };
  return views[role] || 'mesas';
}

/**
 * Get sidebar items filtered by role
 */
function getSidebarForRole(role) {
  const all = [
    { id: 'mesas', icon: '🍻', label: 'Mesas', perms: ['tables', 'tables_view'] },
    { id: 'mis-mesas', icon: '📋', label: 'Mis Mesas', perms: ['tables_own'] },
    { id: 'comandas', icon: '📋', label: 'Comandas', perms: ['orders', 'orders_own', 'payments'] },
    { id: 'karaoke', icon: '🎤', label: 'Cola Karaoke', perms: ['karaoke', 'karaoke_queue', 'karaoke_add'] },
    { id: 'cobrar', icon: '💳', label: 'Cobrar', perms: ['payments'] },
    { id: 'reservaciones', icon: '📅', label: 'Reservaciones', perms: ['reservations'] },
    { id: 'cover', icon: '🎫', label: 'Cover / Entrada', perms: ['covers'] },
    { id: 'cocina', icon: '🍳', label: 'Monitor Cocina', perms: ['kitchen', 'kitchen_monitor'] },
    { id: 'barra', icon: '🍸', label: 'Monitor Barra', perms: ['bar', 'bar_monitor'] },
    { id: 'inventario', icon: '📦', label: 'Inventario', perms: ['inventory', 'inventory_bar'] },
    { id: 'reportes', icon: '📊', label: 'Reportes', perms: ['reports'] },
    { id: 'corte', icon: '💰', label: 'Corte de Caja', perms: ['shifts', 'corte_own', 'corte_all'] },
    { id: 'cfdi', icon: '🧾', label: 'Facturacion CFDI', perms: ['cfdi'] },
    { id: 'empleados', icon: '👥', label: 'Empleados', perms: ['employees'] },
    { id: 'config', icon: '⚙️', label: 'Configuracion', perms: ['config'] },
  ];
  return all.filter((item) => hasAnyPermission(role, item.perms));
}

module.exports = {
  authenticate, authMiddleware, validateToken,
  hasPermission, getPermissions, requireAnyPermission, requireRoleLevel,
  getBarLicenseStatus, hashPin, verifyPin,
  authorizeAction, getDefaultView, getSidebarForRole,
  generateTokenForEmployee: generateToken,
  ROLE_LEVELS, ROLE_PERMISSIONS, AUTH_REQUIREMENTS, VALID_ROLES
};
