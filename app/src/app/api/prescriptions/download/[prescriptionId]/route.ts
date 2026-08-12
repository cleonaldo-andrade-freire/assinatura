import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPrescriptionPdf } from "@/lib/prescriptionPdfStorage";

/** Download autenticado do PDF de prescrição, usado no dashboard. */
export async function GET(_req: NextRequest, { params }: { params: { prescriptionId: string } }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS garante que essa leitura só retorna a prescrição se ela pertencer à
  // clínica do usuário logado.
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("id, pdf_storage_key")
    .eq("id", params.prescriptionId)
    .maybeSingle();

  if (!prescription || !prescription.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readPrescriptionPdf(prescription.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="prescricao-${prescription.id}.pdf"`,
    },
  });
}
