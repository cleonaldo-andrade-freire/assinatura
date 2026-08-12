import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readCertificatePdf } from "@/lib/certificatePdfStorage";

/** Download público do PDF de atestado assinado, acessado pelo paciente via /atestado?token=... */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("id, status, pdf_storage_key")
    .eq("token", params.token)
    .maybeSingle();

  if (!certificate || certificate.status !== "assinado" || !certificate.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readCertificatePdf(certificate.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="atestado-${certificate.id}.pdf"`,
    },
  });
}
