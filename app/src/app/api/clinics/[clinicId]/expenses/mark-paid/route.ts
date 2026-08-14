import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    expense_ids: z.array(z.string().uuid()).min(1),
    payment_method: z.string().min(1),
    /** Data local ("YYYY-MM-DD") escolhida no modal — sem hora, ao contrário do recebimento de débito, porque aqui o usuário pode estar registrando um pagamento feito em outro dia. */
    paid_at: z.string().min(1),
    /** Corrige o valor lançado pro valor realmente pago — só com uma despesa selecionada (ver mensagem no refine abaixo). Comum em despesa variável recorrente, cujo valor no molde é só uma estimativa. */
    amount: z.number().positive().nullable().optional(),
  })
  .refine((v) => !v.amount || v.expense_ids.length === 1, {
    message: "Corrigir o valor só é permitido com uma despesa selecionada por vez.",
    path: ["amount"],
  });

/** Marca uma ou mais despesas em aberto como pagas — sem pagamento parcial (ver RecurringExpensesPanel/schema). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { expense_ids, payment_method, paid_at, amount } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("expenses")
    .select("id, status")
    .eq("clinic_id", clinic.id)
    .in("id", expense_ids);
  if (fetchError) return NextResponse.json({ error: "query_failed", message: fetchError.message }, { status: 500 });
  if (!existing || existing.length !== expense_ids.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.some((e) => e.status !== "pendente")) {
    return NextResponse.json({ error: "already_paid", message: "Uma ou mais despesas selecionadas já não estão pendentes." }, { status: 409 });
  }

  const paidAtIso = new Date(`${paid_at}T12:00:00-03:00`).toISOString();
  const { data: updated, error } = await supabase
    .from("expenses")
    .update({
      status: "pago",
      payment_method,
      paid_at: paidAtIso,
      updated_at: new Date().toISOString(),
      ...(amount ? { amount } : {}),
    })
    .in("id", expense_ids)
    .select("*");
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ expenses: updated });
}
