import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Exclui um débito — bloqueado se já estiver num recibo emitido (não dá pra invalidar um recibo já entregue ao paciente). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: debit } = await supabase
    .from("treatment_debits")
    .select("id, receipt_id")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!debit) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (debit.receipt_id) {
    return NextResponse.json({ error: "already_receipted", message: "Esse débito já está num recibo emitido — não dá pra excluir." }, { status: 409 });
  }

  const { error } = await supabase.from("treatment_debits").delete().eq("id", params.id).eq("clinic_id", clinic.id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
