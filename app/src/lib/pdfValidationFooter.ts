import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { generateQrCodePng } from "@/lib/qrCode";
import { formatValidationCode } from "@/lib/validationCode";

const QR_SIZE = 56;

/**
 * Desenha o QR code + código curto de validação na última página do PDF
 * (atestado ou prescrição), acima do carimbo de assinatura (que o
 * `mockProvider` desenha por cima depois, na faixa reservada mais embaixo —
 * ver `BOTTOM_LIMIT` em `certificatePdf.ts`/`prescriptionPdf.ts`). Best-effort:
 * uma falha ao gerar o QR nunca deve impedir o documento de ser emitido.
 */
export async function drawValidationFooter(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  margin: number,
  validationUrl: string,
  validationCode: string
): Promise<void> {
  try {
    const qrPngBytes = await generateQrCodePng(validationUrl);
    const qrImage = await doc.embedPng(qrPngBytes);
    const qrY = 95;
    page.drawImage(qrImage, { x: margin, y: qrY, width: QR_SIZE, height: QR_SIZE });

    const textX = margin + QR_SIZE + 12;
    let textY = qrY + QR_SIZE - 10;
    page.drawText("Verifique a autenticidade deste documento", {
      x: textX,
      y: textY,
      size: 9,
      font: bold,
      color: rgb(0.2, 0.2, 0.2),
    });
    textY -= 13;
    page.drawText(validationUrl.replace(/^https?:\/\//, ""), {
      x: textX,
      y: textY,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    textY -= 15;
    page.drawText(`Código: ${formatValidationCode(validationCode)}`, {
      x: textX,
      y: textY,
      size: 10.5,
      font: bold,
      color: rgb(0.2, 0.2, 0.2),
    });

    const isMock = process.env.SIGNATURE_PROVIDER === "mock";
    if (isMock) {
      const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
      textY -= 14;
      page.drawText(
        "⚠️ Assinatura digital simulada — sem validade jurídica, aguardando a configuração do certificado digital.",
        { x: textX, y: textY, size: 7.5, font: italic, color: rgb(0.8, 0.3, 0.3) }
      );
    }
  } catch (err) {
    console.error("Falha ao desenhar o QR code de validação no PDF:", err);
  }
}
