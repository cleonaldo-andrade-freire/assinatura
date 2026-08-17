import { certisignProvider } from "./certisignProvider";
import { pscProvider } from "./pscProvider";
import { mockProvider } from "./mockProvider";
import type { SignatureProvider } from "./types";

export type { CheckSignatureResult, RequestSignatureResult, SignatureProvider, SignRequest } from "./types";

/**
 * Único ponto de troca do provider de assinatura. `SIGNATURE_PROVIDER=certisign`
 * liga o provider real (Portal de Assinaturas), `SIGNATURE_PROVIDER=psc` liga 
 * a Assinatura Direta em Nuvem (VaultID); qualquer outro valor (ou
 * ausente) mantém o mock, útil pra dev local e testes sem depender da
 * dentista aprovar no celular a cada rodada.
 */
export function getSignatureProvider(): SignatureProvider {
  if (process.env.SIGNATURE_PROVIDER === "certisign") return certisignProvider;
  if (process.env.SIGNATURE_PROVIDER === "psc") return pscProvider;
  return mockProvider;
}
