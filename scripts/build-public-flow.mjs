import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { APP_VERSION, EQUIPMENT_OPTIONS, OPERATORS, parseCatalog } from '../src/domain.mjs';
const catalog = parseCatalog(await readFile('docs/checklist-fuente.md', 'utf8')).flatMap(
  (s) => s.items,
);
const site = 'https://tackersrl505.sharepoint.com/sites/WellService';
const headers = 'e428ab0c-7c28-4f15-95e0-1ab8d3439cff',
  details = 'e481391a-d38f-4fe7-9675-7130d030a100';
const after = (name) => (name ? { [name]: ['Succeeded'] } : {});
const action = (type, inputs, previous) => ({ type, inputs, runAfter: after(previous) });
const response = (code, body, previous) => ({
  ...action(
    'Response',
    {
      statusCode: code,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body,
    },
    previous,
  ),
  kind: 'Http',
});
const condition = (expression, yes, no = {}, previous) => ({
  type: 'If',
  expression,
  actions: yes,
  else: { actions: no },
  runAfter: after(previous),
});
const sp = (operation, parameters, previous) =>
  action(
    'OpenApiConnection',
    {
      host: {
        apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
        connectionName: 'shared_sharepointonline',
        operationId: operation,
      },
      parameters: { dataset: site, ...parameters },
      authentication: "@parameters('$authentication')",
      retryPolicy: { type: 'none' },
    },
    previous,
  );
