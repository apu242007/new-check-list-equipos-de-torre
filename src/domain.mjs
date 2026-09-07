export const STATES = ['OK', 'NO OK', 'EN PROC', 'N/A'];
export const APP_VERSION = '2.1.0';
export const CATALOG_VERSION = 'generico-2026-09-v1';
export const EQUIPMENT_OPTIONS = [
  'TKR-01',
  'TKR-05',
  'TKR-06',
  'TKR-07',
  'TKR-08',
  'TKR-10',
  'TKR-11',
];
export const OPERATORS = [
  'YPF',
  'PAE',
  'Pluspetrol',
  'Vista',
  'CGC',
  'Shell Argentina',
  'Tecpetrol',
  'CAPSA',
  'PCR',
  'TotalEnergies',
  'Pampa Energía',
  'Otra',
];
const remoteStates = {
  '': 'SIN_REVISAR',
  OK: 'OK',
  'NO OK': 'NO_OK',
  'EN PROC': 'EN_PROC',
  'N/A': 'NA',
};
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const marker = '\n\n[PREAUDITORIA-GENERICA-V1]\n';
export const isFinding = (answer) => ['NO OK', 'EN PROC'].includes(answer.state);
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function parseCatalog(source) {
  const sections = [];
  let section = null;
  let nextId = 1;
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^# (\d+)\. (.+)$/);
    if (match) {
      section =
        Number(match[1]) <= 16 ? { id: Number(match[1]), title: match[2], items: [] } : null;
      if (section) sections.push(section);
    } else if (section && line.startsWith('* ☐ '))
      section.items.push({ id: nextId++, section: section.title, text: line.slice(4) });
  }
  if (sections.length !== 16 || sections.some((s) => !s.items.length))
    throw Error('El documento fuente no contiene las 16 secciones completas.');
  return sections;
}
export function newDraft(catalog, id) {
  return {
    version: 1,
    catalogVersion: CATALOG_VERSION,
    id,
    general: {
      date: '',
      equipment: '',
      well: '',
      location: '',
      operator: '',
      company: '',
      inspectors: '',
      supervisor: '',
      auditDate: '',
      contract: '',
      representative: '',
      notes: '',
    },
    answers: {},
    closed: false,
    closedAt: '',
    remote: { items: {} },
  };
}
export function validateItem(answer = {}) {
  const errors = [];
  if (answer.state && !STATES.includes(answer.state)) errors.push('Estado no válido.');
  if (
    isFinding(answer) &&
    (!answer.photo ||
      answer.photo.mime !== 'image/jpeg' ||
      !answer.photo.id ||
      !answer.photo.name ||
      !Number.isFinite(answer.photo.size) ||
      answer.photo.size <= 0 ||
      answer.photo.size > 1000000)
  )
    errors.push('Foto: obligatoria para NO OK o EN PROC.');
  if (isFinding(answer))
    for (const [key, label] of Object.entries({
      responsible: 'Responsable',
      deadline: 'Plazo de resolución',
      action: 'Acción correctiva propuesta',
      evidence: 'Evidencia',
    }))
      if (!text(answer[key])) errors.push(`${label}: obligatorio para NO OK o EN PROC.`);
  if (text(answer.deadline) && !validDate(answer.deadline))
    errors.push('Plazo de resolución: fecha no válida.');
  if (answer.finalState && !['PENDIENTE', 'CERRADO'].includes(answer.finalState))
    errors.push('Estado final no válido.');
  if (answer.finalState === 'CERRADO') {
    if (!answer.state) errors.push('Seleccioná el estado antes de cerrar el ítem.');
    if (!validDate(answer.closedAt)) errors.push('Fecha de cierre: obligatoria y válida.');
    if (!text(answer.closureEvidence)) errors.push('Evidencia de cierre: obligatoria.');
    if (!text(answer.verifiedBy)) errors.push('Verificado por: obligatorio.');
  }
  for (const key of ['responsible', 'verifiedBy'])
    if ((answer[key] || '').length > 255) errors.push(`${key}: máximo 255 caracteres.`);
  for (const key of ['observation', 'action', 'evidence', 'closureEvidence'])
    if ((answer[key] || '').length > 6000) errors.push(`${key}: máximo 6000 caracteres.`);
  return errors;
}
export function validateDraft(draft, catalog) {
  const errors = [];
  const g = draft.general;
  for (const [key, label] of Object.entries({
    equipment: 'Equipo / Rig',
    well: 'Pozo',
    inspectors: 'Personal que realiza la inspección',
  }))
    if (!text(g[key])) errors.push({ message: `${label}: obligatorio.`, field: key });
  if (!validDate(g.date))
    errors.push({ message: 'Fecha de inspección: obligatoria y válida.', field: 'date' });
  if (g.equipment && !EQUIPMENT_OPTIONS.includes(g.equipment))
    errors.push({ message: 'Equipo / Rig: opción no válida.', field: 'equipment' });
  if (g.auditDate && !validDate(g.auditDate))
    errors.push({ message: 'Fecha de auditoría no válida.', field: 'auditDate' });
  if (g.operator && !OPERATORS.includes(g.operator))
    errors.push({ message: 'Operadora no válida.', field: 'operator' });
  for (const [key, value] of Object.entries(g))
    if (typeof value !== 'string' || value.length > (key === 'notes' ? 6000 : 255))
      errors.push({ message: `${key}: longitud o tipo no válido.`, field: key });
  for (const item of catalog.flatMap((s) => s.items)) {
    const answer = draft.answers[item.id] || {};
    for (const message of validateItem(answer)) errors.push({ itemId: item.id, message });
    if (draft.closed && !answer.state)
      errors.push({ itemId: item.id, message: 'Revisá el ítem antes de cerrar la inspección.' });
    if (draft.closed && isFinding(answer) && answer.finalState !== 'CERRADO')
      errors.push({
        itemId: item.id,
        message: 'Completá el cierre del hallazgo antes de cerrar la inspección.',
      });
  }
  if (draft.closed && !validDate(draft.closedAt))
    errors.push({ message: 'Fecha de cierre de inspección: obligatoria.', field: 'closedAt' });
  return errors;
}
function dateValue(value) {
  return value ? `${value}T12:00:00Z` : null;
}
export function toHeaderFields(draft, closed = draft.closed) {
  const g = draft.general;
  return {
    Title: `PRE-${draft.id}`,
    Equipo: g.equipment,
    Operadora: g.operator || null,
    Contrato: g.contract,
    FechaRelevamiento: dateValue(g.date),
    Pozo: g.well,
    AuditoriaProgramada: dateValue(g.auditDate),
    EquipoRecorrida: g.inspectors,
    CompanyRepresentative: g.representative,
    Notas:
      g.notes +
      marker +
      JSON.stringify({
        catalogVersion: CATALOG_VERSION,
        location: g.location,
        company: g.company,
        supervisor: g.supervisor,
      }),
    Cerrada: closed,
    FechaCierre: closed ? dateValue(draft.closedAt) : null,
    AppVersion: APP_VERSION,
  };
}
export function toItemFields(item, answer, parentId, equipment, draftId) {
  const errors = validateItem(answer);
  if (errors.length) throw Error(errors.join('\n'));
  return {
    Title: `PRE-${draftId}-${item.id}`,
    ItemId: item.id,
    Zona: item.section,
    ItemTexto: item.text,
    Estado: remoteStates[answer.state || ''],
    Responsable: answer.responsible || '',
    Plazo: dateValue(answer.deadline),
    AccionCorrectiva: answer.action || '',
    EstadoFinal: answer.finalState || 'PENDIENTE',
    FechaVerif: answer.finalState === 'CERRADO' ? dateValue(answer.closedAt) : null,
    Observaciones:
      (answer.observation || '') +
      marker +
      JSON.stringify({
        evidence: answer.evidence || '',
        closureEvidence: answer.closureEvidence || '',
        verifiedBy: answer.verifiedBy || '',
        catalogVersion: CATALOG_VERSION,
      }),
    Equipo: equipment,
    RecorridaLookupId: String(parentId),
  };
}
export function fromItemFields(fields) {
  const raw = fields.Observaciones || '';
  const split = raw.lastIndexOf(marker);
  let extra = {};
  let observation = raw;
  if (split >= 0) {
    try {
      extra = JSON.parse(raw.slice(split + marker.length));
      observation = raw.slice(0, split);
    } catch {
      /* Preserve malformed or legacy observations verbatim. */
    }
  }
  const state = Object.entries(remoteStates).find(([, remote]) => remote === fields.Estado)?.[0];
  if (state === undefined && fields.Estado)
    throw Error('El estado de SharePoint no es compatible con esta app.');
  return {
    state: state || '',
    responsible: fields.Responsable || '',
    deadline: (fields.Plazo || '').slice(0, 10),
    action: fields.AccionCorrectiva || '',
    finalState: fields.EstadoFinal || '',
    closedAt: (fields.FechaVerif || '').slice(0, 10),
    observation,
    evidence: extra.evidence || '',
    closureEvidence: extra.closureEvidence || '',
    verifiedBy: extra.verifiedBy || '',
  };
}
export function importDraft(raw, catalog, id) {
  if (raw.length > 4_000_000) throw Error('El archivo supera el tamaño permitido.');
  const source = JSON.parse(raw);
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (
    !object(source) ||
    source.version !== 1 ||
    source.catalogVersion !== CATALOG_VERSION ||
    !object(source.general) ||
    !object(source.answers)
  )
    throw Error('Formato o versión de checklist incompatible.');
  const draft = newDraft(catalog, id);
  for (const key of Object.keys(draft.general)) {
    if (
      typeof source.general[key] !== 'string' ||
      source.general[key].length > (key === 'notes' ? 6000 : 255)
    )
      throw Error('Datos generales inválidos.');
    draft.general[key] = source.general[key];
  }
  const allowed = new Set(catalog.flatMap((s) => s.items.map((i) => String(i.id))));
  const answerKeys = [
    'state',
    'responsible',
    'deadline',
    'action',
    'evidence',
    'observation',
    'finalState',
    'closedAt',
    'closureEvidence',
    'verifiedBy',
  ];
  for (const [key, value] of Object.entries(source.answers)) {
    if (!allowed.has(key) || !object(value)) throw Error('Ítem desconocido o inválido.');
    const answer = {};
    if (value.photo !== undefined) {
      const p = value.photo;
      if (
        !object(p) ||
        typeof p.id !== 'string' ||
        typeof p.name !== 'string' ||
        p.mime !== 'image/jpeg' ||
        !Number.isFinite(p.size) ||
        p.size <= 0 ||
        p.size > 1000000
      )
        throw Error('Foto importada inválida.');
      answer.photo = { id: p.id, name: p.name, mime: p.mime, size: p.size };
    }
    for (const field of answerKeys)
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'string' || value[field].length > 6000)
          throw Error('Campo de ítem inválido.');
        answer[field] = value[field];
      }
    if (answer.state && !STATES.includes(answer.state)) throw Error('Estado importado inválido.');
    if (answer.finalState && !['PENDIENTE', 'CERRADO'].includes(answer.finalState))
      throw Error('Estado final importado inválido.');
    draft.answers[key] = answer;
  }
  draft.closed = source.closed === true;
  draft.closedAt = typeof source.closedAt === 'string' ? source.closedAt : '';
  return draft;
}
