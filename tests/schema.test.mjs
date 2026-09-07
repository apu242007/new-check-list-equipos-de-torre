import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkColumns, verifySchema } from '../src/schema.mjs';
const json = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const config = json('public/config.json');
function data() {
  return [
    json('docs/sharepoint-columns.json').value,
    json('docs/sharepoint-item-columns.json').value,
  ];
}
test('contrato válido contra las dos listas inspeccionadas', () => {
  assert.equal(checkColumns(...data(), config), true);
});
test('rechaza columnas, opciones, relación o obligatoriedad incompatibles antes de escribir', () => {
  for (const change of [
    (h, i) => (i.find((c) => c.name === 'Estado').choice.choices = ['OK']),
    (h, i) => (i.find((c) => c.name === 'Recorrida').lookup.listId = 'otra-lista'),
    (h, i) => (i.find((c) => c.name === 'Observaciones').text.allowMultipleLines = false),
    (h, i) => (i.find((c) => c.name === 'ItemId').readOnly = true),
    (h) => h.push({ name: 'Nueva', displayName: 'Nueva', required: true, text: {} }),
  ]) {
    const [h, i] = data();
    change(h, i);
    assert.throws(() => checkColumns(h, i, config));
  }
});
test('verificación remota consulta ambas listas únicamente mediante lecturas', async () => {
  let paths = [];
  const [h, i] = data();
  const api = {
    all: async (path) => {
      paths.push(path);
      return path.includes(config.headerListId) ? h : i;
    },
  };
  assert.equal(await verifySchema(api, config), true);
  assert.equal(paths.length, 2);
});
