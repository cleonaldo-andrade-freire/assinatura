import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTreatmentsFromBudget } from "@/lib/treatments";
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

  // Só cria os tratamentos na transição PRA aprovado (não em toda chamada
  // com status já aprovado) — sem isso, reabrir/aprovar de novo duplicaria
  // os tratamentos do mesmo orçamento.
  const { data: current } = await supabase.from("budgets").select("status").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  const isNewApproval = parsed.data.status === "aprovado" && current?.status !== "aprovado";

  const { data, error } = await supabase
    .from("budgets")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  if (isNewApproval) {
    try {
      const { data: itemsData } = await supabase.from("budget_items").select("*").eq("budget_id", data.id);
      await createTreatmentsFromBudget(supabase, data as Budget, (itemsData as BudgetItem[]) ?? []);
    } catch (err) {
      console.error("Falha ao criar tratamentos ao aprovar orçamento:", err);
    }
  }

  return NextResponse.json({ budget: data });
}