const str = (max = 255, min = 0) => ({ type: 'string', minLength: min, maxLength: max });
const uuid = {
  ...str(36, 36),
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
};
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const photoSchema = object({
  id: uuid,
  contentBase64: { ...str(1333336, 100), pattern: '^/9j/[A-Za-z0-9+/]*={0,2}$' },
});
const answerSchema = object({
  id: { type: 'integer', minimum: 1, maximum: catalog.length },
  state: { enum: ['OK', 'NO_OK', 'EN_PROC', 'NA', 'SIN_REVISAR'] },
  observation: str(6000),
  photo: { anyOf: [{ type: 'null' }, photoSchema] },
});
const generalSchema = object({
  date: { ...str(10, 10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  equipment: { enum: EQUIPMENT_OPTIONS },
  well: str(255, 1),
  location: str(),
  operator: { enum: ['', ...OPERATORS] },
  company: str(),
  inspectors: str(255, 1),
  supervisor: str(),
  auditDate: str(10),
  contract: str(),
  representative: str(),
  notes: str(6000),
});
const reportSchema = object({
  contentBase64: str(20000000, 100),
  filename: str(150, 1),
});
const count = { type: 'integer', minimum: 0, maximum: catalog.length };
const summarySchema = object({
  ok: count,
  noOk: count,
  enProc: count,
  na: count,
  sinRevisar: count,
  hallazgos: count,
  total: count,
});
const payloadSchema = object({
  draftId: uuid,
  general: generalSchema,
  answers: { type: 'array', minItems: 1, maxItems: catalog.length, items: answerSchema },
  closed: { type: 'boolean' },
  closedAt: str(10),
  report: reportSchema,
  summary: summarySchema,
});
const envelopeSchema = object(
  {
    mode: { enum: ['submit', 'status'] },
    submissionId: uuid,
    accessKey: { ...str(64, 64), pattern: '^[0-9a-f]{64}$' },
    payload: { type: 'object' },
  },
  ['mode', 'submissionId', 'accessKey'],
);
const b = "body('Parse_envelope')",
  p = "body('Parse_payload')",
  g = `${p}?['general']`,
  i = "items('Save_items')";
const onlyHex = (value) =>
  [...'0123456789abcdef-'].reduce(
    (expression, char) => `replace(${expression},'${char}','')`,
    `toLower(string(${value}))`,
  );
const headerID = "outputs('Create_header')?['body/ID']";
const date = (value) => `@if(empty(${value}),null,concat(${value},'T12:00:00Z'))`;
const metadata = (status, email) => ({
  version: 2,
  draftId: `@${p}?['draftId']`,
  accessKey: `@${b}?['accessKey']`,
  status,
  emailState: email,
  location: `@${g}?['location']`,
  company: `@${g}?['company']`,
  supervisor: `@${g}?['supervisor']`,
  notes: `@${g}?['notes']`,
});
const initialMeta = action('Compose', metadata('processing', 'pending'));
const headerParams = {
  table: headers,
  'item/Title': `@concat('PRE2-',${b}?['submissionId'])`,
  'item/Equipo': `@${g}?['equipment']`,
  'item/Operadora/Value': `@if(empty(${g}?['operator']),null,${g}?['operator'])`,
  'item/Contrato': `@${g}?['contract']`,
  'item/FechaRelevamiento': date(`${g}?['date']`),
  'item/Pozo': `@${g}?['well']`,
  'item/AuditoriaProgramada': date(`${g}?['auditDate']`),
  'item/EquipoRecorrida': `@${g}?['inspectors']`,
  'item/CompanyRepresentative': `@${g}?['representative']`,
  'item/Notas': "@string(outputs('Metadata_processing'))",
  'item/Cerrada': false,
  'item/AppVersion': APP_VERSION,
};
const canonical = `parameters('catalog')[sub(${i}?['id'],1)]`;
const rowParams = {
  table: details,
  'item/Title': `@concat('PRE2-',${b}?['submissionId'],'-',string(${i}?['id']))`,
  'item/Recorrida/Id': `@${headerID}`,
  'item/ItemId': `@${i}?['id']`,
  'item/Zona': `@${canonical}?['section']`,
  'item/ItemTexto': `@${canonical}?['text']`,
  'item/Estado/Value': `@${i}?['state']`,
  'item/Observaciones': "@string(outputs('Item_evidence'))",
  'item/Equipo': `@${g}?['equipment']`,
  'item/FotosCount': 0,
};
const saveItems = {
  type: 'Foreach',
  foreach: `@${p}?['answers']`,
  runAfter: { Response_accepted: ['Succeeded'] },
  runtimeConfiguration: { concurrency: { repetitions: 5 } },
  actions: {
    Item_evidence: action('Compose', {
      observation: `@${i}?['observation']`,
      photoId: `@${i}?['photo']?['id']`,
    }),
    Create_detail: sp('PostItem', rowParams, 'Item_evidence'),
    Has_photo: condition(
      `@not(empty(${i}?['photo']))`,
      {
        Attach_photo: sp('CreateAttachment', {
          table: details,
          itemId: "@outputs('Create_detail')?['body/ID']",
          displayName: `@concat('foto-',string(${i}?['id']),'-',${i}?['photo']?['id'],'.jpg')`,
          body: `@base64ToBinary(${i}?['photo']?['contentBase64'])`,
        }),
        Confirm_photo: sp(
          'PatchItem',
          {
            table: details,
            id: "@outputs('Create_detail')?['body/ID']",
            'item/Title': `@concat('PRE2-',${b}?['submissionId'],'-',string(${i}?['id']))`,
            'item/FotosCount': 1,
          },
          'Attach_photo',
        ),
      },
      {},
      'Create_detail',
    ),
  },
};
const htmlEscape = (value) =>
  `replace(replace(replace(string(${value}),'&','&amp;'),'<','&lt;'),'>','&gt;')`;
const s = `${p}?['summary']`;
const lit = (str) => `'${str}'`;
const num = (expr) => `string(${expr})`;
const hallazgosRow = `if(greater(${s}?['hallazgos'],0),concat(${lit('<tr><td colspan="4" style="padding:16px 6px 0;font-size:13px;font-weight:600;color:#8e1c27">⚠ ')},${num(`${s}?['hallazgos']`)},${lit(' ítem(s) requieren seguimiento (NO OK / EN PROC).</td></tr>')}),${lit('<tr><td colspan="4" style="padding:16px 6px 0;font-size:13px;font-weight:600;color:#166b2f">Sin hallazgos pendientes de seguimiento.</td></tr>')})`;
const emailParts = [
  lit(
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">' +
      '<div style="background:#182228;padding:22px 26px;border-radius:8px 8px 0 0">' +
      '<span style="color:#fff;font-size:20px;font-weight:700">Preauditoría recibida</span>' +
      '</div>' +
      '<div style="border:1px solid #d9dfdb;border-top:none;padding:26px;border-radius:0 0 8px 8px">' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:13px">' +
      '<tr><td style="color:#5d696d;padding:3px 10px 3px 0;white-space:nowrap">Equipo</td><td style="font-weight:600">',
  ),
  htmlEscape(`${g}?['equipment']`),
  lit(
    '</td></tr>' +
      '<tr><td style="color:#5d696d;padding:3px 10px 3px 0;white-space:nowrap">Pozo</td><td style="font-weight:600">',
  ),
  htmlEscape(`${g}?['well']`),
  lit(
    '</td></tr>' +
      '<tr><td style="color:#5d696d;padding:3px 10px 3px 0;white-space:nowrap">Fecha</td><td style="font-weight:600">',
  ),
  htmlEscape(`${g}?['date']`),
  lit(
    '</td></tr>' +
      '<tr><td style="color:#5d696d;padding:3px 10px 3px 0;white-space:nowrap">Personal</td><td style="font-weight:600">',
  ),
  htmlEscape(`${g}?['inspectors']`),
  lit(
    '</td></tr>' +
      '</table>' +
      '<h3 style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#26363b">Resultado de la inspección</h3>' +
      '<table style="width:100%;border-collapse:collapse;text-align:center">' +
      '<tr>' +
      '<td style="background:#e9f3ec;color:#166b2f;padding:12px 4px;border-radius:6px 0 0 6px"><div style="font-size:24px;font-weight:700;line-height:1">',
  ),
  num(`${s}?['ok']`),
  lit(
    '</div><div style="font-size:10px;letter-spacing:.04em">OK</div></td>' +
      '<td style="background:#fbeaed;color:#8e1c27;padding:12px 4px"><div style="font-size:24px;font-weight:700;line-height:1">',
  ),
  num(`${s}?['noOk']`),
  lit(
    '</div><div style="font-size:10px;letter-spacing:.04em">NO OK</div></td>' +
      '<td style="background:#fff1d9;color:#865710;padding:12px 4px"><div style="font-size:24px;font-weight:700;line-height:1">',
  ),
  num(`${s}?['enProc']`),
  lit(
    '</div><div style="font-size:10px;letter-spacing:.04em">EN PROC</div></td>' +
      '<td style="background:#edf0f2;color:#58666d;padding:12px 4px;border-radius:0 6px 6px 0"><div style="font-size:24px;font-weight:700;line-height:1">',
  ),
  num(`${s}?['na']`),
  lit('</div><div style="font-size:10px;letter-spacing:.04em">N/A</div></td></tr>'),
  hallazgosRow,
  lit(
    '</table>' +
      '<p style="margin:22px 0 18px;font-size:13px;color:#26363b">Los ítems, sus evidencias fotográficas y el PDF de la inspección fueron guardados en SharePoint.</p>' +
      `<p style="margin:0 0 10px"><a href="${site}/Lists/INSPECCION%20DE%20CAMPO%20EQ%20TORRE/DispForm.aspx?ID=`,
  ),
  `string(${headerID})`,
  lit(
    '" style="color:#b92632;font-weight:600;text-decoration:none;font-size:13px">Abrir inspección →</a></p>' +
      `<p style="margin:0 0 22px"><a href="${site}/Lists/INSPECCION%20DE%20CAMPO%20EQ%20TORRE%20-%20ITEMS/AllItems.aspx?FilterField1=Recorrida&amp;FilterValue1=`,
  ),
  `string(${headerID})`,
  lit(
    '&amp;FilterLookupId1=1" style="color:#b92632;font-weight:600;text-decoration:none;font-size:13px">Ver ítems y fotos →</a></p>' +
      '<p style="margin:0;font-size:11px;color:#77847c;border-top:1px solid #edf0f0;padding-top:16px">Este mensaje confirma la recepción del registro; no certifica la condición técnica del equipo.</p>' +
      '</div></div>',
  ),
];
const emailBody = `@concat(${emailParts.join(',')})`;
const processingActions = {
  Save_items: saveItems,
  Attach_report: sp(
    'CreateAttachment',
    {
      table: headers,
      itemId: `@${headerID}`,
      displayName: `@${p}?['report']?['filename']`,
      body: `@base64ToBinary(${p}?['report']?['contentBase64'])`,
    },
    'Save_items',
  ),
  Metadata_sending: action('Compose', metadata('processing', 'sending'), 'Attach_report'),
  Save_before_email: sp(
    'PatchItem',
    {
      table: headers,
      id: `@${headerID}`,
      'item/Notas': "@string(outputs('Metadata_sending'))",
      'item/Cerrada': `@${p}?['closed']`,
      'item/FechaCierre': date(`${p}?['closedAt']`),
    },
    'Metadata_sending',
  ),
  Send_email: action(
    'OpenApiConnection',
    {
      host: {
        apiId: '/providers/Microsoft.PowerApps/apis/shared_office365',
        connectionName: 'shared_office365',
        operationId: 'SendEmailV2',
      },
      parameters: {
        'emailMessage/To': 'jcastro@tackertools.com',
        'emailMessage/Subject': `@concat('Preauditoría recibida - ',${g}?['equipment'],' - ',${b}?['submissionId'])`,
        'emailMessage/Body': emailBody,
        'emailMessage/Importance': 'Normal',
      },
      authentication: "@parameters('$authentication')",
      retryPolicy: { type: 'none' },
    },
    'Save_before_email',
  ),
  Metadata_complete: action('Compose', metadata('complete', 'sent'), 'Send_email'),
  Confirm_complete: sp(
    'PatchItem',
    { table: headers, id: `@${headerID}`, 'item/Notas': "@string(outputs('Metadata_complete'))" },
    'Metadata_complete',
  ),
};
// The response acknowledges acceptance, while subsequent actions persist and notify.
processingActions.Save_items.runAfter = {};
const invalid = `@or(and(contains(createArray('NO_OK','EN_PROC'),item()?['state']),empty(item()?['photo'])),and(not(empty(item()?['photo'])),or(not(startsWith(coalesce(item()?['photo']?['contentBase64'],''),'/9j/')),not(empty(${onlyHex("item()?['photo']?['id']")})))),not(equals(base64(base64ToBinary(coalesce(item()?['photo']?['contentBase64'],''))),coalesce(item()?['photo']?['contentBase64'],''))),and(${p}?['closed'],equals(item()?['state'],'SIN_REVISAR')))`;
const validActions = {
  Metadata_processing: initialMeta,
  Create_header: sp('PostItem', headerParams, 'Metadata_processing'),
  Response_accepted: response(
    202,
    { status: 'processing', headerId: `@${headerID}` },
    'Create_header',
  ),
  Process: {
    type: 'Scope',
    actions: processingActions,
    runAfter: { Response_accepted: ['Succeeded'] },
  },
  Record_failure: {
    ...sp('PatchItem', {
      table: headers,
      id: `@${headerID}`,
      'item/Notas': `@string(setProperty(setProperty(outputs('Metadata_processing'),'status','failed'),'emailState','unconfirmed'))`,
      'item/Cerrada': false,
    }),
    runAfter: { Process: ['Failed', 'TimedOut'] },
  },
};
const submitActions = {
  Parse_payload: action('ParseJson', { content: `@${b}?['payload']`, schema: payloadSchema }),
  Invalid_items: action('Query', { from: `@${p}?['answers']`, where: invalid }, 'Parse_payload'),
  Item_ids: action(
    'Select',
    { from: `@${p}?['answers']`, select: { id: "@item()?['id']" } },
    'Invalid_items',
  ),
  Validate: condition(
    `@and(empty(body('Invalid_items')),equals(length(body('Item_ids')),length(union(body('Item_ids'),body('Item_ids')))),not(empty(trim(${g}?['equipment']))),not(empty(trim(${g}?['well']))),not(empty(trim(${g}?['inspectors']))),or(not(${p}?['closed']),and(equals(length(${p}?['answers']),${catalog.length}),not(empty(${p}?['closedAt'])))))`,
    validActions,
    {
      Invalid_response: response(422, {
        error: 'Revisá los campos obligatorios, las fotos y los datos de cierre.',
      }),
    },
    'Item_ids',
  ),
};
const existingMeta = "json(first(body('Find_header')?['value'])?['Notas'])";
const existingActions = {
  Check_owner: condition(
    `@equals(${existingMeta}?['accessKey'],${b}?['accessKey'])`,
    {
      Current_status: response(200, {
        status: `@${existingMeta}?['status']`,
        emailState: `@${existingMeta}?['emailState']`,
        headerId: "@first(body('Find_header')?['value'])?['ID']",
      }),
    },
    { Denied: response(403, { error: 'No se encontró una recepción para este comprobante.' }) },
  ),
};
const definition = {
  $schema:
    'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '2.1.0.0',
  parameters: {
    $connections: { type: 'Object', defaultValue: {} },
    $authentication: { type: 'SecureObject', defaultValue: {} },
    catalog: { type: 'Array', defaultValue: catalog },
  },
  triggers: {
    manual: {
      type: 'Request',
      kind: 'Http',
      inputs: { method: 'POST', schema: {}, triggerAuthenticationType: 'All' },
    },
  },
  actions: {
    Parse_envelope: action('ParseJson', {
      content: '@json(string(triggerBody()))',
      schema: envelopeSchema,
    }),
    Validate_access: action(
      'ParseJson',
      {
        content: {
          valid: `@and(empty(${onlyHex(`${b}?['submissionId']`)}),empty(${onlyHex(`${b}?['accessKey']`)}))`,
        },
        schema: object({ valid: { enum: [true] } }),
      },
      'Parse_envelope',
    ),
    Find_header: sp(
      'GetItems',
      {
        table: headers,
        $filter: `@concat('Title eq ',decodeUriComponent('%27'),'PRE2-',${b}?['submissionId'],decodeUriComponent('%27'))`,
        $top: 2,
      },
      'Validate_access',
    ),
    Route: condition(
      "@greater(length(body('Find_header')?['value']),1)",
      {
        Duplicate_error: response(409, {
          error: 'La recepción tiene una clave duplicada. No se procesó.',
        }),
      },
      {
        Exists: condition("@equals(length(body('Find_header')?['value']),1)", existingActions, {
          New_request: condition(`@equals(${b}?['mode'],'submit')`, submitActions, {
            Not_found: response(200, { status: 'not_found' }),
          }),
        }),
      },
      'Find_header',
    ),
    Invalid_envelope: {
      ...response(400, { error: 'Solicitud inválida.' }),
      runAfter: { Parse_envelope: ['Failed', 'TimedOut'] },
    },
    Invalid_access: {
      ...response(400, { error: 'Comprobante inválido.' }),
      runAfter: { Validate_access: ['Failed', 'TimedOut'] },
    },
    Invalid_payload: {
      ...response(400, { error: 'No se pudo procesar la solicitud. Conservá el comprobante.' }),
      runAfter: { Route: ['Failed', 'TimedOut'] },
    },
  },
  outputs: {},
};
function removePatterns(value) {
  if (value && typeof value === 'object') {
    delete value.pattern;
    for (const child of Object.values(value)) removePatterns(child);
  }
}
removePatterns(definition);
await mkdir('power-automate', { recursive: true });
await writeFile('power-automate/definition.json', JSON.stringify(definition, null, 2) + '\n');
console.log(
  'Flujo generado: validación, fotos por ítem, recepción idempotente y correo fijo al titular.',
);
