import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItem } from '../src/domain.mjs';
const answer={state:'NO OK',responsible:'Supervisor',deadline:'2026-09-10',action:'Reemplazar',evidence:'Acta 12'};
test('una referencia escrita no sustituye la foto obligatoria del hallazgo',()=>{
  assert.ok(validateItem(answer).some(e=>e.includes('Foto')));
  assert.ok(validateItem({...answer,state:'EN PROC'}).some(e=>e.includes('Foto')));
});
test('el hallazgo admite una foto local válida y conserva los campos correctivos',()=>{
  assert.deepEqual(validateItem({...answer,photo:{id:'foto-1',name:'evidencia.jpg',mime:'image/jpeg',size:300}}),[]);
});
