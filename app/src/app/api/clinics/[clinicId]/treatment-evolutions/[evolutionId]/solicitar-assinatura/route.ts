import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { requestEvolutionSignature } from "@/lib/evolutionSignature";

/** Dispara a solicitação de assinatura da evolução por WhatsApp — idempotente
 * na prática (chamar de novo gera um token novo e invalida o anterior, nunca
 * duas solicitações concorrentes pro mesmo documento). */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requestEvolutionSignature(params.clinicId, params.evolutionId);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "Evolução não encontrada.",
      clinic_not_found: "Clínica não encontrada.",
      consent_term_not_configured: "Configure o texto do Termo de Adesão Eletrônica em Configurações antes de usar este recurso.",
      dentist_not_configured: "Cadastre o nome e o CRO do dentista responsável em Configurações antes de solicitar assinaturas.",
      patient_not_found: "Paciente não encontrado.",
      patient_no_phone: "Este paciente não tem WhatsApp cadastrado.",
      patient_no_cpf: "Este paciente não tem CPF cadastrado — é usado como segundo fator de verificação.",
    };
    return NextResponse.json({ error: result.error, message: messages[result.error] }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
