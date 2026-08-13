import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendBudgetWhatsApp } from "@/lib/budgetNotifications";
import type { Budget, BudgetItem } from "@/lib/database.types";

/** Dispara o orçamento por WhatsApp com um link de download do PDF — botão
 * "Enviar por WhatsApp" na aba Orçamentos do paciente. */
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

  const { data: itemsData } = await supabase.from("budget_items").select("*").eq("budget_id", budget.id).order("display_order", { ascending: true });

  try {
    await sendBudgetWhatsApp(supabase, clinic, budget as Budget, (itemsData as BudgetItem[]) ?? []);
  } catch (err) {
    console.error("Falha ao enviar orçamento por WhatsApp:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
