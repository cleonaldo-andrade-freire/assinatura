import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDateBR, wrapText } from "@/lib/pdfTextLayout";
import { formatTreatmentsLabel } from "@/lib/treatments";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;
const BOTTOM_LIMIT = 100;

interface EvolutionSnapshot {
  schema: "evolucao/v1";
  clinic: { name: string; logoUrl: string | null };
  dentist: { name: string; cro: string; croUf: string };
  patient: { name: string; cpf: string | null };
  treatments: { name: string; toothRegion: string | null }[];
  evolutionDate: string;
  text: string;
}

/**
 * PDF-base da evolução pra assinatura ICP-Brasil da dentista — só o
 * conteúdo clínico, sem carimbo de assinatura nenhum: quem desenha o
 * "ASSINADO DIGITALMENTE — ICP-BRASIL" e insere o placeholder CMS é o
 * próprio `LocalAgentProvider.requestSignature()` (mesmo padrão de
 * certificatePdf.ts pros atestados) — este builder não sabe nada sobre
 * assinatura, só sobre o texto da evolução.
 */
export async function buildEvolutionDentistPdf(snapshot: EvolutionSnapshot): Promise<Uint8Array> {
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

  page.drawText("Evolução Clínica", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
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
  if (snapshot.patient.cpf) field("CPF:", snapshot.patient.cpf);
  field("Dentista responsável:", `${snapshot.dentist.name} — CRO ${snapshot.dentist.cro}/${snapshot.dentist.croUf}`);
  field("Data do atendimento:", formatDateBR(snapshot.evolutionDate));
  field(snapshot.treatments.length > 1 ? "Tratamentos:" : "Tratamento:", formatTreatmentsLabel(snapshot.treatments));

  ensureSpace(20);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 24;

  for (const line of wrapText(snapshot.text, font, 11, contentWidth)) {
    ensureSpace(15);
    page.drawText(line, { x: MARGIN, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 15;
  }

  y -= 10;
  const declText =
    "Registro de evolução clínica de responsabilidade da(o) dentista acima identificada(o), assinado digitalmente " +
    "com certificado ICP-Brasil.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    ensureSpace(12);
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  return doc.save({ useObjectStreams: false });
}
