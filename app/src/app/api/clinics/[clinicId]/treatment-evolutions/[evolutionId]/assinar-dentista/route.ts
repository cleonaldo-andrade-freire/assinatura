import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { issueEvolutionDentistSignature } from "@/lib/evolutionDentistSignature";

const bodySchema = z.object({ signerCertificatePem: z.string().optional() });

/** Passo 1 da assinatura ICP-Brasil da dentista sobre a evolução (agente
 * local) — ver lib/evolutionDentistSignature.ts. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await issueEvolutionDentistSignature(params.clinicId, params.evolutionId, parsed.data.signerCertificatePem);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "Evolução não encontrada.",
      already_signed: "Esta evolução já foi assinada pela dentista.",
      patient_not_signed: "O paciente ainda não assinou esta evolução — a contra-assinatura só é possível depois disso.",
      clinic_not_found: "Clínica não encontrada.",
      dentist_not_configured: "Cadastre o nome e o CRO do dentista responsável em Configurações antes de assinar.",
      patient_not_found: "Paciente não encontrado.",
      provider_not_supported_for_evolutions: "O provedor de assinatura configurado ainda não suporta evoluções clínicas.",
    };
    return NextResponse.json({ error: result.error, message: messages[result.error] }, { status: 400 });
  }

  return NextResponse.json(result);
}
