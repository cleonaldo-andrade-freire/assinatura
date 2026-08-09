import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase pra uso em Client Components. Sem generic `Database` — ver lib/supabase/admin.ts. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
