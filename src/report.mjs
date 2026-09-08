import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const THUMB_SIDE = 60;
const FOOTER_HEIGHT = 26;

const RED = rgb(0.7255, 0.149, 0.1961);
const DARK = rgb(0.0941, 0.1333, 0.1569);
const MUTED = rgb(0.3647, 0.4118, 0.4275);
const INK = rgb(0.1176, 0.1216, 0.1216);
const LIGHT_BORDER = rgb(0.851, 0.8745, 0.8627);

const STATE_STYLE = {
  OK: { bg: rgb(0.9137, 0.9529, 0.9255), fg: rgb(0.0863, 0.4196, 0.1843), label: 'OK' },
  'NO OK': { bg: rgb(0.9843, 0.9176, 0.9294), fg: rgb(0.5569, 0.1098, 0.1529), label: 'NO OK' },
  'EN PROC': { bg: rgb(1, 0.9451, 0.851), fg: rgb(0.5255, 0.3412, 0.0627), label: 'EN PROC' },
  'N/A': { bg: rgb(0.9294, 0.9412, 0.949), fg: rgb(0.3451, 0.4, 0.4275), label: 'N/A' },
  '': { bg: rgb(0.9294, 0.9412, 0.949), fg: MUTED, label: 'SIN REVISAR' },
};

