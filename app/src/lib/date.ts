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

export function formatBRTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: BR_TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

export function formatBRWeekday(iso: string, style: "short" | "long" = "short"): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE, weekday: style });
}

/** Data de hoje no fuso do Brasil como "YYYY-MM-DD" — pra navegação por dia/semana da agenda. */
export function brDateOnly(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: BR_TIMEZONE });
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contém `dateStr` (0 = domingo, como `getUTCDay`). */
export function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

/**
 * Faixa UTC (`[from, to)`) correspondente ao dia `dateStr` inteiro no fuso do
 * Brasil. Offset fixo -03:00 porque o Brasil extinguiu o horário de verão em
 * 2019 — não precisa de lógica de fuso variável.
 */
export function brDayRangeUtc(dateStr: string): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(`${dateStr}T00:00:00-03:00`).toISOString(),
    toIso: new Date(`${addDaysToDateStr(dateStr, 1)}T00:00:00-03:00`).toISOString(),
  };
}

export function firstOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function firstOfNextMonth(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Todos os dias ("YYYY-MM-DD") que formam a grade de calendário do mês de `dateStr` — de segunda a domingo, incluindo os dias de encaixe do mês anterior/seguinte pra completar a primeira e a última semana. */
export function monthGridDays(dateStr: string): string[] {
  const monthStart = firstOfMonth(dateStr);
  const lastDay = addDaysToDateStr(firstOfNextMonth(dateStr), -1);
  const gridStart = mondayOfWeek(monthStart);
  const gridEnd = addDaysToDateStr(mondayOfWeek(lastDay), 6);

  const days: string[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDaysToDateStr(cursor, 1);
  }
  return days;
}
