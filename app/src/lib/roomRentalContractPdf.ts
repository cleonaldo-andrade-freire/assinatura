import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDateOnlyBR, formatTimestampBR } from "@/lib/date";
import { wrapText } from "@/lib/pdfTextLayout";
import { contractClauses, contractShiftLabel, formatContractAmount, lessorLine, partyLine, type RentalContractSnapshot } from "@/lib/roomRentalContract";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;
const BOTTOM_LIMIT = 60;
const INK = rgb(0.08, 0.08, 0.08);
const SOFT = rgb(0.4, 0.4, 0.4);

export interface ContractPdfSignature {
  signedAt: string;
  dataUrl: string | null;
  ip: string | null;
  contentHash: string;
}

/**
 * PDF do contrato de locação assinado — gerado na hora do download a partir
 * do snapshot congelado no envio (o mesmo texto que o locatário leu na
 * página) e da assinatura gravada. Não fica salvo: o snapshot não muda depois
 * de assinado, então gerar de novo dá o mesmo conteúdo.
 */
export async function buildRentalContractPdf(s: RentalContractSnapshot, sig: ContractPdfSignature): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Contrato de locação — ${s.tenant.name} — ${formatDateOnlyBR(s.rental.date)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < BOTTOM_LIMIT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  function paragraph(text: string, opts: { size?: number; f?: typeof font; color?: typeof INK; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    for (const line of wrapText(text, f, size, width - indent)) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN + indent, y, size, font: f, color: opts.color ?? INK });
      y -= size + 4;
    }
    y -= opts.gap ?? 4;
  }

  page.drawText("Contrato de locação da sala por turno", { x: MARGIN, y, size: 16, font: bold, color: INK });
  y -= 18;
  paragraph(s.lessor.clinicName, { size: 10, color: SOFT, gap: 10 });

  // Resumo: locatário, dia, turno, valor.
  const summary: [string, string][] = [
    ["Locatário:", s.tenant.name],
    ["Dia:", formatDateOnlyBR(s.rental.date)],
    ["Turno:", contractShiftLabel(s.rental)],
    ["Valor:", formatContractAmount(s.rental.amount)],
  ];
  for (const [label, value] of summary) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: INK });
    page.drawText(value, { x: MARGIN + bold.widthOfTextAtSize(`${label} `, 11), y, size: 11, font, color: INK });
    y -= 16;
  }

  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 20;

  paragraph(`LOCADORA: ${lessorLine(s.lessor)}.`);
  paragraph(`LOCATÁRIO: ${partyLine(s.tenant.name, s.tenant.document, s.tenant.cro, s.tenant.croUf)}.`, { gap: 8 });
  paragraph("As partes acima combinam a locação da sala nas condições abaixo.", { gap: 10 });

  contractClauses(s).forEach((clause, i) => {
    ensureSpace(32);
    paragraph(`${i + 1}. ${clause.title}`, { f: bold, size: 11, gap: 2 });
    for (const p of clause.paragraphs) paragraph(p, { indent: 14 });
    y -= 4;
  });

  // Assinatura do locatário.
  ensureSpace(150);
  y -= 10;
  if (sig.dataUrl?.startsWith("data:image/png;base64,")) {
    const png = await doc.embedPng(Buffer.from(sig.dataUrl.split(",")[1], "base64"));
    const scale = Math.min(220 / png.width, 80 / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
    y -= h + 4;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 240, y }, thickness: 0.8, color: INK });
  y -= 14;
  page.drawText(s.tenant.name, { x: MARGIN, y, size: 10.5, font: bold, color: INK });
  y -= 13;
  page.drawText("LOCATÁRIO", { x: MARGIN, y, size: 9, font, color: SOFT });
  y -= 22;

  paragraph(
    `Assinado eletronicamente em ${formatTimestampBR(sig.signedAt)}${sig.ip ? `, IP ${sig.ip}` : ""}. ` +
      `Código de integridade do conteúdo (SHA-256): ${sig.contentHash}`,
    { size: 8.5, color: SOFT }
  );

  return doc.save();
}
