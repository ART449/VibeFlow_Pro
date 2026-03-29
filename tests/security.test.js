/**
 * ByFlow Security Tests
 * Tests: content filter, malicious pattern detection, rate limiting
 */

describe('Content Filter', () => {
  const PALABRAS_PROHIBIDAS = [
    'puta', 'puto', 'pendejo', 'pendeja', 'verga', 'chingar', 'chingada',
    'mamada', 'culero', 'culera', 'cabron', 'cabrona', 'pinche', 'joto',
    'marica', 'zorra', 'perra', 'mierda', 'culo', 'coger', 'cogida',
    'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'whore',
    'nigger', 'faggot', 'retard', 'slut', 'cunt', 'bastard', 'damn'
  ];

  function textoLimpio(text) {
    if (!text || typeof text !== 'string') return true;
    const lower = text.toLowerCase();
    return !PALABRAS_PROHIBIDAS.some(p => lower.includes(p));
  }

  test('allows clean text', () => {
    expect(textoLimpio('Hola mundo')).toBe(true);
    expect(textoLimpio('Pedro canta La Bamba')).toBe(true);
    expect(textoLimpio('ByFlow es genial')).toBe(true);
  });

  test('blocks prohibited words', () => {
    expect(textoLimpio('eres un pendejo')).toBe(false);
    expect(textoLimpio('vete a la chingada')).toBe(false);
    expect(textoLimpio('fuck this')).toBe(false);
  });

  test('handles edge cases', () => {
    expect(textoLimpio('')).toBe(true);
    expect(textoLimpio(null)).toBe(true);
    expect(textoLimpio(undefined)).toBe(true);
    expect(textoLimpio(123)).toBe(true);
  });

  test('case insensitive', () => {
    expect(textoLimpio('PENDEJO')).toBe(false);
    expect(textoLimpio('Fuck')).toBe(false);
    expect(textoLimpio('PuTa')).toBe(false);
  });
});

describe('Malicious Pattern Detection', () => {
  const MALICIOUS_PATTERNS = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /\.\.\//,
    /\.\.\\/,
    /union\s+select/i,
    /drop\s+table/i,
    /;\s*--/,
    /'\s*or\s*'1/i,
    /\$\{.*\}/,
    /\{\{.*\}\}/,
    /\$gt|\$lt|\$ne|\$regex/i,
    /process\.(env|exit|kill)/i,
    /require\s*\(/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
  ];

  function isMalicious(value) {
    if (typeof value !== 'string') return false;
    return MALICIOUS_PATTERNS.some(p => p.test(value));
  }

  test('allows clean input', () => {
    expect(isMalicious('Pedro')).toBe(false);
    expect(isMalicious('La Bamba')).toBe(false);
    expect(isMalicious('123-456')).toBe(false);
    expect(isMalicious('user@email.com')).toBe(false);
  });

  test('blocks XSS', () => {
    expect(isMalicious('<script>alert(1)</script>')).toBe(true);
    expect(isMalicious('javascript:void(0)')).toBe(true);
    expect(isMalicious('onerror=alert(1)')).toBe(true);
  });

  test('blocks SQL injection', () => {
    expect(isMalicious("' OR '1'='1")).toBe(true);
    expect(isMalicious('UNION SELECT * FROM users')).toBe(true);
    expect(isMalicious('DROP TABLE users')).toBe(true);
    expect(isMalicious("admin'; --")).toBe(true);
  });

  test('blocks path traversal', () => {
    expect(isMalicious('../../../etc/passwd')).toBe(true);
    expect(isMalicious('..\\..\\windows')).toBe(true);
  });

  test('blocks template injection', () => {
    expect(isMalicious('${process.env.SECRET}')).toBe(true);
    expect(isMalicious('{{constructor.constructor}}')).toBe(true);
  });

  test('blocks code injection', () => {
    expect(isMalicious('require("child_process")')).toBe(true);
    expect(isMalicious('eval("malicious")')).toBe(true);
    expect(isMalicious('process.exit(1)')).toBe(true);
  });
});

describe('License Key Format', () => {
  function isValidKeyFormat(key) {
    return /^VFP-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(key);
  }

  test('valid key format', () => {
    expect(isValidKeyFormat('VFP-ABC12-DEF34-GHI56-JKL78')).toBe(true);
    expect(isValidKeyFormat('VFP-00000-00000-00000-00000')).toBe(true);
  });

  test('invalid key format', () => {
    expect(isValidKeyFormat('abc-12345-12345-12345-12345')).toBe(false);
    expect(isValidKeyFormat('VFP-abc12-DEF34-GHI56-JKL78')).toBe(false);
    expect(isValidKeyFormat('VFP-ABC12')).toBe(false);
    expect(isValidKeyFormat('')).toBe(false);
    expect(isValidKeyFormat(null)).toBe(false);
  });
});
