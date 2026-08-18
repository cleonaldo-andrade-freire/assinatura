import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Exclui uma prescrição — diferente de "Revogar" (que mantém o registro e o PDF, só marca inválido). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("pdf_storage_key")
    .eq("id", params.id)
    .eq("clinic_id", params.clinicId)
    .maybeSingle();
  if (!prescription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase.from("prescriptions").delete().eq("id", params.id).eq("clinic_id", params.clinicId);
  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }

  // Best-effort — o registro já foi excluído, um PDF órfão no Storage não é
  // motivo pra reportar falha pro usuário.
  if (prescription.pdf_storage_key) {
    try {
      await supabase.storage.from("prescription-pdfs").remove([prescription.pdf_storage_key]);
    } catch (err) {
      console.error("Falha ao remover PDF da prescrição excluída:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
