import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { wrapText } from "@/lib/pdfTextLayout";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;

export interface AnamnesisDentistDeclaration {
  dentist: { name: string; cro: string; croUf: string };
}

/**
 * Adiciona a página de contra-assinatura da dentista ao FINAL do PDF que a
 * paciente já assinou (`doc` já vem carregado via `PDFDocument.load`, ver
 * `anamnesisDentistSignature.ts`) — não recria identificação/respostas, que
 * já estão nas páginas anteriores. O resultado é um único arquivo com as
 * duas assinaturas, não um PDF paralelo (era assim antes desta mudança:
 * "arquivo PRÓPRIO, separado do PDF que o paciente já assinou").
 *
 * Sem carimbo de assinatura nenhum aqui: quem desenha o
 * "ASSINADO DIGITALMENTE — ICP-BRASIL" e insere o placeholder CMS é o
 * `LocalAgentProvider.requestSignature()`, chamado logo depois com os bytes
 * que esta função devolve.
 */
export async function appendAnamnesisDentistDeclaration(
  doc: PDFDocument,
  declaration: AnamnesisDentistDeclaration
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
    "Ficha de anamnese revisada e assinada digitalmente pela(o) dentista acima identificada(o), " +
    "com certificado ICP-Brasil, confirmando ciência do conteúdo declarado e assinado eletronicamente " +
    "pelo paciente nas páginas anteriores deste mesmo arquivo.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  return doc.save({ useObjectStreams: false });
}
