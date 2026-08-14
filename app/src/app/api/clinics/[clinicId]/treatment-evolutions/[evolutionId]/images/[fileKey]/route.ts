import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contentTypeForKey, readEvolutionImage } from "@/lib/treatmentEvolutionStorage";

/**
 * Stream autenticado de uma imagem de evolução — endereçada pelo token
 * (parte final da chave no Storage), não por posição no array. Um índice
 * posicional (`/images/0`, `/images/1`...) muda de conteúdo conforme a
 * evolução é editada (remove uma, adiciona outra) — com Cache-Control
 * agressivo isso fazia o navegador continuar mostrando a imagem (ou erro)
 * antigo daquele índice depois de editar. Token é único por arquivo pra
 * sempre, então a URL pode ser cacheada pra sempre também.
 */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string; fileKey: string } }) {
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

  const key = `${clinic.id}/${params.evolutionId}/${params.fileKey}`;
  if (!evolution?.image_keys?.includes(key)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await readEvolutionImage(key);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
