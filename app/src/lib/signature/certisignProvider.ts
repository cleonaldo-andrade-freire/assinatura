import {
  certisignCreateDocument,
  certisignDownloadPackage,
  certisignGetFlowActions,
  certisignUploadDocument,
} from "./certisignClient";
import type { CheckSignatureResult, RequestSignatureResult, SignatureProvider, SignRequest } from "./types";

/**
 * Provider real (Certisign — Portal de Assinaturas), modo "Digital
 * Signature": a dentista assina no certificado A3 em nuvem dela mesma, via o
 * `signUrl` retornado por document/create, confirmando no app com PIN ou
 * biometria. Por isso é assíncrono — `requestSignature` só dispara o pedido;
 * quem detecta a conclusão é `checkSignature`, chamado pelo poller (ver
 * `app/api/cron/check-signatures`).
 *
 * O caminho autoritativo de conclusão é o webhook (`/api/webhooks/certisign`)
 * — o callback de `FLOW` já entrega uma `apiDownload` pronta. `checkSignature`
 * aqui é só um fallback de reconciliação usado pelo cron
 * (`/api/cron/check-signatures`) pra casos em que o webhook falhe ou ainda
 * não tenha chegado — por isso, se o download do pacote falhar, ele volta
 * "pendente" em vez de "falha": a assinatura pode muito bem ter sido
 * concluída e só o download aqui que não funcionou (`flowActions`/`package`
 * nem aparecem no catálogo público da API — não confirmados ainda).
 *
 * `documentKey` = `created.chave` (schema oficial: "chave: Chave da versão do
 * documento (uso em Package e demais APIs)") — não é o `id` do documento,
 * são valores diferentes mesmo.
 *
 * `signatureStandard` é opcional em `document/create` (schema real não tem
 * campo `signatureFormatId` — esse nome não existe na API, por isso a env var
 * antiga nunca fazia efeito). Sem `CERTISIGN_SIGNATURE_STANDARD` configurada,
 * usa o padrão da conta. Setar só quando precisar forçar PAdES explicitamente
 * (evita `document/package` devolver zip CAdES) — o valor numérico do enum
 * `PadraoAssinatura` ainda precisa ser confirmado com o suporte Certisign.
 */
function optionalSignatureStandard(): number | undefined {
  const raw = process.env.CERTISIGN_SIGNATURE_STANDARD;
  return raw ? Number(raw) : undefined;
}

export const certisignProvider: SignatureProvider = {
  name: "certisign",

  async requestSignature(request: SignRequest): Promise<RequestSignatureResult> {
    try {
      const fileName = `documento-${request.documentId}.pdf`;
      const uploadId = await certisignUploadDocument(fileName, request.pdfBytes);

      const cpfDigits = request.signerCpf.replace(/\D/g, "");
      const signer = {
        step: 1,
        title: "Assinatura Digital",
        name: request.signerName,
        email: request.signerEmail,
        individualIdentificationCode: cpfDigits,
      };

      const signatureStandard = optionalSignatureStandard();
      const created = await certisignCreateDocument({
        document: { name: fileName, upload: { id: uploadId, name: fileName } },
        sender: { name: request.signerName, email: request.signerEmail, individualIdentificationCode: cpfDigits },
        typeId: 1,
        ...(signatureStandard !== undefined ? { signatureStandard } : {}),
        callback: true,
        signers: [signer],
        tags: [request.documentId],
      });

      return {
        status: "pendente",
        providerDocumentId: String(created.id),
        documentKey: created.chave,
        signUrl: created.signUrl ?? null,
      };
    } catch (err) {
      return { status: "falha", errorMessage: err instanceof Error ? err.message : "Erro desconhecido ao pedir assinatura." };
    }
  },

  async checkSignature(providerDocumentId: string, documentKey: string | null): Promise<CheckSignatureResult> {
    try {
      const flow = await certisignGetFlowActions(providerDocumentId);
      const allSigned = flow.steps.every((step) => step.attendees.every((a) => a.actionTaken));
      if (!allSigned) return { status: "pendente" };

      const key = documentKey ?? providerDocumentId;
      try {
        const pkg = await certisignDownloadPackage(key);
        const signedPdfBytes = new Uint8Array(pkg.bytes);
        const signedAt =
          flow.steps.flatMap((s) => s.attendees).find((a) => a.date)?.date ?? new Date().toISOString();
        return { status: "assinado", signedPdfBytes, signedAt };
      } catch {
        // Download com a key "chutada" falhou — assinatura pode estar ok, só
        // não conseguimos baixar por aqui. Deixa pendente pro webhook resolver.
        return { status: "pendente" };
      }
    } catch (err) {
      return { status: "falha", errorMessage: err instanceof Error ? err.message : "Erro desconhecido ao checar assinatura." };
    }
  },
};
