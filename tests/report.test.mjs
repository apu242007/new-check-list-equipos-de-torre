import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { parseCatalog, newDraft } from '../src/domain.mjs';
import { wrapText, buildReportPdf, buildReport, bytesToBase64, base64ToBytes } from '../src/report.mjs';

const source = readFileSync(new URL('../docs/checklist-fuente.md', import.meta.url), 'utf8');
const catalog = parseCatalog(source);

// A well-known minimal valid 1x1 JPEG, used only as a fixture for embedJpg().
const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

test('wrapText corta en el ancho pedido y nunca devuelve línea vacía sin texto', async () => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const long = 'Verificar integridad estructural de los escalones de la escalera de acceso.';
  const lines = wrapText(long, font, 10, 120);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(font.widthOfTextAtSize(l, 10) <= 120 + 1);
  assert.deepEqual(wrapText('', font, 10, 120), ['']);
  assert.deepEqual(wrapText('   ', font, 10, 120), ['']);
});

test('buildReportPdf produce un PDF válido con todas las secciones y estados', async () => {
  const draft = newDraft(catalog, 'test-report');
  Object.assign(draft.general, {
    equipment: 'TKR-01',
    well: 'POZO-1',
    date: '2026-09-08',
    inspectors: 'Inspector',
  });
  draft.answers[catalog[0].items[0].id] = { state: 'NO OK', observation: 'Fisura visible.' };
  draft.answers[catalog[0].items[1].id] = { state: 'OK' };
  const bytes = await buildReportPdf(draft, catalog, {});
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');
  const pdfDoc = await PDFDocument.load(bytes);
  assert.ok(pdfDoc.getPageCount() > 1, 'un catálogo de 248 ítems debe generar más de una página');
});

test('buildReportPdf incrusta una miniatura sin romper el documento', async () => {
  const draft = newDraft(catalog, 'test-report-photo');
  const itemId = catalog[0].items[0].id;
  draft.answers[itemId] = { state: 'NO OK', observation: 'Con foto.' };
  const bytes = await buildReportPdf(draft, catalog, { [itemId]: TINY_JPEG });
  const pdfDoc = await PDFDocument.load(bytes);
  assert.ok(pdfDoc.getPageCount() >= 1);
});

test('buildReport arma el nombre de archivo y produce un PDF codificado en base64', async () => {
  const draft = newDraft(catalog, 'test-report-full');
  Object.assign(draft.general, {
    equipment: 'TKR-01',
    well: 'POZO-1',
    date: '2026-09-08',
    inspectors: 'Inspector',
  });
  const report = await buildReport(draft, catalog, async () => null);
  assert.equal(report.filename, 'preauditoria-test-report-full.pdf');
  const bytes = base64ToBytes(report.contentBase64);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');
});

test('bytesToBase64 y base64ToBytes son inversas para datos grandes', () => {
  const original = new Uint8Array(200000).map((_, i) => i % 256);
  const roundTrip = base64ToBytes(bytesToBase64(original));
  assert.deepEqual(roundTrip, original);
});
