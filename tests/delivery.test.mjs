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
  assert.equal(p.report.filename, `preauditoria-${d.id}.pdf`);
  assert.ok(p.report.contentBase64.length > 0);
});
test('buildPayload delega la generación del PDF y lo agrega al payload', async () => {
  const d = draft();
  const calls = [];
  const stubReport = { contentBase64: 'stub-bytes', filename: 'stub.pdf' };
  const buildReport = async (draft, catalog, getPhoto) => {
    calls.push({ draft, catalog, getPhoto });
    return stubReport;
  };
  const getPhoto = async () => null;
  const p = await buildPayload(d, catalog, getPhoto, buildReport);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].draft, d);
  assert.equal(calls[0].catalog, catalog);
  assert.equal(calls[0].getPhoto, getPhoto);
  assert.deepEqual(p.report, stubReport);
});
test('payload incluye un resumen de resultados por estado', async () => {
  const summaryCatalog = [
    {
      id: 1,
      title: 'Accesos',
      items: [
        { id: 1, text: 'A', section: 'Accesos' },
        { id: 2, text: 'B', section: 'Accesos' },
        { id: 3, text: 'C', section: 'Accesos' },
        { id: 4, text: 'D', section: 'Accesos' },
        { id: 5, text: 'E', section: 'Accesos' },
      ],
    },
  ];
  const d = newDraft(summaryCatalog, crypto.randomUUID());
  Object.assign(d.general, {
    equipment: 'TKR-01',
    well: 'Prueba',
    date: '2026-09-07',
    inspectors: 'Inspector',
  });
  const photo = { id: 'f', name: 'foto.jpg', mime: 'image/jpeg', size: 300 };
  d.answers[1] = { state: 'OK' };
  d.answers[2] = { state: 'OK' };
  d.answers[3] = { state: 'NO OK', photo };
  d.answers[4] = { state: 'EN PROC', photo };
  d.answers[5] = { state: 'N/A' };
  const p = await buildPayload(
    d,
    summaryCatalog,
    async () => ({ contentBase64: '/9j/xx', id: 'f' }),
    async () => ({ contentBase64: 'stub', filename: 'stub.pdf' }),
  );
  assert.deepEqual(p.summary, {
    ok: 2,
    noOk: 1,
    enProc: 1,
    na: 1,
    sinRevisar: 0,
    hallazgos: 2,
    total: 5,
  });
});
test('la foto se carga desde el almacenamiento real, no desde el nombre declarado', async () => {
  const d = draft();
  d.answers[1] = {
    state: 'NO OK',
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
