import { NextRequest, NextResponse } from "next/server";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** "Cancelar recebimento" — volta um débito pago pra aberto. Bloqueado se já foi dividido (pagamento parcial) ou já está num recibo emitido. Staff não pode cancelar, só receber pagamento. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (auth.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { clinic } = auth;

  const supabase = await createSupabaseServerClient();
  const { data: debit } = await supabase.from("treatment_debits").select("*").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!debit) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (debit.status !== "pago") {
    return NextResponse.json({ error: "not_paid", message: "Esse débito não está pago." }, { status: 409 });
  }
  if (debit.has_split) {
    return NextResponse.json(
      { error: "has_split", message: "Esse débito foi dividido por um pagamento parcial — não dá pra cancelar o recebimento dele." },
      { status: 409 }
    );
  }
  if (debit.receipt_id) {
    return NextResponse.json(
      { error: "already_receipted", message: "Esse débito já está num recibo emitido — não dá pra cancelar o recebimento." },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabase
    .from("treatment_debits")
    .update({ status: "aberto", payment_method: null, paid_at: null, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ debit: updated });
}
