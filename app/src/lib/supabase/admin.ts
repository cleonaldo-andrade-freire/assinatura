import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service role key — ignora RLS e tem acesso de admin
 * (criar usuários no Auth, ler/escrever no Storage, escrever nas tabelas em nome
 * do Typebot/Asaas/paciente, que nunca têm uma sessão de usuário logado).
 * Só usar em código que roda no servidor, nunca expor essa chave ao navegador.
 *
 * Não passamos o generic `Database` aqui de propósito: a versão do postgrest-js
 * embutida no supabase-js faz parsing do texto do `.select(...)` em tempo de
 * compilação, e um `Database` escrito à mão sem os metadados exatos que o
 * `supabase gen types` produziria acaba resolvendo silenciosamente pra `never`.
 * A segurança de tipos das linhas retornadas vem das interfaces em
 * `database.types.ts`, usadas como anotação explícita em cada rota.
 */
export function createSupabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
