import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/** Atualiza o nome de exibição do próprio usuário logado (owner ou staff) — mostrado na sidebar. */
export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from("profiles").update({ name: parsed.data.name }).eq("id", user.id);
  if (error) {
    console.error("Falha ao salvar nome do perfil:", error);
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
