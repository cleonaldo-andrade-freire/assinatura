import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { drawClinicLetterhead, wrapText, type LetterheadClinic, type LetterheadDentist } from "@/lib/pdfTextLayout";
import { formatMoneyDisplay } from "@/lib/money";
import { formatBRDate } from "@/lib/date";
import type { Receipt, TreatmentDebit } from "@/lib/database.types";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;

interface LogoImage {
  bytes: Uint8Array;
  format: "png" | "jpg";
}

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/**
 * Monta o PDF do recibo — mesmo estilo de `budgetPdf.ts`. Diferente do
 * orçamento (uma data/forma de pagamento só pro documento inteiro), aqui
 * cada débito pode ter sido pago em data/forma diferente, então isso entra
 * como subtítulo de cada linha. `formatBRDate` (não `formatDateBR` do
 * pdfTextLayout) porque `paid_at`/`created_at` são timestamptz, não uma
 * data pura — precisa converter pro fuso de Brasília, não só fatiar a
 * string.
 */
export async function buildReceiptPdf(
  receipt: Receipt,
  debits: TreatmentDebit[],
  clinicInfo: LetterheadClinic,
  logo: LogoImage | null,
  dentist?: LetterheadDentist | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < 90) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  if (logo) {
    try {
      const image = logo.format === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const dim = image.scale(38 / image.height);
      page.drawImage(image, { x: PAGE_WIDTH - MARGIN - dim.width, y: PAGE_HEIGHT - 64, width: dim.width, height: dim.height });
    } catch {
      // sem logo no PDF nesse caso
    }
  }

  page.drawText("Recibo de Pagamento", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  y = drawClinicLetterhead(page, MARGIN, y, font, clinicInfo, dentist);

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  field("Paciente:", receipt.patient_name);
  field("Data de emissão:", formatBRDate(receipt.created_at));
  field("Recibo nº:", receipt.id.slice(0, 8).toUpperCase());

  ensureSpace(20);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 22;

  for (const debit of debits) {
    ensureSpace(34);
    for (const line of wrapText(debit.description, bold, 11, contentWidth - 90)) {
      ensureSpace(15);
      page.drawText(line, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
      y -= 15;
    }
    const priceText = formatMoney(debit.amount);
    const priceWidth = font.widthOfTextAtSize(priceText, 11);
    page.drawText(priceText, { x: PAGE_WIDTH - MARGIN - priceWidth, y: y + 15, size: 11, font, color: rgb(0.08, 0.08, 0.08) });

    const subtitle = [debit.payment_method, debit.paid_at ? formatBRDate(debit.paid_at) : null].filter(Boolean).join(" — ");
    if (subtitle) {
      page.drawText(subtitle, { x: MARGIN, y, size: 9.5, font, color: rgb(0.45, 0.45, 0.45) });
      y -= 14;
    }
    y -= 6;
  }

  ensureSpace(20);
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 22;

  ensureSpace(20);
  page.drawText("Total", { x: MARGIN, y, size: 13, font: bold, color: rgb(0.08, 0.08, 0.08) });
  const totalText = formatMoney(receipt.total_amount);
  const totalWidth = bold.widthOfTextAtSize(totalText, 13);
  page.drawText(totalText, { x: PAGE_WIDTH - MARGIN - totalWidth, y, size: 13, font: bold, color: rgb(0.08, 0.08, 0.08) });
  y -= 26;

  field("Declarado no IR:", receipt.declared_ir ? "Sim" : "Não");

  return doc.save();
}
