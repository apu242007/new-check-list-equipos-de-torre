import { validateDraft, newDraft } from './domain.mjs';
const codes = { OK: 'OK', 'NO OK': 'NO_OK', 'EN PROC': 'EN_PROC', 'N/A': 'NA', '': 'SIN_REVISAR' };
export async function buildPayload(draft, catalog, getPhoto) {
  const errors = validateDraft(draft, catalog);
  if (errors.length) throw Error(errors.map((e) => e.message).join('\n'));
  const general = Object.fromEntries(
    Object.keys(newDraft(catalog, '').general).map((k) => [k, draft.general[k] || '']),
  );
  const answers = [];
  for (const item of catalog.flatMap((s) => s.items)) {
    const a = draft.answers[item.id] || {};
    let photo = null;
    if (a.photo) {
      const stored = await getPhoto(a.photo.id);
      if (!stored?.contentBase64?.startsWith('/9j/') || stored.contentBase64.length > 1333336)
        throw Error(`Ítem ${item.id}: no se pudo recuperar la foto. Volvé a adjuntarla.`);
      photo = { id: stored.id, contentBase64: stored.contentBase64 };
    }
    answers.push({
      id: item.id,
      state: codes[a.state || ''],
      ...Object.fromEntries(
        [
          'responsible',
          'deadline',
          'action',
          'evidence',
          'observation',
          'closedAt',
          'closureEvidence',
          'verifiedBy',
        ].map((k) => [k, a[k] || '']),
      ),
      finalState: a.finalState || 'PENDIENTE',
      photo,
    });
  }
  const payload = {
    draftId: draft.id,
    general,
    answers,
    closed: !!draft.closed,
    closedAt: draft.closedAt || '',
  };
  if (JSON.stringify(payload).length > 35000000)
    throw Error('Las fotos superan 35 MB por envío. Usá imágenes más pequeñas.');
  return payload;
}
export async function sendInspection(
  config,
  draft,
  catalog,
  {
    getPhoto,
    checkpoint = () => {},
    onStatus = () => {},
    fetcher = fetch,
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  },
) {
  if (!config.submissionUrl?.startsWith('https://'))
    throw Error('El servicio de recepción todavía no está configurado. Conservá el borrador.');
  const payload = await buildPayload(draft, catalog, getPhoto);
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  let receipt = draft.delivery;
  if (receipt?.fingerprint === fingerprint && receipt.stage === 'confirmed') return receipt;
  if (receipt && receipt.stage !== 'confirmed' && receipt.fingerprint !== fingerprint)
    throw Error(
      'Hay un envío pendiente. Recuperá primero su confirmación antes de enviar cambios.',
    );
  const fresh = !receipt || receipt.fingerprint !== fingerprint;
  if (fresh) {
    receipt = draft.delivery = {
      submissionId: crypto.randomUUID(),
      accessKey: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
      fingerprint,
      stage: 'pending',
    };
    checkpoint();
  }
  async function request(mode) {
    let response;
    try {
      response = await fetcher(config.submissionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          mode,
          submissionId: receipt.submissionId,
          accessKey: receipt.accessKey,
          ...(mode === 'submit' ? { payload } : {}),
        }),
        signal: AbortSignal.timeout(110000),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw Error(
        'No se pudo confirmar el envío. Conservamos el comprobante; pulsá Guardar para consultar su estado.',
      );
    }
    if (!response.ok)
      throw Error(
        `No se pudo confirmar la recepción (${response.status}). Conservá el borrador y el comprobante.`,
      );
    return response.json();
  }
  onStatus('Enviando datos y fotos…');
  let status = await request(fresh ? 'submit' : 'status');
  for (let attempt = 0; attempt < 90; attempt++) {
    if (status.status === 'complete' && status.emailState === 'sent') {
      Object.assign(receipt, {
        stage: 'confirmed',
        headerId: status.headerId,
        confirmedAt: new Date().toISOString(),
      });
      checkpoint();
      onStatus('Datos y fotos guardados en SharePoint. Correo enviado.');
      return receipt;
    }
    if (status.status === 'failed')
      throw Error(
        'No se pudo confirmar el guardado y el correo. Conservá el comprobante para revisar la recepción.',
      );
    if (status.status === 'not_found')
      throw Error(
        'Todavía no se encontró el envío. Conservá el comprobante y volvé a consultar; no se generó otra inspección.',
      );
    if (status.status !== 'processing')
      throw Error('Respuesta de recepción desconocida. No se puede confirmar el envío.');
    Object.assign(receipt, { stage: 'processing', headerId: status.headerId });
    checkpoint();
    onStatus('Recibido. Guardando ítems y fotos y enviando el correo…');
    await pause(5000);
    status = await request('status');
  }
  throw Error(
    'La recepción continúa en proceso. El comprobante quedó guardado; pulsá Guardar para consultar nuevamente.',
  );
}
