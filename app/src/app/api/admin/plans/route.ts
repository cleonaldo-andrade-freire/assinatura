import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequestAuthorized } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  id: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "use apenas letras minúsculas, números e hífen"),
  name: z.string().min(1),
  monthly_price: z.number().positive(),
  features: z.array(z.string()).default([]),
  display_order: z.number().int().default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

// `monthly_limit`/`overage_price` continuam NOT NULL no schema (herança do
// desenho antigo, cobrado por volume de anamnese) mas não são mais usados em
// lugar nenhum do código — o produto não mede/cobra por anamnese excedente
// desde 2026-08. Preenchidos com um valor alto/zero só pra satisfazer a
// constraint, sem pedir esses números no formulário de criar plano.
const LEGACY_UNUSED_LIMIT_FIELDS = { monthly_limit: 999999, overage_price: 0 };

/** Cria um plano novo — vira imediatamente selecionável (se `active`) em nova clínica, troca de plano e na landing. */
export async function POST(req: NextRequest) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("plans").select("id").eq("id", parsed.data.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "id_taken" }, { status: 409 });
  }

  const { data: plan, error } = await supabase
    .from("plans")
    .insert({ ...parsed.data, ...LEGACY_UNUSED_LIMIT_FIELDS })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ plan }, { status: 201 });
}
