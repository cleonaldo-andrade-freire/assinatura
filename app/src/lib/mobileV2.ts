/**
 * Flag de emergência do shell mobile v2 (ver docs/mobile-audit.md e o prompt
 * de reformulação mobile). Com a env var ausente ou diferente de "1", tudo
 * volta exatamente ao comportamento atual — nenhum componente novo é
 * renderizado, nenhuma media query nova entra em jogo.
 *
 * process.env.NEXT_PUBLIC_MOBILE_V2 é inlined pelo Next em build time, então
 * dá pra usar tanto no servidor (RSC/route handlers) quanto no cliente sem
 * round-trip.
 */
export function isMobileV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_MOBILE_V2 === "1";
}
