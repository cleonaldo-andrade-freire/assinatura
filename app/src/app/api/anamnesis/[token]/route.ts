import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";

/**
 * Chamado pela página pública /assinatura quando o paciente abre o link. Sem
 * usuário logado — chave de serviço, com o `token` (uuid aleatório) fazendo
 * o papel de credencial de acesso a essa anamnese específica.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, clinic_id, patient_name, patient_cpf, answers")
    .eq("token", params.token)
    .single();

  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ data: clinic }, { data: signature }] = await Promise.all([
    supabase.from("clinics").select("name, logo_url").eq("id", anamnesis.clinic_id).single(),
    supabase.from("signatures").select("id").eq("anamnesis_id", anamnesis.id).maybeSingle(),
  ]);

  return NextResponse.json({
    clinic_name: clinic?.name ?? "Clínica",
    clinic_logo_url: clinic?.logo_url ?? null,
    patient_name: anamnesis.patient_name,
    patient_cpf: anamnesis.patient_cpf,
    answers: anamnesis.answers,
    already_signed: signature !== null,
  });
}
