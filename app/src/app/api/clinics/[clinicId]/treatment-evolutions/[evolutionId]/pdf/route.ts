import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPdf } from "@/lib/pdfStorage";
import { readEvolutionDentistPdf } from "@/lib/evolutionDentistPdfStorage";

/**
 * Download autenticado do PDF da evolução já assinada — mesma lógica de
 * `api/validar-evolucao/[code]/pdf` (arquivo mesclado quando a dentista já
 * contra-assinou, senão só o da paciente), só que pela sessão da clínica em
 * vez de um código de validação público.
 */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("id, signature_status, dentist_signature_status, dentist_pdf_storage_key")
    .eq("id", params.evolutionId)
    .eq("clinic_id", params.clinicId)
    .maybeSingle();
  if (!evolution) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (evolution.signature_status !== "assinada") {
    return NextResponse.json({ error: "patient_not_signed" }, { status: 400 });
  }

  const { data: signature } = await supabase
    .from("treatment_evolution_signatures")
    .select("pdf_storage_key")
    .eq("treatment_evolution_id", evolution.id)
    .maybeSingle();
  if (!signature) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf =
    evolution.dentist_signature_status === "assinada" && evolution.dentist_pdf_storage_key
      ? await readEvolutionDentistPdf(evolution.dentist_pdf_storage_key)
      : await readPdf(signature.pdf_storage_key);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="evolucao-${evolution.id}.pdf"`,
    },
  });
}
