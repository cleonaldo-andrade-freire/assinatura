import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Cliente Supabase pra uso em Server Components, Route Handlers e Server Actions,
 * carregando a sessão do usuário logado (cookies). As queries feitas com esse
 * cliente respeitam Row Level Security — é o que protege as leituras do painel.
 * Sem o generic `Database` — ver o comentário em `lib/supabase/admin.ts`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chamado a partir de um Server Component (sem permissão de escrever cookie) —
            // o middleware.ts já garante que a sessão é atualizada, então é seguro ignorar.
          }
        },
      },
    }
  );
}
