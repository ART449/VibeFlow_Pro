/**
 * ByFlow POS Auth Tests
 * Tests: PIN hashing, role hierarchy, permissions, token management
 */

const bcrypt = require('bcryptjs');

describe('POS PIN Hashing', () => {
  const BCRYPT_ROUNDS = 10;

  test('hashes PIN with bcrypt', async () => {
    const pin = '123456';
    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    expect(hash).not.toBe(pin);
    expect(hash.startsWith('$2')).toBe(true);
  });

  test('verifies correct PIN', async () => {
    const pin = '000000';
    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const match = await bcrypt.compare(pin, hash);
    expect(match).toBe(true);
  });

  test('rejects wrong PIN', async () => {
    const pin = '000000';
    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const match = await bcrypt.compare('999999', hash);
    expect(match).toBe(false);
  });

  test('same PIN produces different hashes (salted)', async () => {
    const pin = '123456';
    const hash1 = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const hash2 = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    expect(hash1).not.toBe(hash2);
  });
});

describe('POS Role Hierarchy', () => {
  const ROLE_LEVELS = {
    dueno: 100,
    gerente: 80,
    capitan: 60,
    cajero: 50,
    mesero: 40,
    bartender: 40,
    cocinero: 30,
    hostess: 20,
    dj: 20
  };

  test('dueno has highest level', () => {
    expect(ROLE_LEVELS.dueno).toBeGreaterThan(ROLE_LEVELS.gerente);
    expect(ROLE_LEVELS.dueno).toBeGreaterThan(ROLE_LEVELS.mesero);
  });

  test('gerente outranks capitan', () => {
    expect(ROLE_LEVELS.gerente).toBeGreaterThan(ROLE_LEVELS.capitan);
  });

  test('mesero and bartender are equal', () => {
    expect(ROLE_LEVELS.mesero).toBe(ROLE_LEVELS.bartender);
  });

  test('all roles have numeric levels', () => {
    Object.values(ROLE_LEVELS).forEach(level => {
      expect(typeof level).toBe('number');
      expect(level).toBeGreaterThan(0);
    });
  });
});

describe('POS Permissions', () => {
  const ROLE_PERMISSIONS = {
    dueno: ['*'],
    gerente: ['order:create', 'order:modify', 'order:void', 'order:discount', 'payment:process', 'payment:refund', 'menu:edit', 'report:view-all', 'employee:manage', 'shift:manage', 'kds:view', 'kds:mark-ready'],
    mesero: ['order:create', 'order:modify', 'kds:view'],
    cocinero: ['kds:view', 'kds:mark-ready'],
  };

  function hasPermission(role, perm) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    if (perms.includes('*')) return true;
    return perms.includes(perm);
  }

  test('dueno has all permissions (wildcard)', () => {
    expect(hasPermission('dueno', 'order:void')).toBe(true);
    expect(hasPermission('dueno', 'anything')).toBe(true);
    expect(hasPermission('dueno', 'payment:refund')).toBe(true);
  });

  test('mesero can create orders but not void', () => {
    expect(hasPermission('mesero', 'order:create')).toBe(true);
    expect(hasPermission('mesero', 'order:void')).toBe(false);
  });

  test('cocinero can view and mark KDS but not create orders', () => {
    expect(hasPermission('cocinero', 'kds:view')).toBe(true);
    expect(hasPermission('cocinero', 'kds:mark-ready')).toBe(true);
    expect(hasPermission('cocinero', 'order:create')).toBe(false);
  });

  test('unknown role has no permissions', () => {
    expect(hasPermission('hacker', 'order:create')).toBe(false);
  });
});

describe('Token Generation', () => {
  const crypto = require('crypto');

  test('generates 32-byte hex token', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  test('tokens are unique', () => {
    const t1 = crypto.randomBytes(32).toString('hex');
    const t2 = crypto.randomBytes(32).toString('hex');
    expect(t1).not.toBe(t2);
  });
});

describe('Bar ID from Email', () => {
  const crypto = require('crypto');

  function emailToBarId(email) {
    const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
    return 'bar_' + hash.substring(0, 16);
  }

  test('generates deterministic bar_id', () => {
    const id1 = emailToBarId('test@example.com');
    const id2 = emailToBarId('test@example.com');
    expect(id1).toBe(id2);
  });

  test('different emails produce different bar_ids', () => {
    const id1 = emailToBarId('bar1@example.com');
    const id2 = emailToBarId('bar2@example.com');
    expect(id1).not.toBe(id2);
  });

  test('case insensitive', () => {
    const id1 = emailToBarId('Test@Example.com');
    const id2 = emailToBarId('test@example.com');
    expect(id1).toBe(id2);
  });

  test('trims whitespace', () => {
    const id1 = emailToBarId('  test@example.com  ');
    const id2 = emailToBarId('test@example.com');
    expect(id1).toBe(id2);
  });

  test('starts with bar_ prefix', () => {
    const id = emailToBarId('test@example.com');
    expect(id.startsWith('bar_')).toBe(true);
    expect(id.length).toBe(20); // bar_ + 16 hex chars
  });
});
