import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safeEqual";
import { certisignDownloadFromUrl } from "@/lib/signature/certisignClient";
import {
  completeCertificateSignatureByProviderDocId,
  rejectCertificateSignatureByProviderDocId,
} from "@/lib/certificates";
import {
  completePrescriptionSignatureByProviderDocId,
  rejectPrescriptionSignatureByProviderDocId,
} from "@/lib/prescriptions";

interface CertisignCallbackPayload {
  documentID?: number | string;
  documentId?: number | string;
  name?: string;
  identifier?: string;
  action?: string;
  message?: string;
  apiDownload?: string;
}

/**
 * Recebe o callback da Certisign (Portal de Assinaturas) quando o fluxo de
 * assinatura de um atestado/prescrição muda de estado. Configurado com
 * trigger `FLOW` no painel do Portal de Assinaturas (só dispara quando a
 * dentista já assinou tudo — caso de signatário único aqui).
 *
 * Autenticação: a Certisign permite configurar headers customizados pro
 * callback — registre um header com o valor de CERTISIGN_WEBHOOK_SECRET (ver
 * README) pra essa checagem funcionar. Sem isso, qualquer um que descubra a
 * URL poderia forjar "documento assinado".
 */
export async function POST(req: NextRequest) {
  if (process.env.CERTISIGN_WEBHOOK_SECRET) {
    const secret = req.headers.get("x-webhook-secret");
    if (!secret || !safeEqual(secret, process.env.CERTISIGN_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const payload = (await req.json().catch(() => null)) as CertisignCallbackPayload | null;
  const providerDocumentId = String(payload?.documentID ?? payload?.documentId ?? "");
  const action = payload?.action;
  if (!payload || !providerDocumentId || !action) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  if (action === "FLOW") {
    if (!payload.apiDownload) {
      return NextResponse.json({ error: "apiDownload ausente" }, { status: 400 });
    }
    const pkg = await certisignDownloadFromUrl(payload.apiDownload);
    const signedPdfBytes = new Uint8Array(pkg.bytes);
    const signedAt = new Date().toISOString();

    const certificate = await completeCertificateSignatureByProviderDocId(providerDocumentId, signedPdfBytes, signedAt);
    if (!certificate) {
      const prescription = await completePrescriptionSignatureByProviderDocId(providerDocumentId, signedPdfBytes, signedAt);
      if (!prescription) {
        // Pode ser um retry tardio de um documento já finalizado por outro caminho — não é erro do cliente.
        return NextResponse.json({ ok: true, found: false });
      }
    }
  } else if (action === "SIGNATURE-NOK") {
    const reason = payload.message?.trim() || "Assinatura rejeitada pela dentista no app Certisign.";
    const certificate = await rejectCertificateSignatureByProviderDocId(providerDocumentId, reason);
    if (!certificate) {
      await rejectPrescriptionSignatureByProviderDocId(providerDocumentId, reason);
    }
  }
  // Outras actions (SIGNATURE-DIGITAL de step intermediário, etc.) não se aplicam — signatário único.

  return NextResponse.json({ ok: true });
}
