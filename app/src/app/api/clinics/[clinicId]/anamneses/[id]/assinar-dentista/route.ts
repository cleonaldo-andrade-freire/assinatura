import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { issueAnamnesisDentistSignature } from "@/lib/anamnesisDentistSignature";

const bodySchema = z.object({ signerCertificatePem: z.string().optional() });

/** Passo 1 da contra-assinatura ICP-Brasil da dentista sobre a anamnese
 * (agente local) — ver lib/anamnesisDentistSignature.ts. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await issueAnamnesisDentistSignature(params.clinicId, params.id, parsed.data.signerCertificatePem);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "Anamnese não encontrada.",
      patient_not_signed: "O paciente ainda não assinou esta anamnese.",
      already_signed: "Esta anamnese já foi assinada pela dentista.",
      clinic_not_found: "Clínica não encontrada.",
      dentist_not_configured: "Cadastre o nome e o CRO do dentista responsável em Configurações antes de assinar.",
      provider_not_supported_for_anamneses: "O provedor de assinatura configurado ainda não suporta anamneses.",
    };
    return NextResponse.json({ error: result.error, message: messages[result.error] }, { status: 400 });
  }

  return NextResponse.json(result);
}
