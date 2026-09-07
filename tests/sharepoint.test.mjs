import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphClient, saveInspection } from '../src/sharepoint.mjs';
import { newDraft } from '../src/domain.mjs';
const catalog=[{id:1,title:'Accesos',items:[{id:1,section:'Accesos',text:'Verificar escalera.'},{id:2,section:'Accesos',text:'Verificar acceso.'}]}];
const config={siteId:'site',headerListId:'headers',itemListId:'items'};
function setup() {
  const rows={headers:[],items:[]};let sequence=0;const writes=[];
  const api={
    async find(list,title){return rows[list].find(r=>r.fields.Title===title)||null;},
    async create(list,fields){const row={id:String(++sequence),eTag:'v1',fields};rows[list].push(row);writes.push(['create',list]);return row;},
    async update(list,id,fields,etag){assert.ok(etag);const row=rows[list].find(r=>r.id===id);row.fields=fields;row.eTag='v2';writes.push(['update',list]);return row;}
  };
  const draft=newDraft(catalog,'fixed');Object.assign(draft.general,{equipment:'EQ',well:'P',date:'2026-09-07',inspectors:'Inspector'});
  draft.answers[1]={state:'OK'};draft.answers[2]={state:'N/A'};
  return {api,rows,writes,draft};
}
test('guardado enlaza cabecera e ítems y reanuda sin duplicarlos',async()=>{
  const {api,rows,draft,writes}=setup();let checkpoints=0;
  await saveInspection(api,config,draft,catalog,()=>checkpoints++);
  assert.equal(rows.headers.length,1);assert.equal(rows.items.length,2);
  assert.equal(rows.items[0].fields.RecorridaLookupId,rows.headers[0].id);
  assert.ok(checkpoints>=3);
  const count=writes.length;
  await saveInspection(api,config,draft,catalog,()=>{});
  assert.equal(writes.length,count);
  draft.answers[1].state='N/A';
  await saveInspection(api,config,draft,catalog,()=>{});
  assert.equal(rows.items.length,2);assert.equal(rows.items[0].fields.Estado,'NA');
});
test('una respuesta perdida se reconcilia por título antes de repetir POST',async()=>{
  const {api,rows,draft}=setup();const create=api.create;
  api.create=async(list,fields)=>{const row=await create(list,fields);if(list==='items')throw Error('Respuesta perdida');return row;};
  await assert.rejects(saveInspection(api,config,draft,catalog,()=>{}),/Respuesta perdida/);
  api.create=create;
  await saveInspection(api,config,draft,catalog,()=>{});
  assert.equal(rows.headers.length,1);assert.equal(rows.items.length,2);
});
test('rechaza hallazgos incompletos antes de escribir',async()=>{
  const {api,draft,writes}=setup();draft.answers[1]={state:'NO OK'};
  await assert.rejects(saveInspection(api,config,draft,catalog,()=>{}),/Responsable/);
  assert.equal(writes.length,0);
});
test('no marca inspección cerrada si falla el guardado de un ítem',async()=>{
  const {api,draft,rows}=setup();draft.closed=true;draft.closedAt='2026-09-07';
  api.create=async(list,fields)=>{if(list==='items')throw Error('Fallo');const row={id:'1',eTag:'v1',fields};rows.headers.push(row);return row;};
  await assert.rejects(saveInspection(api,config,draft,catalog,()=>{}));
  assert.equal(rows.headers[0].fields.Cerrada,false);
});
test('cliente usa ETag, rechaza conflictos y nunca envía token a otro dominio',async()=>{
  let request;
  const api=new GraphClient(config,async()=> 'test-token',async(url,options)=>{request={url,options};return new Response('{}',{status:412});});
  await assert.rejects(api.update('items','1',{Estado:'OK'},'etag'),/otra sesión/);
  assert.equal(request.options.headers['If-Match'],'etag');
  await assert.rejects(api.request('https://evil.example/'),/destino/);
  await assert.rejects(api.update('items','1',{},''),/versión/);
});
test('cliente pagina lecturas y detecta títulos duplicados',async()=>{
  let call=0;
  const api=new GraphClient(config,async()=> 'test',async()=>new Response(JSON.stringify(++call===1?{value:[], '@odata.nextLink':'https://graph.microsoft.com/v1.0/next'}:{value:[{id:'1'},{id:'2'}]})));
  await assert.rejects(api.find('items','key'),/duplicados/);
});
test('respuesta perdida de PATCH se reconcilia sin sobrescribir cambios ajenos',async()=>{
  const {api,draft,rows}=setup();await saveInspection(api,config,draft,catalog,()=>{});
  draft.answers[1].state='N/A';const update=api.update;
  api.update=async(...args)=>{await update(...args);throw Error('Respuesta PATCH perdida');};
  await assert.rejects(saveInspection(api,config,draft,catalog,()=>{}),/PATCH perdida/);
  api.update=async()=>{throw Error('No debe repetir un PATCH confirmado por lectura');};
  await saveInspection(api,config,draft,catalog,()=>{});
  assert.equal(rows.items[0].fields.Estado,'NA');
});
test('no usa una versión nueva para sobrescribir un registro sin ETag local',async()=>{
  const {api,draft}=setup();await saveInspection(api,config,draft,catalog,()=>{});
  draft.remote.items[1].etag=null;draft.answers[1].state='N/A';
  await assert.rejects(saveInspection(api,config,draft,catalog,()=>{}),/versión/);
});
