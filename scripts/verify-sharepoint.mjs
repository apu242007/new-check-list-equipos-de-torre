import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkColumns } from '../src/schema.mjs';
const run = promisify(execFile);
const config = JSON.parse(await readFile('public/config.json', 'utf8'));
async function get(path) {
  const { stdout } = await run(
    'python',
    [
      '-m',
      'azure.cli',
      'rest',
      '--method',
      'get',
      '--url',
      `https://graph.microsoft.com/v1.0/${path}`,
      '--output',
      'json',
    ],
    {
      env: {
        ...process.env,
        AZURE_CONFIG_DIR: join(process.env.LOCALAPPDATA, 'CodexSharePointInspection', 'azure'),
      },
      maxBuffer: 2_000_000,
    },
  );
  return JSON.parse(stdout);
}
async function columns(list) {
  const data = await get(`sites/${config.siteId}/lists/${list}/columns`);
  if (data['@odata.nextLink'])
    throw Error('El esquema requiere paginación adicional; usar la verificación desde la app.');
  return data.value;
}
const [headers, items] = await Promise.all([
  columns(config.headerListId),
  columns(config.itemListId),
]);
checkColumns(headers, items, config);
console.log(
  'PASS: columnas, tipos, opciones y vínculo Recorrida verificados mediante GET. No se modificó SharePoint.',
);
