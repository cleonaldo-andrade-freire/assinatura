import { redirect } from "next/navigation";

/**
 * "Despesas" virou "Financeiro" (receita, despesa e saldo no mesmo lugar).
 * Esta rota fica de pé só para não quebrar link salvo no navegador da clínica
 * nem atalho antigo — preserva os parâmetros, então um link para um mês
 * específico continua caindo naquele mês.
 */
export default function DespesasRedirect({ searchParams }: { searchParams: Record<string, string | string[]> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  redirect(qs ? `/dashboard/financeiro?${qs}` : "/dashboard/financeiro");
}
