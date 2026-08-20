import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readAnamnesisDentistPdf } from "@/lib/anamnesisDentistPdfStorage";

export async function GET(_req: NextRequest, { params }: { params: { signatureId: string } }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS garante que essa leitura só retorna a assinatura se ela pertencer à
  // clínica do usuário logado — se pertencer a outra clínica, vem null aqui.
  const { data: signature } = await supabase
    .from("signatures")
    .select("id, dentist_pdf_storage_key")
    .eq("id", params.signatureId)
    .maybeSingle();

  if (!signature || !signature.dentist_pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readAnamnesisDentistPdf(signature.dentist_pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="anamnese-dentista-${signature.id}.pdf"`,
    },
  });
}
