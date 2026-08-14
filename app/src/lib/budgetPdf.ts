import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDateBR, wrapText } from "@/lib/pdfTextLayout";
import { formatMoneyDisplay } from "@/lib/money";
import type { Budget, BudgetItem } from "@/lib/database.types";

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

/** Monta o PDF do orçamento — mesmo estilo de `certificatePdf.ts`, adaptado
 * pra uma lista de itens em vez de um texto corrido. Só entram no PDF os
 * itens marcados (`selected`) — os desmarcados ficam só no registro interno. */
export async function buildBudgetPdf(
  budget: Budget,
  items: BudgetItem[],
  clinicName: string,
  logo: LogoImage | null
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

  page.drawText("Orçamento Odontológico", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  page.drawText(clinicName, { x: MARGIN, y, size: 10.5, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 28;

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  field("Paciente:", budget.patient_name);
  field("Descrição:", budget.description);
  field("Responsável:", budget.responsible_name);
  field("Data:", formatDateBR(budget.budget_date));

  ensureSpace(20);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 22;

  const selectedItems = items.filter((i) => i.selected);
  for (const item of selectedItems) {
    ensureSpace(28);
    const label = item.tooth_region ? `${item.tooth_region} — ${item.treatment_name}` : item.treatment_name;
    for (const line of wrapText(label, bold, 11, contentWidth - 90)) {
      ensureSpace(15);
      page.drawText(line, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
      y -= 15;
    }
    const priceText = formatMoney(item.price);
    const priceWidth = font.widthOfTextAtSize(priceText, 11);
    page.drawText(priceText, { x: PAGE_WIDTH - MARGIN - priceWidth, y: y + 15, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 8;
  }

  const selectedValue = selectedItems.reduce((sum, i) => sum + i.price, 0);
  const discountAmount = budget.discount_type === "percent" ? (selectedValue * budget.discount_value) / 100 : budget.discount_value;
  const total = Math.max(0, selectedValue - discountAmount);

  ensureSpace(20);
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 22;

  function totalRow(label: string, value: string, big?: boolean) {
    ensureSpace(20);
    const size = big ? 13 : 11;
    const usedFont = big ? bold : font;
    page.drawText(label, { x: MARGIN, y, size, font: usedFont, color: rgb(0.08, 0.08, 0.08) });
    const valueWidth = usedFont.widthOfTextAtSize(value, size);
    page.drawText(value, { x: PAGE_WIDTH - MARGIN - valueWidth, y, size, font: usedFont, color: rgb(0.08, 0.08, 0.08) });
    y -= big ? 20 : 16;
  }

  if (discountAmount > 0) totalRow("Desconto", `- ${formatMoney(discountAmount)}`);
  totalRow("Total", formatMoney(total), true);

  if (budget.installments > 1) {
    ensureSpace(16);
    const installmentValue = budget.down_payment_value ? (total - budget.down_payment_value) / budget.installments : total / budget.installments;
    field("Condições:", `${budget.installments}x de ${formatMoney(installmentValue)}${budget.payment_method ? ` — ${budget.payment_method}` : ""}`);
  }
  if (budget.down_payment_value) {
    field("Entrada:", `${formatMoney(budget.down_payment_value)}${budget.down_payment_method ? ` — ${budget.down_payment_method}` : ""}`);
  }

  if (budget.notes) {
    ensureSpace(20);
    y -= 6;
    page.drawText("Observações", { x: MARGIN, y, size: 10.5, font: bold, color: rgb(0.08, 0.08, 0.08) });
    y -= 14;
    for (const line of wrapText(budget.notes, font, 10, contentWidth)) {
      ensureSpace(13);
      page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 13;
    }
  }

  return doc.save();
}
