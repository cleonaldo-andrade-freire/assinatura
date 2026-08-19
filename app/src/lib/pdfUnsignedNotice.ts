import { PDFFont, PDFPage, rgb } from "pdf-lib";

/**
 * Aviso + linha de assinatura manual pra via não assinada digitalmente
 * (prompt §8). Desenhado na mesma área reservada pelo carimbo do provedor
 * de assinatura (ver `mockProvider.ts`: margin 48, boxY 24, boxHeight 58) —
 * como aqui nenhum provedor é chamado, quem desenha essa área é o próprio
 * gerador de PDF (`certificatePdf.ts`/`prescriptionPdf.ts`), só quando
 * `unsigned: true`.
 */
export function drawUnsignedSignatureBox(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  margin: number,
  dentistName: string,
  dentistDoc: string
) {
  const { width } = page.getSize();
  const boxHeight = 58;
  const boxY = 24;

  page.drawRectangle({
    x: margin,
    y: boxY,
    width: width - margin * 2,
    height: boxHeight,
    borderColor: rgb(0.35, 0.35, 0.35),
    borderWidth: 1,
    borderDashArray: [4, 3],
  });

  page.drawText("SEM ASSINATURA DIGITAL ICP-BRASIL — REQUER ASSINATURA E CARIMBO MANUAIS", {
    x: margin + 10,
    y: boxY + boxHeight - 16,
    size: 8.5,
    font: bold,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawLine({
    start: { x: margin + 10, y: boxY + 22 },
    end: { x: margin + 230, y: boxY + 22 },
    thickness: 0.8,
    color: rgb(0.55, 0.55, 0.55),
  });
  page.drawText("Assinatura e carimbo", {
    x: margin + 10,
    y: boxY + 10,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`${dentistName} — ${dentistDoc}`, {
    x: margin + 250,
    y: boxY + 22,
    size: 8.5,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}
