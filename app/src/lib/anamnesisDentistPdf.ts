import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDateBR, wrapText } from "@/lib/pdfTextLayout";
import { formatBRPhoneLocal, formatCPF } from "@/lib/validation";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;
const BOTTOM_LIMIT = 100;

export interface AnamnesisDentistSnapshot {
  schema: "anamnese-dentista/v1";
  clinic: { name: string; logoUrl: string | null };
  dentist: { name: string; cro: string; croUf: string };
  patient: { name: string; cpf: string | null; phone: string | null };
  answers: { question: string; answer: string }[];
  anamnesisDate: string;
}

/**
 * PDF-base pra assinatura ICP-Brasil da dentista sobre a anamnese — arquivo
 * PRÓPRIO, separado do PDF que o paciente já assinou (esse não é tocado).
 * Sem carimbo de assinatura nenhum: quem desenha isso é o
 * `LocalAgentProvider.requestSignature()`, mesmo padrão de
 * `evolutionDentistPdf.ts`/`certificatePdf.ts`.
 */
export async function buildAnamnesisDentistPdf(snapshot: AnamnesisDentistSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < BOTTOM_LIMIT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  page.drawText("Ficha de Anamnese", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  page.drawText(snapshot.clinic.name, { x: MARGIN, y, size: 10.5, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 28;

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  field("Paciente:", snapshot.patient.name);
  if (snapshot.patient.cpf) field("CPF:", formatCPF(snapshot.patient.cpf));
  if (snapshot.patient.phone) field("Celular:", formatBRPhoneLocal(snapshot.patient.phone));
  field("Dentista responsável:", `${snapshot.dentist.name} — CRO ${snapshot.dentist.cro}/${snapshot.dentist.croUf}`);
  field("Data da anamnese:", formatDateBR(snapshot.anamnesisDate));

  ensureSpace(20);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 24;

  for (const qa of snapshot.answers) {
    ensureSpace(30);
    for (const line of wrapText(qa.question.toUpperCase(), bold, 9, contentWidth)) {
      ensureSpace(13);
      page.drawText(line, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
      y -= 13;
    }
    for (const line of wrapText(qa.answer, font, 10.5, contentWidth)) {
      ensureSpace(15);
      page.drawText(line, { x: MARGIN, y, size: 10.5, font, color: rgb(0.08, 0.08, 0.08) });
      y -= 15;
    }
    y -= 10;
  }

  y -= 6;
  const declText =
    "Ficha de anamnese revisada e assinada digitalmente pela(o) dentista acima identificada(o), " +
    "com certificado ICP-Brasil, confirmando ciência do conteúdo declarado pelo paciente.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    ensureSpace(12);
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  return doc.save({ useObjectStreams: false });
}
