import { mockProvider } from "./mockProvider";
import type { SignatureProvider } from "./types";

export type { SignatureProvider, SignRequest, SignResult } from "./types";

/**
 * Único ponto de troca do provider de assinatura. Hoje só existe o mock —
 * quando o certificado A3 em nuvem for contratado, um provider real
 * (BirdID/Soluti/Certisign) entra aqui por trás de `SIGNATURE_PROVIDER`, sem
 * mudar `certificates.ts` nem os endpoints que chamam esta função.
 */
export function getSignatureProvider(): SignatureProvider {
  return mockProvider;
}
