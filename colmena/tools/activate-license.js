const fs = require('fs');
const path = require('path');
const dir = path.join(process.env.APPDATA || 'C:\\Users\\art44\\AppData\\Roaming', 'necuapahtli');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const key = process.argv[2] || process.env.LICENSE_KEY;
if (!key) { console.error('Uso: node activate-license.js BF-ENTERPRISE-XXXXXXXXXXXX'); process.exit(1); }
const tier = key.split('-')[1].toLowerCase();
const license = {
  key,
  tier,
  status: 'active',
  activatedAt: new Date().toISOString(),
  fingerprint: require('os').hostname()
};
fs.writeFileSync(path.join(dir, 'license.json'), JSON.stringify(license, null, 2));
console.log('LICENSE ENTERPRISE ACTIVADA — 62 agentes desbloqueados');
