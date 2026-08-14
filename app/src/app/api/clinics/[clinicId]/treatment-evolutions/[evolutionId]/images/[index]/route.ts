import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contentTypeForKey, readEvolutionImage } from "@/lib/treatmentEvolutionStorage";

/** Stream autenticado de uma imagem de evolução — nunca servida por URL pública do Storage. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string; index: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const index = parseInt(params.index, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("image_keys")
    .eq("id", params.evolutionId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  const key = evolution?.image_keys?.[index];
  if (!key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await readEvolutionImage(key);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
