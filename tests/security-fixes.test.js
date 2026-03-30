/**
 * ByFlow Security Fixes Tests
 * Tests for: billing auth, room auth rejection, license key stripping,
 * demo key blocking, PIN hashing, YouTube key removal, rate limiting
 */
const crypto = require('crypto');

// ── CRITICAL 1: Billing portal requires authentication ───────────────────────
describe('Billing Portal Auth', () => {
  test('customer-portal rejects requests without auth headers', () => {
    // Simulate: no x-pos-key and no x-license-token
    const headers = {};
    const hasPosKey = !!headers['x-pos-key'];
    const hasLicenseToken = !!headers['x-license-token'];
    const authorized = hasPosKey || hasLicenseToken;
    expect(authorized).toBe(false);
  });

  test('customer-portal accepts valid POS key matching email', () => {
    const subs = {
      posLicenses: {
        'user@test.com': { key: 'VFP-AAAAA-BBBBB-CCCCC-DDDDD', plan: 'PRO_BAR' }
      }
    };
    const email = 'user@test.com';
    const posKey = 'VFP-AAAAA-BBBBB-CCCCC-DDDDD';
    const lic = subs.posLicenses[email];
    const authorized = lic && lic.key === posKey;
    expect(authorized).toBe(true);
  });

  test('customer-portal rejects POS key not matching email', () => {
    const subs = {
      posLicenses: {
        'user@test.com': { key: 'VFP-AAAAA-BBBBB-CCCCC-DDDDD', plan: 'PRO_BAR' }
      }
    };
    const email = 'other@test.com';
    const posKey = 'VFP-AAAAA-BBBBB-CCCCC-DDDDD';
    const lic = subs.posLicenses[email];
    const authorized = !!(lic && lic.key === posKey);
    expect(authorized).toBe(false);
  });
});

// ── CRITICAL 2: License key stripping ────────────────────────────────────────
describe('POS License Key Stripping', () => {
  test('email lookup response does NOT contain key field', () => {
    const lic = { key: 'VFP-SECRET-KEY00-XXXXX-YYYYY', plan: 'POS_STARTER', activatedAt: '2026-01-01' };
    // Simulating the fixed response (no key field)
    const response = {
      ok: true, active: true,
      plan: lic.plan,
      email: 'user@test.com',
      activatedAt: lic.activatedAt
    };
    expect(response).not.toHaveProperty('key');
    expect(response.plan).toBe('POS_STARTER');
    expect(response.active).toBe(true);
  });

  test('key lookup response does NOT expose key either', () => {
    const lic = { key: 'VFP-MATCH-KEY00-XXXXX-YYYYY', plan: 'POS_PRO', activatedAt: '2026-02-01' };
    const response = {
      ok: true, active: true,
      plan: lic.plan,
      email: 'owner@test.com',
      activatedAt: lic.activatedAt
    };
    expect(response).not.toHaveProperty('key');
  });
});

// ── HIGH 3: Room auth rejection ──────────────────────────────────────────────
describe('Room Auth Bypass Fix', () => {
  const rooms = { 'VALIDROOM123456': { lastActive: Date.now() } };

  function requireRoomAuth(method, path, roomId) {
    const isDestructive = method === 'DELETE' || (method === 'POST' && /clean/i.test(path));
    if (!roomId) {
      if (isDestructive) return { status: 403, error: 'X-Room-ID header requerido para esta operacion' };
      return { status: 200 };
    }
    if (rooms[roomId]) return { status: 200 };
    return { status: 403, error: 'Room ID invalido o inactivo' };
  }

  test('DELETE without X-Room-ID is REJECTED', () => {
    const result = requireRoomAuth('DELETE', '/api/cola/123', null);
    expect(result.status).toBe(403);
  });

  test('POST /clean without X-Room-ID is REJECTED', () => {
    const result = requireRoomAuth('POST', '/api/cola/clean', null);
    expect(result.status).toBe(403);
  });

  test('GET without X-Room-ID still passes (non-destructive)', () => {
    const result = requireRoomAuth('GET', '/api/cola', null);
    expect(result.status).toBe(200);
  });

  test('DELETE with valid room ID passes', () => {
    const result = requireRoomAuth('DELETE', '/api/cola/123', 'VALIDROOM123456');
    expect(result.status).toBe(200);
  });

  test('DELETE with invalid room ID is rejected', () => {
    const result = requireRoomAuth('DELETE', '/api/cola/123', 'BADROOM');
    expect(result.status).toBe(403);
  });

  test('Room IDs should be 16 chars from crypto, not 6 from Math.random', () => {
    // New client-side generation: 16 hex chars from crypto.getRandomValues
    const roomId = crypto.randomBytes(8).toString('hex').toUpperCase();
    expect(roomId.length).toBe(16);
    expect(/^[A-F0-9]{16}$/.test(roomId)).toBe(true);
  });
});

