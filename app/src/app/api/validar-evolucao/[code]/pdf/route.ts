import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { readPdf } from "@/lib/pdfStorage";
import { readEvolutionDentistPdf } from "@/lib/evolutionDentistPdfStorage";
import { normalizeValidationCode } from "@/lib/validationCode";

/**
 * Download público do PDF de evolução clínica assinada — mesmo modelo de
 * `api/validar-anamnese/[code]/pdf`: o código de verificação já é o
 * controle de acesso, sem login. Serve o arquivo mesclado (paciente +
 * dentista) quando a dentista já contra-assinou; senão, só o da paciente.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const supabase = createSupabaseAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(supabase, `validar-evolucao-pdf:${ip}`, { windowSeconds: 300, maxAttempts: 20 });
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const code = normalizeValidationCode(params.code);
  const { data: signature } = await supabase.from("treatment_evolution_signatures").select("*").eq("verification_code", code).maybeSingle();
  if (!signature) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("dentist_signature_status, dentist_pdf_storage_key")
    .eq("id", signature.treatment_evolution_id)
    .maybeSingle();

  const pdf =
    evolution?.dentist_signature_status === "assinada" && evolution.dentist_pdf_storage_key
      ? await readEvolutionDentistPdf(evolution.dentist_pdf_storage_key)
      : await readPdf(signature.pdf_storage_key);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="evolucao-${code}.pdf"`,
    },
  });
}
