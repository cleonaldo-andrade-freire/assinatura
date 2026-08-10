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
  monthly_limit: z.number().int().positive(),
  features: z.array(z.string()).default([]),
  display_order: z.number().int().default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

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

  const { data: plan, error } = await supabase.from("plans").insert(parsed.data).select("*").single();
  if (error) {
    return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ plan }, { status: 201 });
}
