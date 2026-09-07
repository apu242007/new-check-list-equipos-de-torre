import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATES, parseCatalog, newDraft, validateItem, validateDraft, toItemFields, toHeaderFields, fromItemFields, importDraft } from '../src/domain.mjs';

const source = readFileSync(new URL('../docs/checklist-fuente.md', import.meta.url), 'utf8');
const catalog = parseCatalog(source);
const corrected = {state:'NO OK', responsible:'Supervisor', deadline:'2026-09-09', action:'Reemplazar componente', evidence:'Documento E-12'};

test('catálogo conserva exclusivamente cada verificación de las secciones 1 a 16', () => {
  assert.equal(catalog.length,16);
  const technical = source.split('# 1. ')[1].split('# 17. ')[0];
  assert.equal(catalog.flatMap(s=>s.items).length, [...technical.matchAll(/^\* ☐ /gm)].length);
  assert.equal(new Set(catalog.flatMap(s=>s.items.map(i=>i.id))).size,catalog.flatMap(s=>s.items).length);
});
test('cuatro estados exactos y ninguna respuesta predeterminada', () => {
  assert.deepEqual(STATES,['OK','NO OK','EN PROC','N/A']);
  assert.deepEqual(newDraft(catalog,'test').answers,{});
});
test('cada campo correctivo es obligatorio para ambos estados de hallazgo', () => {
  for(const state of ['NO OK','EN PROC']) {
    assert.deepEqual(validateItem({...corrected,state}),[]);
    for(const key of ['responsible','deadline','action','evidence']) assert.ok(validateItem({...corrected,state,[key]:'  '}).length, key);
  }
  assert.deepEqual(validateItem({state:'OK'}),[]);
  assert.deepEqual(validateItem({state:'N/A'}),[]);
  assert.ok(validateItem({state:'Cumple'}).length);
  assert.ok(validateItem({...corrected,deadline:'2026-02-30'}).length);
});
test('cierre exige estado final, fecha, evidencia y verificador sin borrar el hallazgo', () => {
  assert.ok(validateItem({...corrected,finalState:'CERRADO'}).length);
  const closed={...corrected,finalState:'CERRADO',closedAt:'2026-09-10',closureEvidence:'Acta 9',verifiedBy:'Inspector'};
  assert.deepEqual(validateItem(closed),[]);
  assert.ok(validateItem({...closed,closedAt:'invalid'}).length);
  assert.ok(validateItem({...corrected,finalState:'OK'}).length);
});
test('mapeo coincide con las columnas reales y conserva evidencia y cierre', () => {
  const item=catalog[0].items[0];
  const answer={...corrected,observation:'Fisura <script>',finalState:'PENDIENTE',closureEvidence:'',verifiedBy:'',closedAt:''};
  for(const [state,remote] of [['OK','OK'],['NO OK','NO_OK'],['EN PROC','EN_PROC'],['N/A','NA'],['','SIN_REVISAR']]) {
    const fields=toItemFields(item,{...answer,state},'12','EQ-1','draft');
    assert.equal(fields.Estado,remote);
    assert.equal(fields.RecorridaLookupId,'12');
    const allowed=JSON.parse(readFileSync(new URL('../docs/sharepoint-item-columns.json',import.meta.url),'utf8')).value.map(c=>c.name);
    for(const key of Object.keys(fields)) assert.ok(allowed.includes(key)||key==='RecorridaLookupId',key);
    assert.equal(fromItemFields(fields).evidence,answer.evidence);
    assert.equal(fromItemFields(fields).observation,answer.observation);
    assert.equal(fromItemFields(fields).state,state);
  }
});
test('cabecera no genera estadísticas ni antecedentes; conserva datos adicionales', () => {
  const draft=newDraft(catalog,'test');
  Object.assign(draft.general,{equipment:'EQ-1',well:'P-1',location:'Locación',company:'Empresa',supervisor:'Supervisor',date:'2026-09-07',operator:'YPF'});
  const fields=toHeaderFields(draft);
  assert.equal(fields.Equipo,'EQ-1');
  assert.ok(fields.Notas.includes('Locación'));
  assert.equal(fields.Cerrada,false);
  assert.ok(!('ItemsOK' in fields));
  assert.ok(!('PctAvance' in fields));
  assert.ok(!('Origen' in fields));
});
test('importación rechaza datos extraños y restaura solo borrador sin identificadores remotos', () => {
  const draft=newDraft(catalog,'123');
  draft.answers[catalog[0].items[0].id]=corrected;
  assert.equal(importDraft(JSON.stringify(draft),catalog,'copy').id,'copy');
  for(const raw of ['null','{}','{bad',JSON.stringify({...draft,answers:{unknown:corrected}}),JSON.stringify({...draft,general:[]})]) assert.throws(()=>importDraft(raw,catalog,'copy'));
});
test('validación completa exige datos generales, revisar todos y cerrar hallazgos', () => {
  const draft=newDraft(catalog,'test');
  assert.ok(validateDraft(draft,catalog).length);
  Object.assign(draft.general,{equipment:'EQ',well:'Pozo',date:'2026-09-07',inspectors:'Inspector'});
  assert.deepEqual(validateDraft(draft,catalog),[]);
  draft.closed=true;
  assert.ok(validateDraft(draft,catalog).length);
  for(const item of catalog.flatMap(s=>s.items)) draft.answers[item.id]={state:'OK'};
  draft.closedAt='2026-09-07';
  assert.deepEqual(validateDraft(draft,catalog),[]);
  draft.answers[catalog[0].items[0].id]=corrected;
  assert.ok(validateDraft(draft,catalog).length);
});
