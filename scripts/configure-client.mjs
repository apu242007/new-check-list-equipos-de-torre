import { readFile, writeFile } from 'node:fs/promises';
const clientId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId || ''))
  throw Error('Uso: node scripts/configure-client.mjs <Client-ID-público>');
const path = 'public/config.json';
const config = JSON.parse(await readFile(path, 'utf8'));
config.clientId = clientId;
await writeFile(path, JSON.stringify(config, null, 2) + '\n');
console.log('Client ID configurado localmente. Ejecutar npm run build para actualizar la app.');
