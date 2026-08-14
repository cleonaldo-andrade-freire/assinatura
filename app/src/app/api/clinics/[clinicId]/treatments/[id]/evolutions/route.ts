import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_EVOLUTION_IMAGES, saveEvolutionImage } from "@/lib/treatmentEvolutionStorage";
import type { TreatmentEvolution } from "@/lib/database.types";

/** Lista as evoluções de um tratamento, mais recente primeiro. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("treatment_evolutions")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("treatment_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ evolutions: (data as TreatmentEvolution[]) ?? [] });
}

/** Cria uma evolução — multipart/form-data com `evolution_date`, `text` e até 5 `images`. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: treatment } = await supabase
    .from("treatments")
    .select("id, patient_id")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!treatment) {
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

  const images = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (images.length > MAX_EVOLUTION_IMAGES) {
    return NextResponse.json({ error: "too_many_images", message: `Máximo de ${MAX_EVOLUTION_IMAGES} imagens por evolução.` }, { status: 400 });
  }
  // Mesma ordem/quantidade que `images` (uma entrada por arquivo).
  const imageDescriptions = form.getAll("new_image_descriptions").map((d) => String(d));

  const { data: evolution, error: insertError } = await supabase
    .from("treatment_evolutions")
    .insert({
      clinic_id: clinic.id,
      treatment_id: treatment.id,
      patient_id: treatment.patient_id,
      evolution_date: evolutionDate,
      text,
      image_keys: [],
    })
    .select("*")
    .single();

  if (insertError || !evolution) {
    return NextResponse.json({ error: "insert_failed", message: insertError?.message }, { status: 500 });
  }

  if (images.length > 0) {
    try {
      const imageKeys = await Promise.all(images.map((file) => saveEvolutionImage(clinic.id, evolution.id, file)));
      const { data: updated, error: updateError } = await supabase
        .from("treatment_evolutions")
        .update({ image_keys: imageKeys, image_names: images.map((f) => f.name), image_descriptions: images.map((_, i) => imageDescriptions[i] ?? "") })
        .eq("id", evolution.id)
        .select("*")
        .single();
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ evolution: updated }, { status: 201 });
    } catch (err) {
      // A evolução já foi gravada (texto é o que mais importa); só as
      // imagens falharam — devolve sem elas em vez de perder tudo.
      console.error("Falha ao salvar imagens da evolução:", err);
      return NextResponse.json({ evolution, error: "images_failed" }, { status: 201 });
    }
  }

  return NextResponse.json({ evolution }, { status: 201 });
}
