import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { wrapText } from "@/lib/pdfTextLayout";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;

export interface EvolutionDentistDeclaration {
  dentist: { name: string; cro: string; croUf: string };
}

/**
 * Adiciona a página de contra-assinatura da dentista ao FINAL do PDF que o
 * paciente já assinou (`doc` já vem carregado via `PDFDocument.load`, ver
 * `evolutionDentistSignature.ts`) — mesmo desenho de
 * `anamnesisDentistPdf.ts`/`appendAnamnesisDentistDeclaration`. Só é chamado
 * depois que o paciente já confirmou ciência (ordem invertida em relação ao
 * comportamento antigo, onde a dentista assinava primeiro e o paciente
 * ficava com um PDF à parte).
 */
export async function appendEvolutionDentistDeclaration(
  doc: PDFDocument,
  declaration: EvolutionDentistDeclaration
): Promise<Uint8Array> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  page.drawText("Contra-assinatura da dentista", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 32;

  page.drawText("Dentista responsável:", { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
  const labelWidth = bold.widthOfTextAtSize("Dentista responsável: ", 11);
  page.drawText(`${declaration.dentist.name} — CRO ${declaration.dentist.cro}/${declaration.dentist.croUf}`, {
    x: MARGIN + labelWidth,
    y,
    size: 11,
    font,
    color: rgb(0.08, 0.08, 0.08),
  });
  y -= 30;

  const declText =
    "Registro de evolução clínica assinado digitalmente pela(o) dentista acima identificada(o), com certificado " +
    "ICP-Brasil, de responsabilidade sobre o conteúdo clínico descrito nas páginas anteriores deste mesmo arquivo, " +
    "já assinado eletronicamente pelo paciente.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  return doc.save({ useObjectStreams: false });
}
