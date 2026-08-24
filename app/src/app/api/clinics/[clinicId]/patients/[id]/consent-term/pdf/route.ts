import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPdf } from "@/lib/pdfStorage";

export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS ensures the user can only see requests for their clinic.
  // Actually, we need to check if the user has access to this clinic and patient.
  // The easiest way is to query the consent_term_signatures table using the session client (which has RLS).
  const { data: request } = await supabase
    .from("consent_term_signatures")
    .select("pdf_storage_key")
    .eq("clinic_id", params.clinicId)
    .eq("patient_id", params.id)
    .eq("status", "assinado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!request || !request.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const pdf = await readPdf(request.pdf_storage_key);
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="termo-adesao-${params.id}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error reading PDF:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