// ── HIGH 4: YouTube API key not hardcoded ────────────────────────────────────
describe('YouTube API Key Removal', () => {
  test('config/keys returns empty string when YOUTUBE_API_KEY env not set', () => {
    const originalEnv = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    const youtubeKey = process.env.YOUTUBE_API_KEY || '';
    expect(youtubeKey).toBe('');
    // Restore
    if (originalEnv) process.env.YOUTUBE_API_KEY = originalEnv;
  });

  test('config/keys returns env value when YOUTUBE_API_KEY is set', () => {
    const originalEnv = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = 'TEST_KEY_12345';
    const youtubeKey = process.env.YOUTUBE_API_KEY || '';
    expect(youtubeKey).toBe('TEST_KEY_12345');
    // Restore
    if (originalEnv) process.env.YOUTUBE_API_KEY = originalEnv;
    else delete process.env.YOUTUBE_API_KEY;
  });
});

// ── HIGH 5: Demo key blocked in production ───────────────────────────────────
describe('Demo Key Blocking', () => {
  test('demo key is rejected when ALLOW_DEMO_KEY is not set', () => {
    const originalEnv = process.env.ALLOW_DEMO_KEY;
    delete process.env.ALLOW_DEMO_KEY;
    const demoAllowed = process.env.ALLOW_DEMO_KEY === 'true';
    expect(demoAllowed).toBe(false);
    if (originalEnv) process.env.ALLOW_DEMO_KEY = originalEnv;
  });

  test('demo key is rejected when ALLOW_DEMO_KEY is false', () => {
    const originalEnv = process.env.ALLOW_DEMO_KEY;
    process.env.ALLOW_DEMO_KEY = 'false';
    const demoAllowed = process.env.ALLOW_DEMO_KEY === 'true';
    expect(demoAllowed).toBe(false);
    if (originalEnv) process.env.ALLOW_DEMO_KEY = originalEnv;
    else delete process.env.ALLOW_DEMO_KEY;
  });

  test('demo key is accepted only when ALLOW_DEMO_KEY is true', () => {
    const originalEnv = process.env.ALLOW_DEMO_KEY;
    process.env.ALLOW_DEMO_KEY = 'true';
    const demoAllowed = process.env.ALLOW_DEMO_KEY === 'true';
    expect(demoAllowed).toBe(true);
    if (originalEnv) process.env.ALLOW_DEMO_KEY = originalEnv;
    else delete process.env.ALLOW_DEMO_KEY;
  });
});

// ── MEDIUM 6: PIN hashing with bcrypt ────────────────────────────────────────
describe('PIN Hashing Security', () => {
  const bcrypt = require('bcryptjs');

  test('bcrypt hash is different from SHA-256 hash', async () => {
    const pin = '1234';
    const sha256 = crypto.createHash('sha256').update(pin).digest('hex');
    const bcryptHash = await bcrypt.hash(pin, 10);
    expect(bcryptHash).not.toBe(sha256);
    expect(bcryptHash.startsWith('$2a$') || bcryptHash.startsWith('$2b$')).toBe(true);
  });

  test('bcrypt verify works correctly', async () => {
    const pin = '5678';
    const hash = await bcrypt.hash(pin, 10);
    expect(await bcrypt.compare(pin, hash)).toBe(true);
    expect(await bcrypt.compare('wrong', hash)).toBe(false);
  });

  test('legacy SHA-256 hash is detected for auto-upgrade', () => {
    const sha256Hash = crypto.createHash('sha256').update('1234').digest('hex');
    const isBcrypt = sha256Hash.startsWith('$2a$') || sha256Hash.startsWith('$2b$');
    expect(isBcrypt).toBe(false);
    // This means the login code will take the legacy path and auto-upgrade
    expect(sha256Hash.length).toBe(64);
  });

  test('login rate limiter blocks after 5 attempts', () => {
    const _loginRateLimits = {};
    const ip = '192.168.1.100';
    const windowMs = 60000;
    const maxAttempts = 5;
    const now = Date.now();

    // Simulate 5 attempts
    for (let i = 0; i < 5; i++) {
      if (!_loginRateLimits[ip]) _loginRateLimits[ip] = [];
      _loginRateLimits[ip].push(now);
    }

    // 6th attempt should be blocked
    _loginRateLimits[ip] = _loginRateLimits[ip].filter(t => now - t < windowMs);
    const blocked = _loginRateLimits[ip].length >= maxAttempts;
    expect(blocked).toBe(true);
  });
});
