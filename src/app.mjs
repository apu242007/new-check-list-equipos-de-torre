import {
  STATES,
  OPERATORS,
  newDraft,
  validateItem,
  validateDraft,
  importDraft,
  isFinding,
  CATALOG_VERSION,
  fromItemFields,
  toItemFields,
  toHeaderFields,
} from './domain.mjs';
import { GraphClient, saveInspection } from './sharepoint.mjs';
import { createAuth } from './auth.mjs';
import { verifySchema } from './schema.mjs';
const $ = (selector) => document.querySelector(selector);
const KEY = 'tacker-preauditoria-generica-v1';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const slug = (state) => ({ OK: 'ok', 'NO OK': 'no-ok', 'EN PROC': 'en-proc', 'N/A': 'na' })[state];
let catalog,
  config,
  draft,
  auth,
  api,
  busy = false,
  storageFailed = false,
  otherTab = false,
  loading = false;
function notice(message, warning = false) {
  $('#notice').textContent = message;
  $('#notice').classList.toggle('warning', warning);
}
function persist() {
  if (otherTab)
    throw Error(
      'Este borrador cambió en otra pestaña. Exportá una copia y recargá antes de editar.',
    );
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    storageFailed = false;
    $('#local-status').textContent = 'Borrador guardado en este navegador';
  } catch (error) {
    storageFailed = true;
    $('#local-status').textContent = 'No se pudo guardar en este navegador';
    notice(
      'El almacenamiento local no está disponible. Exportá el borrador para conservar tus cambios.',
      true,
    );
    throw error;
  }
}
function localChange() {
  try {
    persist();
  } catch {}
  $('#document-state').textContent = draft.closed
    ? 'Cierre pendiente de guardar'
    : 'Borrador de inspección';
  $('#save-hint').textContent = 'Cambios locales. Usá Guardar en SharePoint para enviarlos.';
}
function input(label, key, value = '', type = 'text', scope = 'general', wide = false) {
  const id = `${scope}-${key}`;
  const attrs = `id="${id}" data-${scope}="${key}"`;
  const control =
    type === 'textarea'
      ? `<textarea ${attrs} maxlength="6000" rows="2">${escape(value)}</textarea>`
      : type === 'operator'
        ? `<select ${attrs}><option value="">Seleccionar operadora</option>${OPERATORS.map((o) => `<option ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input ${attrs} type="${type}" value="${escape(value)}" ${type === 'text' ? 'maxlength="255"' : ''}>`;
  return `<label ${wide ? 'class="wide"' : ''}><span>${label}</span>${control}</label>`;
}
function renderGeneral() {
  const fields = [
    ['Fecha de inspección *', 'date', 'date'],
    ['Equipo / Rig *', 'equipment'],
    ['Pozo *', 'well'],
    ['Locación', 'location'],
    ['Cliente / Operadora', 'operator', 'operator'],
    ['Empresa', 'company'],
    ['Personal que realiza la inspección *', 'inspectors'],
    ['Supervisor responsable', 'supervisor'],
    ['Auditoría programada', 'auditDate', 'date'],
    ['Contrato', 'contract'],
    ['Company Representative', 'representative'],
    ['Notas / limitaciones', 'notes', 'textarea', true],
  ];
  $('#general-fields').innerHTML = fields
    .map(([label, key, type, wide]) => input(label, key, draft.general[key], type, 'general', wide))
    .join('');
  $('#closed').checked = draft.closed;
  $('#closedAt').value = draft.closedAt;
  $('#closedAt').required = draft.closed;
}
function itemMarkup(item) {
  const a = draft.answers[item.id] || {};
  const field = (label, key, type = 'textarea', wide = false) =>
    input(label, key, a[key] || '', type, `item-${item.id}`, wide).replaceAll(
      `data-item-${item.id}=`,
      `data-answer=`,
    );
  return `<article class="item" id="item-${item.id}" data-item-id="${item.id}"><div class="item-top"><span class="item-number">${String(item.id).padStart(3, '0')}</span><h3>${escape(item.text)}</h3></div>
  <div class="state-row" role="group" aria-label="Estado del ítem ${item.id}"><span class="state-caption">ESTADO</span>${STATES.map((state) => `<label class="state-option ${slug(state)}"><input type="radio" name="state-${item.id}" value="${state}" ${a.state === state ? 'checked' : ''}><span>${state}</span></label>`).join('')}<button type="button" class="clear-state">Quitar selección</button></div>
  <details class="item-details" ${isFinding(a) || a.finalState === 'CERRADO' ? 'open' : ''}><summary>Observación, evidencia y seguimiento</summary><div class="fields">
    ${field('Observación', 'observation', 'textarea', true)}${field('Evidencia / referencia documental', 'evidence', 'textarea', true)}
    <span class="field-help wide">Registrá una descripción verificable, una referencia documental o un enlace a la fotografía/documento en SharePoint. Los archivos se mantienen en su ubicación original.</span>
    ${field('Responsable', 'responsible', 'text')}${field('Plazo de resolución', 'deadline', 'date')}${field('Acción correctiva propuesta', 'action', 'textarea', true)}
    <div class="closure-fields"><label><span id="final-label-${item.id}">Estado final</span><select aria-labelledby="final-label-${item.id}" data-answer="finalState" id="item-${item.id}-finalState"><option value="">Sin definir</option><option ${a.finalState === 'PENDIENTE' ? 'selected' : ''}>PENDIENTE</option><option ${a.finalState === 'CERRADO' ? 'selected' : ''}>CERRADO</option></select></label>
    ${field('Fecha de verificación / cierre', 'closedAt', 'date')}${field('Evidencia de cierre', 'closureEvidence', 'textarea', true)}${field('Verificado por', 'verifiedBy', 'text')}</div>
  </div></details></article>`;
}
function render() {
  renderGeneral();
  $('#search').value = '';
  $('#no-results').hidden = true;
  $('#sections').innerHTML =
    `<a href="#general" class="active"><span>00</span>Datos generales</a>` +
    catalog
      .map(
        (s) =>
          `<a href="#section-${s.id}"><span>${String(s.id).padStart(2, '0')}</span>${escape(s.title.toLocaleLowerCase('es'))}</a>`,
      )
      .join('') +
    '<a href="#closure"><span>CI</span>Cierre de inspección</a>';
  $('#checklist').innerHTML = catalog
    .map(
      (s) =>
        `<section class="panel check-section" id="section-${s.id}"><div class="panel-heading"><span class="section-no">${String(s.id).padStart(2, '0')}</span><h2>${escape(s.title)}</h2></div>${s.items.map(itemMarkup).join('')}</section>`,
    )
    .join('');
  for (const item of catalog.flatMap((s) => s.items)) updateRequirements(item.id);
  $('#errors').hidden = true;
  $('#document-state').textContent = draft.closed
    ? 'Inspección declarada cerrada'
    : 'Borrador de inspección';
  $('#save-hint').textContent = draft.remote?.savedAt
    ? `Último guardado en SharePoint: ${new Date(draft.remote.savedAt).toLocaleString('es-AR')}`
    : 'Los cambios se guardan en este navegador.';
}
function updateRequirements(id) {
  const item = $(`#item-${id}`),
    a = draft.answers[id] || {};
  for (const key of ['responsible', 'deadline', 'action', 'evidence'])
    item.querySelector(`[data-answer="${key}"]`).required = isFinding(a);
  for (const key of ['closedAt', 'closureEvidence', 'verifiedBy'])
    item.querySelector(`[data-answer="${key}"]`).required = a.finalState === 'CERRADO';
  if (isFinding(a) || a.finalState === 'CERRADO') item.querySelector('details').open = true;
}
function showErrors() {
  const errors = validateDraft(draft, catalog);
  const panel = $('#errors');
  document.querySelectorAll('.item-error').forEach((e) => e.classList.remove('item-error'));
  panel.hidden = !errors.length;
  if (!errors.length) return true;
  panel.innerHTML = '<h2>Completá los siguientes campos</h2><div class="errors-list"></div>';
  for (const error of errors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = (error.itemId ? `Ítem ${error.itemId} · ` : '') + error.message;
    button.onclick = () => {
      filterItems('');
      $('#search').value = '';
      const target = error.itemId
        ? $(`#item-${error.itemId}`)
        : $(`#general-${error.field}`) || $('#closedAt');
      if (error.itemId) {
        target.querySelector('details').open = true;
        target.classList.add('item-error');
      }
      target.scrollIntoView({ block: 'center' });
      (target.querySelector('input,select,textarea') || target).focus();
    };
    panel.lastChild.append(button);
  }
  panel.focus();
  return false;
}
function filterItems(query) {
  let visible = false;
  const term = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  for (const section of catalog) {
    let sectionVisible = false;
    for (const item of section.items) {
      const match = `${item.text} ${item.section} ${item.id}`
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .includes(term);
      $(`#item-${item.id}`).hidden = !match;
      sectionVisible ||= match;
    }
    $(`#section-${section.id}`).hidden = !sectionVisible;
    visible ||= sectionVisible;
  }
  $('#no-results').hidden = visible;
}
function setBusy(value) {
  busy = value;
  $('#editable').disabled = value || otherTab;
  for (const id of ['new', 'open', 'import', 'save', 'validate', 'connect'])
    $(`#${id}`).disabled = value || otherTab;
  $('#save').textContent = value ? 'Guardando…' : 'Guardar en SharePoint ↗';
}
function requireConnection() {
  if (!auth)
    throw Error(
      'La conexión Microsoft aún no fue configurada para esta página. Podés completar y exportar el borrador.',
    );
  if (!auth.account()) throw Error('Conectá tu cuenta Microsoft para usar SharePoint.');
}
function guard(handler) {
  return async (event) => {
    try {
      await handler(event);
    } catch (error) {
      notice(error.message || 'No se pudo completar la operación.', true);
    }
  };
}
function replaceDraft(next) {
  if (
    !confirm(
      'Se reemplazará el borrador de esta pestaña. Exportalo primero si necesitás conservarlo. ¿Continuar?',
    )
  )
    return false;
  draft = next;
  persist();
  render();
  return true;
}
function exportDraft() {
  const copy = { ...draft, remote: undefined };
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `preauditoria-${draft.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function openRemote(id) {
  if (loading) return;
  loading = true;
  try {
    const header = await api.request(
      `${api.path(config.headerListId)}/${encodeURIComponent(id)}?$expand=fields`,
    );
    const h = header.fields;
    const mark = '\n\n[PREAUDITORIA-GENERICA-V1]\n';
    const index = (h.Notas || '').lastIndexOf(mark);
    if (index < 0 || !/^PRE-[0-9a-f-]{36}$/i.test(h.Title || ''))
      throw Error('La inspección no pertenece a este checklist genérico.');
    const meta = JSON.parse(h.Notas.slice(index + mark.length));
    if (meta.catalogVersion !== CATALOG_VERSION) throw Error('Versión de catálogo incompatible.');
    const next = newDraft(catalog, h.Title.slice(4));
    Object.assign(next.general, {
      date: (h.FechaRelevamiento || '').slice(0, 10),
      equipment: h.Equipo || '',
      well: h.Pozo || '',
      location: meta.location || '',
      operator: h.Operadora || '',
      company: meta.company || '',
      inspectors: h.EquipoRecorrida || '',
      supervisor: meta.supervisor || '',
      auditDate: (h.AuditoriaProgramada || '').slice(0, 10),
      contract: h.Contrato || '',
      representative: h.CompanyRepresentative || '',
      notes: h.Notas.slice(0, index),
    });
    next.closed = !!h.Cerrada;
    next.closedAt = (h.FechaCierre || '').slice(0, 10);
    const rows = await api.all(
      `${api.path(config.itemListId)}?$expand=fields&$filter=${encodeURIComponent(`fields/RecorridaLookupId eq '${id}'`)}`,
    );
    const map = new Map(catalog.flatMap((s) => s.items.map((i) => [i.id, i])));
    for (const row of rows) {
      const f = row.fields,
        item = map.get(f.ItemId);
      if (
        !item ||
        f.ItemTexto !== item.text ||
        f.Title !== `PRE-${next.id}-${item.id}` ||
        next.answers[item.id]
      )
        throw Error('Ítems incompatibles o duplicados. Se conserva el borrador actual.');
      next.answers[item.id] = fromItemFields(f);
      next.remote.items[item.id] = {
        id: row.id,
        etag: row.eTag || f['@odata.etag'],
        signature: JSON.stringify(
          toItemFields(item, next.answers[item.id], id, next.general.equipment, next.id),
        ),
      };
    }
    next.remote.header = {
      id,
      etag: header.eTag || h['@odata.etag'],
      signature: JSON.stringify(toHeaderFields(next)),
    };
    next.remote.savedAt = header.lastModifiedDateTime;
    if (replaceDraft(next)) {
      $('#open-dialog').close();
      notice('Inspección recuperada de SharePoint.');
    }
  } finally {
    loading = false;
  }
}
function bind() {
  $('#inspection').addEventListener('submit', (e) => e.preventDefault());
  $('#inspection').addEventListener('input', (e) => {
    const target = e.target;
    if (target.id === 'search') {
      filterItems(target.value);
      return;
    }
    if (busy || otherTab) return;
    if (target.dataset.general) draft.general[target.dataset.general] = target.value;
    else if (target.id === 'closed') {
      draft.closed = target.checked;
      $('#closedAt').required = draft.closed;
    } else if (target.id === 'closedAt') draft.closedAt = target.value;
    else {
      const item = target.closest('[data-item-id]');
      if (!item) return;
      const id = item.dataset.itemId;
      draft.answers[id] ||= {};
      if (target.type === 'radio') draft.answers[id].state = target.value;
      else if (target.dataset.answer) draft.answers[id][target.dataset.answer] = target.value;
      updateRequirements(id);
    }
    localChange();
  });
  $('#checklist').addEventListener('click', (e) => {
    if (!e.target.matches('.clear-state') || busy || otherTab) return;
    const item = e.target.closest('[data-item-id]');
    const id = item.dataset.itemId;
    draft.answers[id] ||= {};
    draft.answers[id].state = '';
    item.querySelectorAll('input[type=radio]').forEach((r) => (r.checked = false));
    updateRequirements(id);
    localChange();
  });
  $('#sections').addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    filterItems('');
    $('#search').value = '';
    $('#sections .active')?.classList.remove('active');
    e.target.closest('a').classList.add('active');
  });
  $('#validate').onclick = () => {
    if (showErrors())
      notice(
        'El registro cumple las validaciones de carga. Esto no certifica la condición técnica del equipo.',
      );
  };
  $('#export').onclick = exportDraft;
  $('#new').onclick = guard(() => {
    if (replaceDraft(newDraft(catalog, crypto.randomUUID())))
      notice('Nueva inspección. Todos los estados están sin seleccionar.');
  });
  $('#import').onchange = guard(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw Error('El archivo supera el tamaño permitido.');
      const next = importDraft(await file.text(), catalog, crypto.randomUUID());
      if (replaceDraft(next))
        notice('Copia importada como una inspección nueva. El original no se modifica.');
    } finally {
      e.target.value = '';
    }
  });
  $('#connect').onclick = guard(async () => {
    if (!auth)
      throw Error(
        'Falta configurar la aplicación Microsoft Entra para esta página. El borrador local está disponible.',
      );
    const account = await auth.login();
    $('#connection').textContent = `Microsoft conectado · ${account.name || account.username}`;
    notice('Cuenta conectada. Ya podés abrir o guardar inspecciones según tus permisos.');
  });
  $('#save').onclick = guard(async () => {
    if (!showErrors()) return;
    requireConnection();
    if (storageFailed)
      throw Error(
        'Restablecé el almacenamiento local antes de sincronizar para poder recuperar un guardado interrumpido.',
      );
    if (!navigator.locks)
      throw Error(
        'Este navegador no permite proteger el guardado entre pestañas. Usá una versión actual de Edge o Chrome.',
      );
    await navigator.locks.request(KEY, { ifAvailable: true }, async (lock) => {
      if (!lock) throw Error('Otra pestaña está guardando. Esperá a que termine.');
      setBusy(true);
      try {
        persist();
        await verifySchema(api, config);
        await saveInspection(api, config, draft, catalog, persist);
        $('#document-state').textContent = draft.closed
          ? 'Inspección cerrada y guardada'
          : 'Inspección guardada en SharePoint';
        $('#save-hint').textContent = 'El borrador local también se conserva.';
        notice('Se confirmó el guardado de los datos en SharePoint.');
      } finally {
        setBusy(false);
      }
    });
  });
  $('#open').onclick = guard(async () => {
    requireConnection();
    $('#remote-list').textContent = 'Consultando inspecciones…';
    $('#open-dialog').showModal();
    const rows = await api.all(
      `${api.path(config.headerListId)}?$expand=fields&$filter=${encodeURIComponent("fields/AppVersion eq '1.0.0'")}`,
    );
    const list = $('#remote-list');
    list.textContent = '';
    for (const row of rows
      .filter((r) => (r.fields.Notas || '').includes(CATALOG_VERSION))
      .reverse()) {
      const button = document.createElement('button');
      button.className = 'button remote-row';
      button.textContent = `${row.fields.Equipo || 'Sin equipo'} · ${row.fields.Pozo || 'Sin pozo'} · ${(row.fields.FechaRelevamiento || '').slice(0, 10)} · ID ${row.id}`;
      button.onclick = guard(() => openRemote(row.id));
      list.append(button);
    }
    if (!list.childNodes.length)
      list.textContent = 'Todavía no hay inspecciones de este checklist genérico.';
  });
  $('#close-dialog').onclick = () => $('#open-dialog').close();
  let printState = [];
  function beforePrint() {
    filterItems('');
    printState = [...document.querySelectorAll('details')].map((d) => ({ d, open: d.open }));
    printState.forEach(({ d }) => (d.open = true));
    document.querySelectorAll('textarea').forEach((t) => {
      t.dataset.height = t.style.height;
      t.style.height = `${t.scrollHeight + 5}px`;
    });
  }
  function afterPrint() {
    printState.forEach(({ d, open }) => (d.open = open));
    document.querySelectorAll('textarea').forEach((t) => (t.style.height = t.dataset.height || ''));
    filterItems($('#search').value);
  }
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  $('#print').onclick = () => window.print();
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      otherTab = true;
      setBusy(false);
      notice(
        'El borrador cambió en otra pestaña. Exportá una copia de esta versión si la necesitás y recargá para continuar.',
        true,
      );
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (storageFailed || busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
async function start() {
  const responses = await Promise.all(
    ['./catalog.json', './config.json'].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok)
        throw Error('No se pudo cargar la configuración del checklist. Recargá la página.');
      return response.json();
    }),
  );
  [catalog, config] = responses;
  draft = newDraft(catalog, crypto.randomUUID());
  let raw;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (!/^[0-9a-f-]{36}$/i.test(saved.id || '')) throw Error('Identificador inválido.');
      draft = importDraft(raw, catalog, saved.id);
      if (saved.remote?.items && typeof saved.remote.items === 'object')
        draft.remote = saved.remote;
    }
  } catch {
    otherTab = true;
    notice(
      'No se pudo recuperar el borrador local. Se bloqueó la edición para evitar sobrescribirlo. Conservá una copia del almacenamiento antes de restablecerlo.',
      true,
    );
  }
  render();
  bind();
  if (!otherTab) {
    try {
      persist();
    } catch {}
  } else setBusy(false);
  try {
    auth = await createAuth(config);
    if (auth) {
      api = new GraphClient(config, () => auth.getToken());
      if (auth.account())
        $('#connection').textContent =
          `Microsoft conectado · ${auth.account().name || auth.account().username}`;
    } else $('#connection').textContent = 'Modo local · conexión Microsoft pendiente de configurar';
  } catch {
    notice(
      'No se pudo iniciar la conexión Microsoft. Podés continuar con el borrador local.',
      true,
    );
  }
}
start().catch((error) => notice(error.message, true));
