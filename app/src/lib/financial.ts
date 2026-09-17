import { addMonthsToDateStr } from "@/lib/date";

/** Linha crua da view `financial_monthly` (migration 069). O Postgres devolve
 * `numeric` como string via PostgREST — daí os campos não serem `number`. */
export interface MonthlyRow {
  month: string; // "YYYY-MM-DD" (primeiro dia do mês)
  revenue_launched: string | number;
  expense_due: string | number;
}

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  revenue: number;
  expense: number;
}

function toNumber(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Série contínua de `months` meses terminando em `endMonth` ("YYYY-MM").
 *
 * A view só tem linha para mês com movimento. Um mês vazio precisa aparecer
 * como zero e não ser pulado: no gráfico, mês ausente colaria o mês anterior
 * no seguinte e esconderia exatamente o buraco que interessa ver.
 */
export function buildMonthlySeries(rows: MonthlyRow[], endMonth: string, months: number): MonthlyPoint[] {
  const porMes = new Map<string, MonthlyRow>();
  for (const r of rows) porMes.set(r.month.slice(0, 7), r);

  const serie: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const mes = addMonthsToDateStr(`${endMonth}-01`, -i).slice(0, 7);
    const row = porMes.get(mes);
    serie.push({
      month: mes,
      revenue: toNumber(row?.revenue_launched),
      expense: toNumber(row?.expense_due),
    });
  }
  return serie;
}

/**
 * Variação percentual contra o mês anterior, ou `null` quando não existe
 * variação definida — mês anterior zerado não é "crescimento infinito", é
 * ausência de base de comparação, e a tela precisa dizer isso em vez de
 * mostrar um número inventado.
 */
export function monthlyDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

/** Despesas do mês somadas por categoria, da maior pra menor. Despesa sem
 * categoria entra como "Sem categoria" — somem do gráfico seria pior que
 * aparecer sem rótulo bonito. */
export function groupByCategory(expenses: { category: string | null; amount: string | number }[]): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const nome = e.category?.trim() || "Sem categoria";
    map.set(nome, (map.get(nome) ?? 0) + toNumber(e.amount));
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Teto da escala do gráfico. Nunca devolve 0: é divisor do cálculo de altura
 * das barras, e zero produziria `NaN` numa clínica sem lançamento no período. */
export function chartMax(values: number[]): number {
  const max = Math.max(0, ...values.filter(Number.isFinite));
  return max > 0 ? max : 1;
}

/**
 * Teto do eixo em passo redondo: um máximo de 1.234 vira 1.500, não 1.234.
 * Eixo terminando num número quebrado faz o leitor calcular em vez de ler.
 */
export function niceTop(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
