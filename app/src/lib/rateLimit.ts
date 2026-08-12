import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Limitador simples baseado em Postgres (sem infra nova) — usado no portal
 * público de validação, pra evitar varredura/enumeração de código (pedido
 * explícito do escopo original). Retorna `true` se a tentativa pode seguir,
 * `false` se o limite foi atingido. Faz limpeza best-effort das tentativas
 * antigas a cada chamada, pra `rate_limit_attempts` não crescer sem limite —
 * sem precisar de um cron job separado.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  { windowSeconds, maxAttempts }: { windowSeconds: number; maxAttempts: number }
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  await supabase.from("rate_limit_attempts").delete().lt("created_at", since);

  const { count } = await supabase
    .from("rate_limit_attempts")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("created_at", since);

  if ((count ?? 0) >= maxAttempts) return false;

  await supabase.from("rate_limit_attempts").insert({ key });
  return true;
}
