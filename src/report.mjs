import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const THUMB_SIDE = 60;
const STATE_COLORS = {
  OK: rgb(0.16, 0.5, 0.32),
  'NO OK': rgb(0.62, 0.15, 0.16),
  'EN PROC': rgb(0.6, 0.4, 0.06),
  'N/A': rgb(0.35, 0.4, 0.43),
  '': rgb(0.5, 0.5, 0.5),
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

export async function buildReportPdf(draft, catalog, thumbnails = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  function ensureSpace(height) {
    if (y - height < MARGIN) {
      page = pdfDoc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  }
  function line(str, { size = 10, f = font, color = rgb(0.1, 0.1, 0.1), gap = 4 } = {}) {
    page.drawText(str, { x: MARGIN, y, size, font: f, color });
    y -= size + gap;
  }

  line('Checklist de preauditoría', { size: 18, f: bold, gap: 8 });
  const g = draft.general;
  line(`Equipo: ${g.equipment || '-'}    Pozo: ${g.well || '-'}    Fecha: ${g.date || '-'}`, {
    size: 10,
    gap: 3,
  });
  line(`Operadora: ${g.operator || '-'}    Empresa: ${g.company || '-'}`, { size: 10, gap: 3 });
  line(`Personal: ${g.inspectors || '-'}    Supervisor: ${g.supervisor || '-'}`, {
    size: 10,
    gap: 3,
  });
  y -= 10;

  for (const section of catalog) {
    ensureSpace(30);
    line(`${String(section.id).padStart(2, '0')}. ${section.title}`, {
      size: 13,
      f: bold,
      gap: 8,
      color: rgb(0.62, 0.15, 0.16),
    });
    for (const item of section.items) {
      const answer = draft.answers[item.id] || {};
      const thumb = thumbnails[item.id];
      const textWidth = CONTENT_WIDTH - (thumb ? THUMB_SIDE + 10 : 0);
      const titleLines = wrapText(
        `${String(item.id).padStart(3, '0')} — ${item.text}`,
        bold,
        9.5,
        textWidth,
      );
      const obsLines = answer.observation
        ? wrapText(`Observación: ${answer.observation}`, font, 9, textWidth)
        : [];
      const textHeight = (titleLines.length + obsLines.length) * 12 + 12 + 8;
      const blockHeight = Math.max(textHeight, thumb ? THUMB_SIDE + 8 : 0);
      ensureSpace(blockHeight);
      const blockTop = y;
      for (const l of titleLines) line(l, { size: 9.5, f: bold, gap: 2 });
      line(`Estado: ${answer.state || 'Sin revisar'}`, {
        size: 9,
        color: STATE_COLORS[answer.state || ''] || STATE_COLORS[''],
        gap: 2,
      });
      for (const l of obsLines) line(l, { size: 9, gap: 2 });
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
      y -= 8;
    }
  }

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
