/**
 * ByFlow POS — Authentication & RBAC Module
 * PIN-based auth with role hierarchy
 */

const { getDb, hashPin } = require('./database');

// Role hierarchy: lower number = more power
const ROLE_LEVELS = {
  dueno: 0,
  gerente: 1,
  capitan: 2,
  cajero: 3,
  mesero: 4,
  bartender: 5,
  cocinero: 6,
  dj: 7,
  seguridad: 8
};

// What each role can access
const ROLE_PERMISSIONS = {
  dueno: ['*'], // everything
  gerente: [
    'tables', 'orders', 'payments', 'kitchen', 'bar', 'karaoke',
    'inventory', 'reports', 'employees', 'shifts', 'covers',
    'discounts', 'cancel_items', 'corte_all', 'happy_hour', 'reservations'
  ],
  capitan: [
    'tables', 'orders', 'payments', 'kitchen', 'bar', 'karaoke',
    'covers', 'assign_tables', 'assign_waiters', 'cancel_items',
    'discounts_10', 'reservations'
  ],
  cajero: [
    'payments', 'corte_own', 'tickets', 'cfdi', 'tables_view'
  ],
  mesero: [
    'tables_own', 'orders_own', 'request_payment', 'karaoke_add'
  ],
  bartender: [
    'bar_monitor', 'bar_ready', 'inventory_bar'
  ],
  cocinero: [
    'kitchen_monitor', 'kitchen_ready'
  ],
  dj: [
    'karaoke_queue', 'karaoke_next', 'karaoke_add', 'soundboard'
  ],
  seguridad: [
    'covers', 'entry_log', 'capacity'
  ]
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
  void_payment: { min_level: 1, label: 'Anular pago' }
};

/**
 * Authenticate employee by PIN
 * @param {string} pin - 4-6 digit PIN
 * @returns {object|null} employee record or null
 */
function authenticate(pin) {
  const db = getDb();
  const hashed = hashPin(pin);
  const employee = db.prepare(
    'SELECT id, name, pin, role, role_level, active, area, avatar FROM employees WHERE pin = ? AND active = 1'
  ).get(hashed);

  if (!employee) return null;

  // Update last login
  db.prepare("UPDATE employees SET last_login = datetime('now') WHERE id = ?").run(employee.id);

  // Log
  db.prepare('INSERT INTO audit_log (employee_id, action, details) VALUES (?, ?, ?)').run(
    employee.id, 'login', `Login: ${employee.name} (${employee.role})`
  );

  // Return without pin hash
  const { pin: _, ...safe } = employee;
  return {
    ...safe,
    permissions: getPermissions(employee.role),
    token: generateToken(employee.id)
  };
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

/**
 * Get all permissions for a role
 */
function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if an action requires authorization from a higher role
 * @returns {object} { required: bool, min_level: number, label: string }
 */
function requiresAuth(action) {
  const req = AUTH_REQUIREMENTS[action];
  if (!req) return { required: false };
  return { required: true, ...req };
}

/**
 * Authorize a protected action with a supervisor's PIN
 * @param {string} action - action key
 * @param {string} supervisorPin - PIN of the authorizer
 * @param {number} requesterId - employee requesting the action
 * @returns {object} { authorized: bool, authorizer: string, error: string }
 */
function authorizeAction(action, supervisorPin, requesterId) {
  const req = AUTH_REQUIREMENTS[action];
  if (!req) return { authorized: true, authorizer: 'system' };

  const db = getDb();
  const hashed = hashPin(supervisorPin);
  const supervisor = db.prepare(
    'SELECT id, name, role, role_level FROM employees WHERE pin = ? AND active = 1'
  ).get(hashed);

  if (!supervisor) {
    return { authorized: false, error: 'PIN invalido' };
  }

  if (supervisor.role_level > req.min_level) {
    return {
      authorized: false,
      error: `Se requiere ${getRoleName(req.min_level)} o superior. ${supervisor.name} es ${supervisor.role}.`
    };
  }

  // Log the authorization
  db.prepare('INSERT INTO audit_log (employee_id, action, details) VALUES (?, ?, ?)').run(
    supervisor.id,
    'authorize',
    `${supervisor.name} autorizo "${req.label}" para empleado #${requesterId}`
  );

  return { authorized: true, authorizer: supervisor.name, authorizer_id: supervisor.id };
}

function getRoleName(level) {
  const names = { 0: 'Dueno', 1: 'Gerente', 2: 'Capitan', 3: 'Cajero' };
  return names[level] || 'Nivel ' + level;
}

/**
 * Simple token generation (session-based, not JWT for simplicity)
 */
function generateToken(employeeId) {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get the default view/route for a role
 */
function getDefaultView(role) {
  const views = {
    dueno: 'mesas',
    gerente: 'mesas',
    capitan: 'mesas',
    cajero: 'cobrar',
    mesero: 'mis-mesas',
    bartender: 'barra',
    cocinero: 'cocina',
    dj: 'karaoke',
    seguridad: 'cover'
  };
  return views[role] || 'mesas';
}

/**
 * Get sidebar items filtered by role
 */
function getSidebarForRole(role) {
  const all = [
    { id: 'mesas', icon: '🍻', label: 'Mesas', perm: 'tables' },
    { id: 'mis-mesas', icon: '📋', label: 'Mis Mesas', perm: 'tables_own' },
    { id: 'comandas', icon: '📋', label: 'Comandas', perm: 'orders' },
    { id: 'karaoke', icon: '🎤', label: 'Cola Karaoke', perm: 'karaoke' },
    { id: 'cobrar', icon: '💳', label: 'Cobrar', perm: 'payments' },
    { id: 'reservaciones', icon: '📅', label: 'Reservaciones', perm: 'reservations' },
    { id: 'cover', icon: '🎫', label: 'Cover / Entrada', perm: 'covers' },
    { id: 'cocina', icon: '🍳', label: 'Monitor Cocina', perm: 'kitchen' },
    { id: 'barra', icon: '🍸', label: 'Monitor Barra', perm: 'bar' },
    { id: 'inventario', icon: '📦', label: 'Inventario', perm: 'inventory' },
    { id: 'reportes', icon: '📊', label: 'Reportes', perm: 'reports' },
    { id: 'corte', icon: '💰', label: 'Corte de Caja', perm: 'corte_own' },
    { id: 'cfdi', icon: '🧾', label: 'Facturacion CFDI', perm: 'cfdi' },
    { id: 'empleados', icon: '👥', label: 'Empleados', perm: 'employees' },
    { id: 'config', icon: '⚙️', label: 'Configuracion', perm: 'config' },
  ];

  return all.filter(item => hasPermission(role, item.perm));
}

module.exports = {
  authenticate,
  hasPermission,
  getPermissions,
  requiresAuth,
  authorizeAction,
  getDefaultView,
  getSidebarForRole,
  ROLE_LEVELS,
  ROLE_PERMISSIONS,
  AUTH_REQUIREMENTS
};
