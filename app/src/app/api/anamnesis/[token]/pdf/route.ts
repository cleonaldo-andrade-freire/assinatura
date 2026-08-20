import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readPdf } from "@/lib/pdfStorage";

/** Download público do PDF de anamnese assinada, acessado pelo paciente via
 * /assinatura?token=... (estado "já assinado") — mesmo padrão de
 * /api/certificates/[token]/pdf, mas o PDF fica em `signatures`, não em
 * `anamneses` (uma anamnese só ganha `pdf_storage_key` quando é assinada). */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: anamnesis } = await supabase.from("anamneses").select("id").eq("token", params.token).maybeSingle();
  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: signature } = await supabase
    .from("signatures")
    .select("id, pdf_storage_key")
    .eq("anamnesis_id", anamnesis.id)
    .maybeSingle();
  if (!signature) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readPdf(signature.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="anamnese-${signature.id}.pdf"`,
    },
  });
}
