import { certisignProvider } from "./certisignProvider";
import { mockProvider } from "./mockProvider";
import type { SignatureProvider } from "./types";

export type { CheckSignatureResult, RequestSignatureResult, SignatureProvider, SignRequest } from "./types";

/**
 * Único ponto de troca do provider de assinatura. `SIGNATURE_PROVIDER=certisign`
 * liga o provider real (Portal de Assinaturas); qualquer outro valor (ou
 * ausente) mantém o mock, útil pra dev local e testes sem depender da
 * dentista aprovar no celular a cada rodada.
 */
export function getSignatureProvider(): SignatureProvider {
  return process.env.SIGNATURE_PROVIDER === "certisign" ? certisignProvider : mockProvider;
}
