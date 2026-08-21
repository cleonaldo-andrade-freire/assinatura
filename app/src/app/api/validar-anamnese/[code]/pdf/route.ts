import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { readPdf } from "@/lib/pdfStorage";
import { readAnamnesisDentistPdf } from "@/lib/anamnesisDentistPdfStorage";
import { normalizeValidationCode } from "@/lib/validationCode";

/**
 * Download público do PDF de anamnese assinada — sem login, o próprio código
 * de verificação (aleatório, ver migration 060) é o controle de acesso,
 * mesmo modelo de confiança dos links de confirmação/assinatura já usados
 * no resto do app. Serve o arquivo mesclado (paciente + dentista) quando a
 * dentista já contra-assinou; senão, o da paciente sozinha.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const supabase = createSupabaseAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(supabase, `validar-anamnese-pdf:${ip}`, { windowSeconds: 300, maxAttempts: 20 });
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const code = normalizeValidationCode(params.code);
  const { data: signature } = await supabase.from("signatures").select("*").eq("verification_code", code).maybeSingle();
  if (!signature) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf =
    signature.dentist_signature_status === "assinada"
      ? await readAnamnesisDentistPdf(signature.dentist_pdf_storage_key)
      : await readPdf(signature.pdf_storage_key);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="anamnese-${code}.pdf"`,
    },
  });
}
