import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueBudgetPdf } from "@/lib/budgetNotifications";
import { createTreatmentsFromBudget } from "@/lib/treatments";
import type { Budget, BudgetItem } from "@/lib/database.types";

const itemSchema = z.object({
  price_table_item_id: z.string().uuid().nullable().optional(),
  price_table_name: z.string().nullable().optional(),
  treatment_name: z.string().trim().min(1),
  tooth_region: z.string().trim().nullable().optional(),
  price: z.number().nonnegative(),
  dentist_name: z.string().trim().min(1),
  selected: z.boolean().optional(),
});

const bodySchema = z.object({
  description: z.string().trim().min(1),
  responsible_name: z.string().trim().min(1),
  budget_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["em_aberto", "aprovado"]).optional(),
  discount_type: z.enum(["fixed", "percent"]).optional(),
  discount_value: z.number().nonnegative().optional(),
  installments: z.number().int().min(1).optional(),
  payment_method: z.string().trim().nullable().optional(),
  down_payment_value: z.number().nonnegative().nullable().optional(),
  down_payment_method: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  items: z.array(itemSchema).min(1),
});

/** Cria um orçamento com todas as linhas de tratamento de uma vez — o
 * modal "Novo orçamento" monta tudo em memória (paciente já é conhecido,
 * é a ficha de onde o modal foi aberto) e só grava quando "Salvar" ou
 * "Aprovar" é clicado, pra não deixar orçamento pela metade no banco se a
 * recepção fechar o modal no meio do preenchimento. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, phone")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "patient_not_found" }, { status: 404 });
  }
  if (!patient.phone) {
    return NextResponse.json(
      { error: "missing_phone", message: "Cadastre o WhatsApp do paciente antes de criar um orçamento." },
      { status: 400 }
    );
  }

  const { data: budget, error: budgetError } = await supabase
    .from("budgets")
    .insert({
      clinic_id: clinic.id,
      patient_id: patient.id,
      patient_name: patient.name,
      patient_phone: patient.phone,
      description: input.description,
      responsible_name: input.responsible_name,
      budget_date: input.budget_date,
      status: input.status ?? "em_aberto",
      discount_type: input.discount_type ?? "fixed",
      discount_value: input.discount_value ?? 0,
      installments: input.installments ?? 1,
      payment_method: input.payment_method || null,
      down_payment_value: input.down_payment_value ?? null,
      down_payment_method: input.down_payment_method || null,
      notes: input.notes || null,
    })
    .select("*")
    .single();

  if (budgetError || !budget) {
    return NextResponse.json({ error: "insert_failed", message: budgetError?.message }, { status: 500 });
  }

  const { data: insertedItems, error: itemsError } = await supabase
    .from("budget_items")
    .insert(
      input.items.map((item, index) => ({
        clinic_id: clinic.id,
        budget_id: budget.id,
        price_table_item_id: item.price_table_item_id || null,
        price_table_name: item.price_table_name || null,
        treatment_name: item.treatment_name,
        tooth_region: item.tooth_region || null,
        price: item.price,
        dentist_name: item.dentist_name,
        selected: item.selected ?? true,
        display_order: index,
      }))
    )
    .select("*");

  if (itemsError) {
    // Orçamento já foi criado mas as linhas falharam — melhor deixar o
    // orçamento vazio pra recepção ver e refazer do que fingir sucesso.
    return NextResponse.json({ error: "items_insert_failed", message: itemsError.message, budgetId: budget.id }, { status: 500 });
  }

  // Best-effort — o PDF também é gerado sob demanda (ver sendBudgetWhatsApp)
  // se essa geração eager falhar, então uma falha aqui não pode impedir a
  // criação do orçamento em si.
  let finalBudget = budget as Budget;
  try {
    finalBudget = await issueBudgetPdf(supabase, clinic, budget as Budget, (insertedItems as BudgetItem[]) ?? []);
  } catch (err) {
    console.error("Falha ao gerar PDF do orçamento na criação:", err);
  }

  // Orçamento já nasce aprovado (botão "Aprovar" do modal, em vez de
  // "Salvar") — gera os tratamentos do paciente na hora, mesma lógica de
  // quando um orçamento em aberto é aprovado depois.
  if (finalBudget.status === "aprovado") {
    try {
      await createTreatmentsFromBudget(supabase, finalBudget, (insertedItems as BudgetItem[]) ?? []);
    } catch (err) {
      console.error("Falha ao criar tratamentos ao criar orçamento já aprovado:", err);
    }
  }

  return NextResponse.json({ budget: finalBudget }, { status: 201 });
}
