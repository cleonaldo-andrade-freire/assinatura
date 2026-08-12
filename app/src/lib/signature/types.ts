/**
 * Contrato pensado para bater com um provider real de assinatura A3 em nuvem
 * (BirdID/Soluti/Certisign): eles também recebem os bytes de um PDF pronto e
 * devolvem bytes assinados (PAdES) + um id de transação. Trocar a
 * implementação depois (ver `index.ts`) não deve exigir mudar quem chama.
 */
export interface SignRequest {
  pdfBytes: Uint8Array;
  documentId: string; // certificates.id
  signerName: string; // dentist_name
  signerDocument: string; // ex.: "CRO 12345/SE"
}

export type SignResult =
  | { status: "assinado"; signedPdfBytes: Uint8Array; providerDocumentId: string; signedAt: string }
  | { status: "falha"; errorMessage: string };

export interface SignatureProvider {
  readonly name: string;
  sign(request: SignRequest): Promise<SignResult>;
}
