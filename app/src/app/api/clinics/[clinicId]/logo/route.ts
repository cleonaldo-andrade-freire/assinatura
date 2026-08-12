import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveClinicLogo } from "@/lib/logoStorage";

/** Upload de logo self-service pela própria clínica (o admin também tem uma rota equivalente, pra outra tela). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  let logoUrl: string;
  try {
    logoUrl = await saveClinicLogo(clinic.id, file);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("clinics").update({ logo_url: logoUrl }).eq("id", clinic.id);
  if (error) {
    console.error("Falha ao salvar logo_url no banco:", error);
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ logo_url: logoUrl });
}
