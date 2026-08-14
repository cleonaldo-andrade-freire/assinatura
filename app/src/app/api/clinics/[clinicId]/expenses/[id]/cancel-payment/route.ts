import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Volta uma despesa paga pra pendente. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense } = await supabase.from("expenses").select("id, status").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!expense) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (expense.status !== "pago") {
    return NextResponse.json({ error: "not_paid", message: "Essa despesa não está paga." }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ status: "pendente", payment_method: null, paid_at: null, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ expense: updated });
}
