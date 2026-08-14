import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TreatmentDebit } from "@/lib/database.types";

const bodySchema = z.object({
  debit_ids: z.array(z.string().uuid()).min(1),
  payment_method: z.string().min(1),
  received_amount: z.number().positive(),
});

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Dá baixa em um ou mais débitos em aberto. Se o valor recebido cobre o
 * total, todos viram `pago`. Se for menor (só permitido com UM débito
 * selecionado — dividir um pagamento parcial entre vários não tem regra de
 * rateio óbvia), o débito original é marcado `pago` com o valor realmente
 * recebido e um novo débito nasce com o saldo, em aberto.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { debit_ids, payment_method, received_amount } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: debitsData, error: fetchError } = await supabase
    .from("treatment_debits")
    .select("*")
    .eq("clinic_id", clinic.id)
    .in("id", debit_ids);
  if (fetchError) return NextResponse.json({ error: "query_failed", message: fetchError.message }, { status: 500 });

  const debits = (debitsData as TreatmentDebit[]) ?? [];
  if (debits.length !== debit_ids.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (debits.some((d) => d.status !== "aberto")) {
    return NextResponse.json({ error: "already_paid", message: "Um ou mais débitos selecionados já não estão em aberto." }, { status: 409 });
  }

  const totalDueCents = debits.reduce((sum, d) => sum + toCents(d.amount), 0);
  const receivedCents = toCents(received_amount);

  if (debits.length > 1 && receivedCents < totalDueCents) {
    return NextResponse.json(
      { error: "partial_multi_not_allowed", message: "Pagamento parcial só é permitido com um débito selecionado por vez." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  if (receivedCents >= totalDueCents) {
    const { data: updated, error } = await supabase
      .from("treatment_debits")
      .update({ status: "pago", payment_method, paid_at: now, updated_at: now })
      .in("id", debit_ids)
      .select("*");
    if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
    return NextResponse.json({ debits: updated, split: null });
  }

  // Parcial — só chega aqui com exatamente 1 débito (validado acima).
  const original = debits[0];
  const remainder = (toCents(original.amount) - receivedCents) / 100;

  const { data: paid, error: payError } = await supabase
    .from("treatment_debits")
    .update({ status: "pago", payment_method, paid_at: now, amount: received_amount, has_split: true, updated_at: now })
    .eq("id", original.id)
    .select("*")
    .single();
  if (payError) return NextResponse.json({ error: "update_failed", message: payError.message }, { status: 500 });

  const { data: split, error: splitError } = await supabase
    .from("treatment_debits")
    .insert({
      clinic_id: original.clinic_id,
      patient_id: original.patient_id,
      treatment_id: original.treatment_id,
      description: `${original.description} (1/2)`,
      amount: remainder,
    })
    .select("*")
    .single();
  if (splitError) {
    // O pagamento parcial já foi registrado — só o remanescente falhou.
    console.error("Falha ao criar débito remanescente do pagamento parcial:", splitError);
    return NextResponse.json({ debits: [paid], split: null, warning: "split_failed" });
  }

  return NextResponse.json({ debits: [paid], split });
}
