import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_EVOLUTION_IMAGES, deleteEvolutionImages, saveEvolutionImage } from "@/lib/treatmentEvolutionStorage";

/** Edita texto/data e ajusta as imagens (mantém algumas, remove outras, adiciona novas) — multipart/form-data. */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("*")
    .eq("id", params.evolutionId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!evolution) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const evolutionDate = String(form.get("evolution_date") ?? "");
  const text = String(form.get("text") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evolutionDate) || !text) {
    return NextResponse.json({ error: "invalid_body", message: "Preencha data e texto da evolução." }, { status: 400 });
  }

  let keepKeys: string[] = [];
  try {
    keepKeys = JSON.parse(String(form.get("keep_image_keys") ?? "[]"));
  } catch {
    keepKeys = [];
  }
  const keepSet = new Set(keepKeys);
  const existingKeys: string[] = evolution.image_keys ?? [];
  const kept = existingKeys.filter((k) => keepSet.has(k));
  const toRemove = existingKeys.filter((k) => !keepSet.has(k));

  const newImages = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (kept.length + newImages.length > MAX_EVOLUTION_IMAGES) {
    return NextResponse.json({ error: "too_many_images", message: `Máximo de ${MAX_EVOLUTION_IMAGES} imagens por evolução.` }, { status: 400 });
  }

  let newKeys: string[] = [];
  try {
    newKeys = await Promise.all(newImages.map((file, i) => saveEvolutionImage(clinic.id, evolution.id, kept.length + i, file)));
  } catch (err) {
    return NextResponse.json({ error: "image_upload_failed", message: err instanceof Error ? err.message : undefined }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("treatment_evolutions")
    .update({ evolution_date: evolutionDate, text, image_keys: [...kept, ...newKeys] })
    .eq("id", evolution.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  if (toRemove.length > 0) await deleteEvolutionImages(toRemove);
  return NextResponse.json({ evolution: updated });
}

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
