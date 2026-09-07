import { validateDraft, toHeaderFields, toItemFields } from './domain.mjs';
const ROOT = 'https://graph.microsoft.com/v1.0/';
export class GraphClient {
  constructor(config, getToken, fetcher = fetch) {
    this.config = config;
    this.getToken = getToken;
    this.fetcher = fetcher;
  }
  async request(path, method = 'GET', body, etag) {
    const url = new URL(path, ROOT);
    if (
      url.origin !== 'https://graph.microsoft.com' ||
      !url.pathname.startsWith('/v1.0/') ||
      url.username ||
      url.password
    )
      throw Error('El destino de la solicitud no está permitido.');
    const token = await this.getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (etag) headers['If-Match'] = etag;
    if (method === 'GET') headers.Prefer = 'HonorNonIndexedQueriesWarningMayFailRandomly';
    let response;
    try {
      response = await this.fetcher(url.href, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw Error(
        'No se pudo confirmar la respuesta de SharePoint. Conservá el borrador y reintentá para reconciliar el guardado.',
      );
    }
    if (response.status === 412)
      throw Error(
        'El registro cambió en otra sesión. No se sobrescribió: abrilo de nuevo desde SharePoint.',
      );
    if (response.status === 401)
      throw Error('La sesión venció. Volvé a conectar tu cuenta Microsoft.');
    if (response.status === 403)
      throw Error('La cuenta o la aplicación no tiene permiso para esta lista.');
    if (response.status === 429)
      throw Error('SharePoint está limitando las solicitudes. Esperá un momento y reintentá.');
    if (!response.ok)
      throw Error(`SharePoint respondió con error ${response.status}. El borrador se conserva.`);
    return response.status === 204 ? {} : response.json();
  }
  path(list) {
    return `sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(list)}/items`;
  }
  async all(path) {
    const rows = [];
    const seen = new Set();
    while (path) {
      if (seen.has(path)) throw Error('Paginación inválida.');
      seen.add(path);
      const data = await this.request(path);
      if (!Array.isArray(data.value)) throw Error('Respuesta de SharePoint inválida.');
      rows.push(...data.value);
      path = data['@odata.nextLink'];
    }
    return rows;
  }
  async find(list, title) {
    const filter = encodeURIComponent(`fields/Title eq '${title.replaceAll("'", "''")}'`);
    const rows = await this.all(`${this.path(list)}?$expand=fields&$filter=${filter}`);
    if (rows.length > 1)
      throw Error(
        'Hay registros duplicados con la misma clave. Revisalos en SharePoint antes de continuar.',
      );
    return rows[0] || null;
  }
  create(list, fields) {
    return this.request(this.path(list), 'POST', { fields });
  }
  async update(list, id, fields, etag) {
    if (!etag) throw Error('Falta la versión del registro. Volvé a abrirlo antes de guardar.');
    await this.request(
      `${this.path(list)}/${encodeURIComponent(id)}/fields`,
      'PATCH',
      fields,
      etag,
    );
    // Read back the version. A lost response is reconciled by fields on the next attempt.
    const verified = await this.request(
      `${this.path(list)}/${encodeURIComponent(id)}?$expand=fields`,
    );
    if (!sameFields(verified.fields, fields))
      throw Error(
        'El registro cambió en otra sesión durante el guardado. Abrilo de nuevo para revisar los cambios.',
      );
    return verified;
  }
}
const signature = (fields) => JSON.stringify(fields);
function sameFields(actual, expected) {
  const normalize = (key, value) => {
    if (value === null || value === undefined || value === '') return null;
    if (['Plazo', 'AuditoriaProgramada'].includes(key)) return String(value).slice(0, 10);
    if (['FechaRelevamiento', 'FechaCierre', 'FechaVerif'].includes(key)) return Date.parse(value);
    return value;
  };
  return Object.entries(expected).every(
    ([key, value]) => normalize(key, actual?.[key]) === normalize(key, value),
  );
}
export async function saveInspection(api, config, draft, catalog, checkpoint) {
  const errors = validateDraft(draft, catalog);
  if (errors.length) throw Error(errors.map((e) => e.message).join('\n'));
  const remote = draft.remote || (draft.remote = { items: {} });
  remote.items ||= {};
  async function upsert(list, fields, record, remember, verify = false) {
    const sig = signature(fields);
    if (record?.signature === sig && !verify) return record;
    const existing = await api.find(list, fields.Title);
    if (record && (!existing || existing.id !== record.id))
      throw Error('El registro remoto fue eliminado o reemplazado. No se recreó automáticamente.');
    let result;
    if (existing && sameFields(existing.fields, fields)) {
      result = existing;
    } else if (existing) {
      // The previous ETag protects changes made by another user since our last save.
      if (!record)
        throw Error(
          'Se encontró el registro, pero difiere del borrador. Abrilo de nuevo antes de editar.',
        );
      const etag = record.etag;
      if (!etag)
        throw Error('Falta la versión local del registro. Abrilo de nuevo antes de editar.');
      result = await api.update(list, existing.id, fields, etag);
    } else result = await api.create(list, fields);
    const updated = {
      id: result.id,
      etag: result.eTag || result.fields?.['@odata.etag'] || null,
      signature: sig,
    };
    remember(updated);
    checkpoint();
    return updated;
  }
  const headerFields = toHeaderFields(draft, false);
  // Keep a closed header closed when saving an unchanged, fully synchronized snapshot.
  const finalSignature = signature(toHeaderFields(draft));
  const allUnchanged = catalog
    .flatMap((s) => s.items)
    .every((item) => {
      const answer = draft.answers[item.id];
      if (!answer && !remote.items[item.id]) return true;
      return (
        remote.header &&
        remote.items[item.id]?.signature ===
          signature(
            toItemFields(item, answer || {}, remote.header.id, draft.general.equipment, draft.id),
          )
      );
    });
  if (remote.header?.signature === finalSignature && allUnchanged) return;
  const header = await upsert(
    config.headerListId,
    headerFields,
    remote.header,
    (row) => (remote.header = row),
    true,
  );
  for (const item of catalog.flatMap((s) => s.items)) {
    const answer = draft.answers[item.id];
    if (!answer && !remote.items[item.id]) continue;
    await upsert(
      config.itemListId,
      toItemFields(item, answer || {}, header.id, draft.general.equipment, draft.id),
      remote.items[item.id],
      (row) => (remote.items[item.id] = row),
    );
  }
  if (draft.closed)
    await upsert(
      config.headerListId,
      toHeaderFields(draft, true),
      remote.header,
      (row) => (remote.header = row),
    );
  remote.savedAt = new Date().toISOString();
  checkpoint();
}
