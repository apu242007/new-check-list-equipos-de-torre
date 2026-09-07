import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { newDraft } from '../src/domain.mjs';
import { buildPayload, sendInspection } from '../src/delivery.mjs';
globalThis.crypto ||= webcrypto;
const catalog = [
  { id: 1, title: 'Accesos', items: [{ id: 1, text: 'Verificar escalera.', section: 'Accesos' }] },
];
const endpoint = 'https://test.environment.api.powerplatform.com/submit';
function draft() {
  const d = newDraft(catalog, crypto.randomUUID());
  Object.assign(d.general, {
    equipment: 'TKR-01',
    well: 'Prueba',
    date: '2026-09-07',
    inspectors: 'Inspector',
  });
  d.answers[1] = { state: 'N/A' };
  return d;
}
test('payload permite solamente campos del checklist y traduce estados', async () => {
  const d = draft();
  d.general.recipient = 'someone@example.com';
  const p = await buildPayload(d, catalog, async () => null);
  assert.equal(p.answers[0].state, 'NA');
  assert.ok(!('recipient' in p.general));
  assert.ok(!('remote' in p));
});
test('la foto se carga desde el almacenamiento real, no desde el nombre declarado', async () => {
  const d = draft();
  d.answers[1] = {
    state: 'NO OK',
    responsible: 'Supervisor',
    deadline: '2026-09-09',
    action: 'Corregir',
    evidence: 'Foto',
    photo: { id: 'f', name: 'foto.jpg', mime: 'image/jpeg', size: 30 },
  };
  await assert.rejects(
    buildPayload(d, catalog, async () => null),
    /foto/i,
  );
});
test('aceptado no significa confirmado; consulta hasta guardar y enviar correo', async () => {
  const d = draft();
  const calls = [];
  const states = [];
  await sendInspection({ submissionUrl: endpoint }, d, catalog, {
    getPhoto: async () => null,
    checkpoint: () => {},
    onStatus: (s) => states.push(s),
    pause: async () => {},
    fetcher: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify(
          calls.length === 1
            ? { status: 'processing', headerId: 9 }
            : { status: 'complete', headerId: 9, emailState: 'sent' },
        ),
        { status: calls.length === 1 ? 202 : 200 },
      );
    },
  });
  assert.deepEqual(
    calls.map((c) => c.mode),
    ['submit', 'status'],
  );
  assert.equal(d.delivery.stage, 'confirmed');
  const count = calls.length;
  await sendInspection({ submissionUrl: endpoint }, d, catalog, {
    getPhoto: async () => null,
    checkpoint: () => {},
    onStatus: () => {},
    fetcher: async () => {
      throw Error('No debe reenviar');
    },
  });
  assert.equal(calls.length, count);
});
test('nunca declara éxito si falla el correo o la recepción', async () => {
  const d = draft();
  await assert.rejects(
    sendInspection({ submissionUrl: endpoint }, d, catalog, {
      getPhoto: async () => null,
      checkpoint: () => {},
      onStatus: () => {},
      fetcher: async () =>
        new Response(JSON.stringify({ status: 'failed', emailState: 'unconfirmed' })),
    }),
    /confirm/i,
  );
  assert.notEqual(d.delivery.stage, 'confirmed');
});
