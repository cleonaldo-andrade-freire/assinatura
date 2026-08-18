import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addSignaturePlaceholder } from "@/lib/psc/pdfSignUtils";
import type { SignatureProvider, SignRequest, RequestSignatureResult, CheckSignatureResult } from "./types";
import signpdf from "@signpdf/signpdf";

export class LocalAgentProvider implements SignatureProvider {
  readonly name = "local_agent";

  async requestSignature(request: SignRequest): Promise<RequestSignatureResult> {
    if (!request.signerCertificatePem) {
      throw new Error("O fluxo local_agent exige o envio da cadeia de certificados (signerCertificatePem).");
    }

    const signingTime = new Date();

    // Desenha o carimbo visual de assinatura no rodapé — sem isso o
    // placeholder do @signpdf/placeholder-plain fica com Rect [0 0 0 0]
    // (campo de assinatura sem aparência) e a assinatura nunca aparece
    // visualmente no PDF, mesmo estando criptograficamente presente.
    const doc = await PDFDocument.load(request.pdfBytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const page = pages[pages.length - 1];
    const { width } = page.getSize();

    const margin = 48;
    const boxHeight = 58;
    const boxY = 24;

    page.drawRectangle({
      x: margin,
      y: boxY,
      width: width - margin * 2,
      height: boxHeight,
      borderColor: rgb(0.15, 0.35, 0.55),
      borderWidth: 1.2,
      color: rgb(0.93, 0.96, 0.99),
    });

    const lines = [
      "ASSINADO DIGITALMENTE — CERTIFICADO LOCAL (ICP-BRASIL)",
      `${request.signerName} — ${request.signerDocument}`,
      `Data/Hora: ${signingTime.toLocaleString("pt-BR")}`,
    ];
    let textY = boxY + boxHeight - 16;
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: margin + 10,
        y: textY,
        size: i === 0 ? 9 : 8,
        font,
        color: rgb(0.1, 0.22, 0.4),
      });
      textY -= 14;
    });

    // useObjectStreams:false — o @signpdf/placeholder-plain (chamado logo
    // abaixo) só sabe ler PDF com xref table clássica; com object streams
    // (padrão do pdf-lib) ele quebra com "Expected xref at NaN".
    const pdfWithStamp = await doc.save({ useObjectStreams: false });

    // Injeta o placeholder vazio do CMS no PDF (já carimbado) para que ele tenha a tabela /ByteRange
    const pdfWithPlaceholder = await addSignaturePlaceholder(
      Buffer.from(pdfWithStamp),
      16384, // signature length (um pouco maior para cadeia ICP-Brasil completa)
      "Signature1",
      request.signerName || "Signatário",
      request.signerEmail || "email@example.com",
      "Brasil"
    );

    // Calcula o hash para assinatura baseado no PDF já com o placeholder (excluindo os zeros)
    const { hashToSignBase64, authAttrsDerBase64 } = await import("./deferredSigning").then((m) =>
      m.createDeferredSignatureHash(pdfWithPlaceholder, request.signerCertificatePem!, signingTime)
    );

    const signatureSessionId = crypto.randomUUID();
    const supabase = createSupabaseAdminClient();

    // Salva a sessão no banco guardando o PDF COM placeholder e os bytes DER
    // exatos de authenticatedAttributes que foram hasheados aqui — são esses
    // mesmos bytes que precisam ser reutilizados (não recalculados) ao
    // completar a assinatura, ver LocalAgentDeferredSigner.ts.
    const { error: insertError } = await supabase.from("signature_sessions").insert({
      request_id: signatureSessionId,
      document_id: request.documentId,
      clinic_id: request.clinicId,
      pdf_bytes_base64: pdfWithPlaceholder.toString("base64"),
      signer_certificate_pem: request.signerCertificatePem,
      auth_attrs_der_base64: authAttrsDerBase64,
      created_at: signingTime.toISOString(),
    });
    if (insertError) {
      throw new Error(`Falha ao salvar a sessão de assinatura: ${insertError.message}`);
    }

    return {
      status: "external_signing",
      hashToSignBase64,
      signatureSessionId,
    };
  }

  async checkSignature(providerDocumentId: string, documentKey: string | null): Promise<CheckSignatureResult> {
    throw new Error("Não aplicável ao local_agent. Use completeExternalSignature.");
  }

  async completeExternalSignature(signatureSessionId: string, signatureBase64: string): Promise<RequestSignatureResult> {
    const supabase = createSupabaseAdminClient();

    // Busca a sessão
    const { data: session, error: selectError } = await supabase
      .from("signature_sessions")
      .select("*")
      .eq("request_id", signatureSessionId)
      .single();
    if (!session) {
      throw new Error(`Sessão de assinatura não encontrada ou expirada.${selectError ? ` (${selectError.message})` : ""}`);
    }
    if (!session.auth_attrs_der_base64) {
      throw new Error("Sessão de assinatura inválida: bytes de atributos assinados não encontrados.");
    }

    const pdfBuffer = Buffer.from(session.pdf_bytes_base64, "base64");
    const signingTime = new Date(session.created_at);

    // Verifica a assinatura RSA recebida do agente ANTES de embutir no PDF —
    // falha rápido e alto em vez de gerar silenciosamente um PDF com
    // assinatura inválida (documento legal — atestado/prescrição).
    const leafCertPem = session.signer_certificate_pem.split("-----END CERTIFICATE-----")[0].trim() + "\n-----END CERTIFICATE-----\n";
    const authAttrsDerBuffer = Buffer.from(session.auth_attrs_der_base64, "base64");
    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    let signatureVerifiedLocally = false;
    try {
      const publicKey = crypto.createPublicKey(leafCertPem);
      signatureVerifiedLocally = crypto.verify("RSA-SHA256", authAttrsDerBuffer, publicKey, signatureBuffer);
    } catch (err) {
      console.error("[local_agent] Erro ao tentar verificar a assinatura RSA recebida do agente:", err);
    }
    console.log(`[local_agent] Verificação local da assinatura RSA do agente: ${signatureVerifiedLocally ? "VÁLIDA" : "INVÁLIDA"}`);
    if (!signatureVerifiedLocally) {
      throw new Error(
        "A assinatura recebida do agente local não bateu com o certificado (verificação RSA falhou antes de embutir no PDF) — o problema está no agente/hash, não na montagem do PDF."
      );
    }

    // Injeta a assinatura usando o LocalAgentDeferredSigner, reutilizando os
    // bytes exatos de authenticatedAttributes que foram assinados pelo agente
    const { LocalAgentDeferredSigner } = await import("./LocalAgentDeferredSigner");
    const localAgentSigner = new LocalAgentDeferredSigner(
      session.signer_certificate_pem,
      session.auth_attrs_der_base64,
      signatureBase64
    );

    // Assina o PDF
    const signedPdfBuffer = await signpdf.sign(pdfBuffer as any, localAgentSigner);

    // Remove a sessão do banco (opcional, pode ser limpo por job)
    await supabase.from("signature_sessions").delete().eq("request_id", signatureSessionId);

    return {
      status: "assinado",
      signedPdfBytes: new Uint8Array(signedPdfBuffer),
      providerDocumentId: signatureSessionId,
      signedAt: signingTime.toISOString(),
    };
  }
}

export const localAgentProvider = new LocalAgentProvider();
