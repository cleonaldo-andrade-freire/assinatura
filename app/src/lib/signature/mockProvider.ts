import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CheckSignatureResult, RequestSignatureResult, SignatureProvider, SignRequest } from "./types";

/**
 * Provider de dev/testes: resolve na hora (sem o vaivém real de aprovação no
 * app), carimbando o PDF com um aviso bem visível de que a assinatura é
 * simulada, sem validade jurídica. Usado quando `SIGNATURE_PROVIDER` não é
 * `certisign` — ver `index.ts`.
 *
 * `SIGNATURE_MOCK_FORCE_FAIL=1` força o branch de falha, só para exercitar a
 * UI de erro manualmente.
 */
export const mockProvider: SignatureProvider = {
  name: "mock",

  async requestSignature(request: SignRequest): Promise<RequestSignatureResult> {
    if (process.env.SIGNATURE_MOCK_FORCE_FAIL === "1") {
      return { status: "falha", errorMessage: "Falha simulada (SIGNATURE_MOCK_FORCE_FAIL=1)." };
    }

    try {
      const doc = await PDFDocument.load(request.pdfBytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const page = pages[pages.length - 1];
      const { width } = page.getSize();

      const providerDocumentId = crypto.randomUUID();
      const signedAt = new Date().toISOString();
      const margin = 48;
      const boxHeight = 58;
      const boxY = 24;

      page.drawRectangle({
        x: margin,
        y: boxY,
        width: width - margin * 2,
        height: boxHeight,
        borderColor: rgb(0.75, 0.35, 0.1),
        borderWidth: 1.2,
        color: rgb(0.99, 0.94, 0.87),
      });

      const lines = [
        "ASSINATURA DIGITAL SIMULADA — SEM VALIDADE JURÍDICA, AGUARDANDO CERTIFICADO A3",
        `${request.signerName} — ${request.signerDocument}`,
        `ID simulado: ${providerDocumentId}  •  ${new Date(signedAt).toLocaleString("pt-BR")}`,
      ];
      let textY = boxY + boxHeight - 16;
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: margin + 10,
          y: textY,
          size: i === 0 ? 9 : 8,
          font,
          color: rgb(0.55, 0.24, 0.05),
        });
        textY -= 14;
      });

      const signedPdfBytes = await doc.save();
      return { status: "assinado", signedPdfBytes, providerDocumentId, signedAt };
    } catch (err) {
      return { status: "falha", errorMessage: err instanceof Error ? err.message : "Erro desconhecido ao assinar." };
    }
  },

  async checkSignature(): Promise<CheckSignatureResult> {
    return { status: "falha", errorMessage: "mockProvider sempre resolve em requestSignature; checkSignature não deveria ser chamado." };
  },
};
