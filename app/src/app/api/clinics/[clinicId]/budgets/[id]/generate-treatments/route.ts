import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureTreatmentsForBudget } from "@/lib/treatments";
import type { Budget, BudgetItem } from "@/lib/database.types";

/**
 * Recuperação manual — gera os tratamentos de um orçamento já aprovado que
 * ficou sem eles (ex.: aprovado antes da migration da tabela `treatments`
 * rodar, ou qualquer outra falha pontual). Idempotente: se os tratamentos já
 * existem, não faz nada.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: budget } = await supabase.from("budgets").select("*").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!budget) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (budget.status !== "aprovado") {
    return NextResponse.json({ error: "not_approved", message: "Só orçamentos aprovados geram tratamentos." }, { status: 400 });
  }

  const { data: itemsData } = await supabase.from("budget_items").select("*").eq("budget_id", budget.id);
  try {
    const created = await ensureTreatmentsForBudget(supabase, budget as Budget, (itemsData as BudgetItem[]) ?? []);
    return NextResponse.json({ created });
  } catch (err) {
    console.error("Falha ao gerar tratamentos manualmente:", err);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}
