import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureTreatmentsForBudget } from "@/lib/treatments";
import type { Budget, BudgetItem } from "@/lib/database.types";

const bodySchema = z.object({
  status: z.enum(["em_aberto", "aprovado"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("budgets")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  // Best-effort — idempotente por existência (ver ensureTreatmentsForBudget),
  // então chamar de novo em cada aprovação não duplica nada.
  if (parsed.data.status === "aprovado") {
    try {
      const { data: itemsData } = await supabase.from("budget_items").select("*").eq("budget_id", data.id);
      await ensureTreatmentsForBudget(supabase, data as Budget, (itemsData as BudgetItem[]) ?? []);
    } catch (err) {
      console.error("Falha ao criar tratamentos ao aprovar orçamento:", err);
    }
  }

  return NextResponse.json({ budget: data });
}

/** Exclui o orçamento (e as linhas dele, via cascade). Tratamentos já
 * gerados a partir dele NÃO são apagados — ficam com budget_id nulo (ver
 * migration 034: `on delete set null`), continuam existindo na ficha do
 * paciente independente do orçamento de origem. */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("budgets").delete().eq("id", params.id).eq("clinic_id", clinic.id);

  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
