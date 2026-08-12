import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readCertificatePdf } from "@/lib/certificatePdfStorage";

/** Download autenticado do PDF de atestado, usado no dashboard. */
export async function GET(_req: NextRequest, { params }: { params: { certificateId: string } }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS garante que essa leitura só retorna o atestado se ele pertencer à
  // clínica do usuário logado.
  const { data: certificate } = await supabase
    .from("certificates")
    .select("id, pdf_storage_key")
    .eq("id", params.certificateId)
    .maybeSingle();

  if (!certificate || !certificate.pdf_storage_key) {
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
