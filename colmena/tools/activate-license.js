const fs = require('fs');
const path = require('path');
const dir = path.join(process.env.APPDATA || 'C:\\Users\\art44\\AppData\\Roaming', 'necuapahtli');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const license = {
  key: 'BF-ENTERPRISE-2K62EIF5WW7V',
  tier: 'enterprise',
  status: 'active',
  activatedAt: new Date().toISOString(),
  fingerprint: 'sandbox-demo'
};
fs.writeFileSync(path.join(dir, 'license.json'), JSON.stringify(license, null, 2));
console.log('LICENSE ENTERPRISE ACTIVADA — 62 agentes desbloqueados');
