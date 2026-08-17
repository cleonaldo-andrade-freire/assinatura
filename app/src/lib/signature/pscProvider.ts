import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CheckSignatureResult, RequestSignatureResult, SignatureProvider, SignRequest } from "./types";
import { PscClient } from "@/lib/psc/PscClient";
import { PscSigner } from "@/lib/psc/PscSigner";
import { addSignaturePlaceholder } from "@/lib/psc/pdfSignUtils";
import signpdf from "@signpdf/signpdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const pscProvider: SignatureProvider = {
  name: "psc",

  async requestSignature(request: SignRequest): Promise<RequestSignatureResult> {
    try {
      const supabase = createSupabaseAdminClient();
      
      const { data: clinic, error } = await supabase
        .from("clinics")
        .select("psc_access_token, psc_certificate_alias, psc_certificate_pem")
        .eq("id", request.clinicId)
        .single();

      if (error || !clinic) {
        throw new Error(`Clínica não encontrada ou erro ao buscar: ${error?.message}`);
      }

      if (!clinic.psc_access_token || !clinic.psc_certificate_alias || !clinic.psc_certificate_pem) {
        throw new Error("Certificado em nuvem (PSC) não está vinculado a esta clínica.");
      }

      // Desenha o carimbo visual de assinatura no rodapé
      const doc = await PDFDocument.load(request.pdfBytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const page = pages[pages.length - 1];
      const { width } = page.getSize();

      const signedAt = new Date().toISOString();
      const margin = 48;
      const boxHeight = 58;
      const boxY = 24;

      page.drawRectangle({
        x: margin,
        y: boxY,
        width: width - margin * 2,
        height: boxHeight,
        borderColor: rgb(0.2, 0.4, 0.2),
        borderWidth: 1.2,
        color: rgb(0.95, 0.98, 0.95),
      });

      const lines = [
        "ASSINADO DIGITALMENTE — CERTIFICADO EM NUVEM (ICP-BRASIL)",
        `${request.signerName} — ${request.signerDocument}`,
        `Data/Hora: ${new Date(signedAt).toLocaleString("pt-BR")}`,
      ];
      let textY = boxY + boxHeight - 16;
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: margin + 10,
          y: textY,
          size: i === 0 ? 9 : 8,
          font,
          color: rgb(0.1, 0.3, 0.1),
        });
        textY -= 14;
      });

      const pdfWithStamp = await doc.save();

      // Adiciona o Placeholder da Assinatura no PDF gerado
      let pdfBuffer: any = Buffer.from(pdfWithStamp);
      pdfBuffer = addSignaturePlaceholder(
        pdfBuffer, 
        8192, 
        'Signature1',
        request.signerName,
        request.signerEmail || 'email@example.com'
      );

      // Configura o Cliente PSC
      const pscClient = new PscClient({
        baseUrl: process.env.PSC_BASE_URL || "https://homologacao.vaultid.com.br",
        clientId: process.env.PSC_CLIENT_ID || "",
        clientSecret: process.env.PSC_CLIENT_SECRET || "",
      });

      // Instancia o Signer customizado
      const pscSigner = new PscSigner(
        pscClient, 
        clinic.psc_access_token, 
        clinic.psc_certificate_alias, 
        clinic.psc_certificate_pem
      );

      // Assina o PDF
      const signedPdfBuffer = await signpdf.sign(pdfBuffer as any, pscSigner);

      return {
        status: "assinado",
        providerDocumentId: `psc_${request.documentId}_${Date.now()}`,
        signedPdfBytes: new Uint8Array(signedPdfBuffer),
        signedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { 
        status: "falha", 
        errorMessage: err instanceof Error ? err.message : "Erro desconhecido ao pedir assinatura PSC." 
      };
    }
  },

  async checkSignature(providerDocumentId: string, documentKey: string | null): Promise<CheckSignatureResult> {
    // O PSC é síncrono. Se chegou aqui, já está assinado.
    // Isso é útil apenas caso haja alguma reconciliação futura necessária, 
    // mas na arquitetura atual o 'requestSignature' já devolve 'assinado'.
    return { status: "pendente" }; 
  },
};
