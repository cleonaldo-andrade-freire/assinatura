import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readPrescriptionPdf } from "@/lib/prescriptionPdfStorage";

/** Download público do PDF de prescrição assinada, acessado pelo paciente via /prescricao?token=... */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("id, status, pdf_storage_key")
    .eq("token", params.token)
    .maybeSingle();

  if (!prescription || prescription.status !== "assinado" || !prescription.pdf_storage_key) {
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
