import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteEvolutionImages } from "@/lib/treatmentEvolutionStorage";

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("image_keys")
    .eq("id", params.evolutionId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!evolution) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase.from("treatment_evolutions").delete().eq("id", params.evolutionId).eq("clinic_id", clinic.id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });

  await deleteEvolutionImages(evolution.image_keys ?? []);
  return NextResponse.json({ ok: true });
}