export function wrapText(text, font, size, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function summarize(draft, catalog) {
  const summary = { ok: 0, noOk: 0, enProc: 0, na: 0, sinRevisar: 0, hallazgos: 0, total: 0 };
  for (const item of catalog.flatMap((s) => s.items)) {
    const state = (draft.answers[item.id] || {}).state || '';
    if (state === 'OK') summary.ok++;
    else if (state === 'NO OK') summary.noOk++;
    else if (state === 'EN PROC') summary.enProc++;
    else if (state === 'N/A') summary.na++;
    else summary.sinRevisar++;
    summary.total++;
  }
  summary.hallazgos = summary.noOk + summary.enProc;
  return summary;
}

function findings(draft, catalog) {
  const list = [];
  for (const section of catalog)
    for (const item of section.items) {
      const state = (draft.answers[item.id] || {}).state || '';
      if (state === 'NO OK' || state === 'EN PROC')
        list.push({ item, section, state, answer: draft.answers[item.id] });
    }
  return list;
}

export async function buildReportPdf(draft, catalog, thumbnails = {}) {
  const summary = summarize(draft, catalog);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  function ensureSpace(height) {
    if (y - height < MARGIN + FOOTER_HEIGHT) {
      page = pdfDoc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  }
  function line(str, { size = 10, f = font, color = INK, gap = 4, x = MARGIN } = {}) {
    page.drawText(str, { x, y, size, font: f, color });
    y -= size + gap;
  }
  function badgeWidth(text, size = 8) {
    const style = STATE_STYLE[text] || STATE_STYLE[''];
    return bold.widthOfTextAtSize(style.label, size) + 10;
  }
  function badge(text, right, top, { size = 8 } = {}) {
    const style = STATE_STYLE[text] || STATE_STYLE[''];
    const width = badgeWidth(text, size);
    const height = size + 7;
    const x = right - width;
    page.drawRectangle({ x, y: top - height, width, height, color: style.bg });
    page.drawText(style.label, { x: x + 5, y: top - height + 4, size, font: bold, color: style.fg });
    return width;
  }

  // --- Cover: brand band ---
  page.drawRectangle({ x: 0, y: PAGE.height - 78, width: PAGE.width, height: 78, color: DARK });
  page.drawText('CHECKLIST DE PREAUDITORÍA', {
    x: MARGIN,
    y: PAGE.height - 40,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    `Generado ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · Documento ${draft.id}`,
    { x: MARGIN, y: PAGE.height - 60, size: 8.5, font, color: rgb(0.75, 0.8, 0.82) },
  );
  y = PAGE.height - 78 - 26;

  // --- General data table ---
  const g = draft.general;
  const infoRows = [
    ['Equipo / Rig', g.equipment],
    ['Pozo', g.well],
    ['Fecha de inspección', g.date],
    ['Operadora', g.operator],
    ['Empresa', g.company],
    ['Personal que realiza la inspección', g.inspectors],
    ['Supervisor responsable', g.supervisor],
    ['Auditoría programada', g.auditDate],
    ['Contrato', g.contract],
    ['Company Representative', g.representative],
  ];
  for (const [label, value] of infoRows) {
    line(label, { size: 8.5, color: MUTED, gap: 1, x: MARGIN });
    line(value || '—', { size: 10.5, f: bold, gap: 6, x: MARGIN });
  }
  y -= 6;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 0.75, color: LIGHT_BORDER });
  y -= 20;

  // --- Results summary ---
  line('RESULTADO DE LA INSPECCIÓN', { size: 10.5, f: bold, color: DARK, gap: 12 });
  const boxes = [
    ['OK', summary.ok, STATE_STYLE.OK],
    ['NO OK', summary.noOk, STATE_STYLE['NO OK']],
    ['EN PROC', summary.enProc, STATE_STYLE['EN PROC']],
    ['N/A', summary.na, STATE_STYLE['N/A']],
  ];
  const boxWidth = (CONTENT_WIDTH - 3 * 8) / 4;
  const boxHeight = 52;
  const boxTop = y;
  boxes.forEach(([label, count, style], idx) => {
    const x = MARGIN + idx * (boxWidth + 8);
    page.drawRectangle({ x, y: boxTop - boxHeight, width: boxWidth, height: boxHeight, color: style.bg });
    const countStr = String(count);
    page.drawText(countStr, {
      x: x + (boxWidth - bold.widthOfTextAtSize(countStr, 20)) / 2,
      y: boxTop - 28,
      size: 20,
      font: bold,
      color: style.fg,
    });
    page.drawText(label, {
      x: x + (boxWidth - font.widthOfTextAtSize(label, 8)) / 2,
      y: boxTop - boxHeight + 9,
      size: 8,
      font,
      color: style.fg,
    });
  });
  y = boxTop - boxHeight - 16;
  const hallazgosStyle = summary.hallazgos > 0 ? STATE_STYLE['NO OK'] : STATE_STYLE.OK;
  const hallazgosText =
    summary.hallazgos > 0
      ? `ATENCIÓN: ${summary.hallazgos} ítem(s) requieren seguimiento (NO OK / EN PROC).`
      : 'Sin hallazgos pendientes de seguimiento.';
  line(hallazgosText, { size: 10, f: bold, color: hallazgosStyle.fg, gap: 4 });
  if (summary.sinRevisar > 0)
    line(`${summary.sinRevisar} ítem(s) sin revisar.`, { size: 9, color: MUTED, gap: 4 });

  // --- Findings index (own page, so the cover stays a clean single page) ---
  const findingsList = findings(draft, catalog);
  if (findingsList.length) {
    page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    line('ÍNDICE DE HALLAZGOS', { size: 10.5, f: bold, color: DARK, gap: 10 });
    for (const { item, section, state } of findingsList) {
      const bw = badgeWidth(state, 7.5);
      const textWidth = CONTENT_WIDTH - 30 - bw - 10;
      const idLabel = `${String(item.id).padStart(3, '0')}`;
      const rowLines = wrapText(`${section.title} — ${item.text}`, font, 9, textWidth);
      const rowHeight = rowLines.length * 12 + 6;
      ensureSpace(rowHeight);
      const rowTop = y;
      badge(state, PAGE.width - MARGIN, rowTop + 9, { size: 7.5 });
      line(idLabel, { size: 9, f: bold, color: MUTED, gap: 0, x: MARGIN });
      y = rowTop;
      for (const l of rowLines) line(l, { size: 9, gap: 2, x: MARGIN + 30 });
      y -= 4;
    }
    y -= 6;
    page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 0.75, color: LIGHT_BORDER });
    y -= 16;
  }

  // --- Full detail, section by section (own page, after cover/findings) ---
  page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  y = PAGE.height - MARGIN;
  for (const section of catalog) {
    ensureSpace(32);
    line(`${String(section.id).padStart(2, '0')}. ${section.title.toUpperCase()}`, {
      size: 12,
      f: bold,
      gap: 10,
      color: RED,
    });
    for (const item of section.items) {
      const answer = draft.answers[item.id] || {};
      const thumb = thumbnails[item.id];
      const badgeRight = PAGE.width - MARGIN - (thumb ? THUMB_SIDE + 10 : 0);
      const bw = badgeWidth(answer.state || '', 8);
      const textWidth = CONTENT_WIDTH - (thumb ? THUMB_SIDE + 10 : 0) - bw - 10;
      const titleLines = wrapText(item.text, bold, 9.5, textWidth);
      const obsLines = answer.observation
        ? wrapText(`Observación: ${answer.observation}`, font, 9, textWidth)
        : [];
      const textHeight = (titleLines.length + obsLines.length) * 12 + 10;
      const blockHeight = Math.max(textHeight, thumb ? THUMB_SIDE + 8 : 0);
      ensureSpace(blockHeight);
      const blockTop = y;
      badge(answer.state || '', badgeRight, blockTop + 9);
      line(`${String(item.id).padStart(3, '0')}`, { size: 8, color: MUTED, gap: 1, x: MARGIN });
      for (const l of titleLines) line(l, { size: 9.5, f: bold, gap: 2, x: MARGIN });
      for (const l of obsLines) line(l, { size: 9, color: MUTED, gap: 2, x: MARGIN });
      if (thumb) {
        const jpg = await pdfDoc.embedJpg(base64ToBytes(thumb));
        const dims = jpg.scaleToFit(THUMB_SIDE, THUMB_SIDE);
        page.drawImage(jpg, {
          x: PAGE.width - MARGIN - dims.width,
          y: blockTop - dims.height,
          width: dims.width,
          height: dims.height,
        });
      }
      y = Math.min(y, blockTop - blockHeight);
      y -= 6;
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 0.5, color: LIGHT_BORDER });
      y -= 8;
    }
  }

  // --- Footer on every page ---
  const pages = pdfDoc.getPages();
  const refLabel = `${g.equipment || '—'} · ${g.well || '—'}`;
  pages.forEach((p, idx) => {
    p.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 0.75, color: LIGHT_BORDER });
    p.drawText(refLabel, { x: MARGIN, y: 12, size: 7.5, font, color: MUTED });
    const pageLabel = `Página ${idx + 1} de ${pages.length}`;
    p.drawText(pageLabel, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(pageLabel, 7.5),
      y: 12,
      size: 7.5,
      font,
      color: MUTED,
    });
  });

  return pdfDoc.save();
}

export async function shrinkForReport(contentBase64) {
  const bytes = base64ToBytes(contentBase64);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    return dataUrl.split(',')[1];
  } finally {
    bitmap.close();
  }
}

export async function buildReport(draft, catalog, getPhoto) {
  const thumbnails = {};
  for (const item of catalog.flatMap((s) => s.items)) {
    const answer = draft.answers[item.id];
    if (!answer?.photo) continue;
    const stored = await getPhoto(answer.photo.id);
    if (!stored?.contentBase64) continue;
    thumbnails[item.id] = await shrinkForReport(stored.contentBase64);
  }
  const bytes = await buildReportPdf(draft, catalog, thumbnails);
  return { contentBase64: bytesToBase64(bytes), filename: `preauditoria-${draft.id}.pdf` };
}
