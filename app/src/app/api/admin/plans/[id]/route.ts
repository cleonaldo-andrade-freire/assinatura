import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequestAuthorized } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  monthly_price: z.number().positive().optional(),
  monthly_limit: z.number().int().positive().optional(),
  overage_price: z.number().positive().optional(),
  features: z.array(z.string()).optional(),
  display_order: z.number().int().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ plan });
}

/** Só apaga de fato se nenhuma clínica usa esse plano (a FK barra) — senão sugere desativar. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("plans").delete().eq("id", params.id);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "plan_in_use", message: "Tem clínica usando esse plano — desative em vez de excluir." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
