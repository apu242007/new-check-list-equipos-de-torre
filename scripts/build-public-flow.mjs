import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseCatalog } from '../src/domain.mjs';
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
  responsible: str(),
  deadline: str(10),
  action: str(6000),
  evidence: str(6000),
  observation: str(6000),
  finalState: { enum: ['PENDIENTE', 'CERRADO'] },
  closedAt: str(10),
  closureEvidence: str(6000),
  verifiedBy: str(),
  photo: { anyOf: [{ type: 'null' }, photoSchema] },
});
const generalSchema = object({
  date: { ...str(10, 10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  equipment: str(255, 1),
  well: str(255, 1),
  location: str(),
  operator: { enum: ['', 'YPF', 'TotalEnergies', 'Vista', 'PAE', 'Otra'] },
  company: str(),
  inspectors: str(255, 1),
  supervisor: str(),
  auditDate: str(10),
  contract: str(),
  representative: str(),
  notes: str(6000),
});
const payloadSchema = object({
  draftId: uuid,
  general: generalSchema,
  answers: { type: 'array', minItems: 1, maxItems: catalog.length, items: answerSchema },
  closed: { type: 'boolean' },
  closedAt: str(10),
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
  'item/AppVersion': '2.0.0',
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
  'item/Responsable': `@${i}?['responsible']`,
  'item/Plazo': date(`${i}?['deadline']`),
  'item/AccionCorrectiva': `@${i}?['action']`,
  'item/EstadoFinal/Value': `@${i}?['finalState']`,
  'item/FechaVerif': date(`${i}?['closedAt']`),
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
      evidence: `@${i}?['evidence']`,
      closureEvidence: `@${i}?['closureEvidence']`,
      verifiedBy: `@${i}?['verifiedBy']`,
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
const emailBody = `@concat('<h2>Checklist de preauditoría recibido</h2><p>Equipo: ',${htmlEscape(`${g}?['equipment']`)},'<br>Pozo: ',${htmlEscape(`${g}?['well']`)},'<br>Inspección: ',${htmlEscape(`${p}?['draftId']`)},'</p><p>Los ítems y sus evidencias fotográficas fueron guardados en SharePoint.</p><p><a href="${site}/Lists/INSPECCION%20DE%20CAMPO%20EQ%20TORRE/DispForm.aspx?ID=',string(${headerID}),'">Abrir inspección</a></p><p><a href="${site}/Lists/INSPECCION%20DE%20CAMPO%20EQ%20TORRE%20-%20ITEMS/AllItems.aspx?FilterField1=Recorrida&amp;FilterValue1=',string(${headerID}),'&amp;FilterLookupId1=1">Ver ítems y fotos</a></p><p>Este mensaje confirma la recepción del registro; no certifica la condición técnica del equipo.</p>')`;
const processingActions = {
  Save_items: saveItems,
  Metadata_sending: action('Compose', metadata('processing', 'sending'), 'Save_items'),
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
const invalid = `@or(and(contains(createArray('NO_OK','EN_PROC'),item()?['state']),or(empty(trim(item()?['responsible'])),empty(item()?['deadline']),empty(trim(item()?['action'])),empty(trim(item()?['evidence'])),empty(item()?['photo']))),and(not(empty(item()?['photo'])),or(not(startsWith(coalesce(item()?['photo']?['contentBase64'],''),'/9j/')),not(empty(${onlyHex("item()?['photo']?['id']")})))),not(equals(base64(base64ToBinary(coalesce(item()?['photo']?['contentBase64'],''))),coalesce(item()?['photo']?['contentBase64'],''))),and(equals(item()?['finalState'],'CERRADO'),or(empty(item()?['closedAt']),empty(trim(item()?['closureEvidence'])),empty(trim(item()?['verifiedBy'])))),and(${p}?['closed'],or(equals(item()?['state'],'SIN_REVISAR'),and(contains(createArray('NO_OK','EN_PROC'),item()?['state']),not(equals(item()?['finalState'],'CERRADO'))))))`;
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
  contentVersion: '2.0.0.0',
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
