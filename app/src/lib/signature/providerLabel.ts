/**
 * Rótulo amigável do provider que assinou um documento — usado nos banners
 * de "Assinado ✅" / "Simulado ⚠️" (dashboard e páginas públicas de
 * atestado/prescrição). `certisign` era o único provider real quando esses
 * banners foram escritos; `psc` e `local_agent` vieram depois e passavam
 * despercebidos pelo `=== "certisign"`, caindo sempre no aviso de simulação
 * mesmo com assinatura real.
 */
export function isRealSignatureProvider(provider: string | null | undefined): boolean {
  return !!provider && provider !== "mock";
}

export function signatureProviderLabel(provider: string | null | undefined): string {
  switch (provider) {
    case "certisign":
      return "certificado ICP-Brasil A3 em nuvem (Certisign)";
    case "psc":
      return "certificado ICP-Brasil em nuvem (VaultID)";
    case "local_agent":
      return "certificado ICP-Brasil instalado no computador do dentista";
    default:
      return "certificado digital";
  }
}
