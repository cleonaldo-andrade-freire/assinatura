/**
 * A Vercel roda as funções serverless em UTC, não no fuso do Brasil — sem
 * especificar `timeZone`, `toLocaleString`/`toLocaleDateString` num Server
 * Component mostram a hora 3h adiantada (Brasília é UTC-3). Só é necessário
 * nesses componentes de servidor: no navegador do paciente (`AssinaturaClient`,
 * "use client"), o `Date` já usa o fuso local do próprio aparelho.
 */
const BR_TIMEZONE = "America/Sao_Paulo";

export function formatBRDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE });
}

export function formatBRDateTime(iso: string, timeStyle: "short" | "medium" = "short"): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: BR_TIMEZONE, dateStyle: "short", timeStyle });
}
