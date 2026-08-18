import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Exclui um atestado — diferente de "Revogar" (que mantém o registro e o PDF, só marca inválido). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("pdf_storage_key")
    .eq("id", params.id)
    .eq("clinic_id", params.clinicId)
    .maybeSingle();
  if (!certificate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase.from("certificates").delete().eq("id", params.id).eq("clinic_id", params.clinicId);
  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }

  // Best-effort — o registro já foi excluído, um PDF órfão no Storage não é
  // motivo pra reportar falha pro usuário.
  if (certificate.pdf_storage_key) {
    try {
      await supabase.storage.from("certificate-pdfs").remove([certificate.pdf_storage_key]);
    } catch (err) {
      console.error("Falha ao remover PDF do atestado excluído:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
