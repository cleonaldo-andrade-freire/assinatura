import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: request } = await supabase
    .from("consent_term_signatures")
    .select("*")
    .eq("token", params.token)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const expired = request.status === "aguardando_assinatura" && request.expires_at 
    ? new Date(request.expires_at).getTime() < Date.now()
    : false;

  const [{ data: clinic }, { data: patient }] = await Promise.all([
    supabase.from("clinics").select("name, logo_url, consent_term_text, cnpj").eq("id", request.clinic_id).single(),
    supabase.from("patients").select("name, cpf, phone").eq("id", request.patient_id).single()
  ]);

  if (!clinic || !patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Prepara o texto com variáveis preenchidas
  const processedHtml = (clinic.consent_term_text || "")
    .replace(/\{\{clinica_nome\}\}/g, clinic.name || "")
    .replace(/\{\{clinica_cnpj\}\}/g, clinic.cnpj || "Não informado")
    .replace(/\{\{paciente_nome\}\}/g, patient.name || "")
    .replace(/\{\{paciente_cpf\}\}/g, patient.cpf || "Não informado");

  // Mascarar o nome para segurança, assim como na evolução
  const maskName = (fullName: string) => {
    return fullName
      .trim()
      .split(/\s+/)
      .map((part, i, arr) => {
        if (i === 0 || i === arr.length - 1) return part.length <= 2 ? part : `${part.slice(0, Math.max(2, Math.ceil(part.length * 0.4)))}***`;
        return "***";
      })
      .join(" ");
  };

  return NextResponse.json({
    found: true,
    status: expired ? "expirada" : request.status,
    clinicName: clinic.name,
    clinicLogoUrl: clinic.logo_url,
    patientNameMasked: maskName(patient.name),
    consentTermHtml: processedHtml,
    hasCpf: !!patient.cpf, // Para a tela pedir ou não o CPF para verificação
    pdfStorageKey: request.pdf_storage_key, // se já estiver assinado
  });
}
