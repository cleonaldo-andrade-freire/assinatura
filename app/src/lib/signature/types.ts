/**
 * Contrato do provider de assinatura. A Certisign (Portal de Assinaturas) é
 * assíncrona por natureza no modo "Digital Signature" (signatário confirma no
 * app com PIN/biometria) — por isso o fluxo é sempre duas etapas:
 * `requestSignature` dispara o pedido e pode voltar já resolvido (mock) ou
 * pendente (Certisign, aguardando a dentista assinar); `checkSignature`
 * consulta se um pedido pendente já foi concluído. Ver `certisignProvider.ts`
 * e `index.ts`.
 */
export interface SignRequest {
  pdfBytes: Uint8Array;
  documentId: string; // certificates.id / prescriptions.id
  signerName: string; // dentist_name
  signerDocument: string; // ex.: "CRO 12345/SE"
  signerCpf: string; // dentist_cpf, sem máscara — individualIdentificationCode na Certisign
  signerEmail: string; // dentist_email
}

export type RequestSignatureResult =
  | { status: "assinado"; signedPdfBytes: Uint8Array; providerDocumentId: string; signedAt: string }
  | { status: "pendente"; providerDocumentId: string; documentKey: string | null; signUrl: string | null }
  | { status: "falha"; errorMessage: string };

export type CheckSignatureResult =
  | { status: "assinado"; signedPdfBytes: Uint8Array; signedAt: string }
  | { status: "pendente" }
  | { status: "falha"; errorMessage: string };

export interface SignatureProvider {
  readonly name: string;
  requestSignature(request: SignRequest): Promise<RequestSignatureResult>;
  checkSignature(providerDocumentId: string, documentKey: string | null): Promise<CheckSignatureResult>;
}
