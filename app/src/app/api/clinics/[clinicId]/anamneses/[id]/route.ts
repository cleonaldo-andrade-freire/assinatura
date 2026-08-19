import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Exclui uma anamnese e sua assinatura (se houver) — mesmos moldes de atestado/prescrição. */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", params.clinicId)
    .maybeSingle();
  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: signature } = await supabase
    .from("signatures")
    .select("pdf_storage_key")
    .eq("anamnesis_id", params.id)
    .maybeSingle();

  // `signatures.anamnesis_id` tem `on delete cascade` — excluir a anamnese já
  // leva a assinatura junto, não precisa de um delete separado.
  const { error } = await supabase.from("anamneses").delete().eq("id", params.id).eq("clinic_id", params.clinicId);
  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }

  // Best-effort — o registro já foi excluído, um PDF órfão no Storage não é
  // motivo pra reportar falha pro usuário.
  if (signature?.pdf_storage_key) {
    try {
      await supabase.storage.from("signed-pdfs").remove([signature.pdf_storage_key]);
    } catch (err) {
      console.error("Falha ao remover PDF da anamnese excluída:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
