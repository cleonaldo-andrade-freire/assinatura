import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { finishEvolutionDentistSignature } from "@/lib/evolutionDentistSignature";

const bodySchema = z.object({
  signatureSessionId: z.string().uuid(),
  signatureBase64: z.string().min(1),
});

/** Passo 2 — finaliza com a assinatura que o agente local devolveu, e já
 * dispara o envio ao paciente por WhatsApp em seguida. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await finishEvolutionDentistSignature(params.clinicId, params.evolutionId, parsed.data.signatureSessionId, parsed.data.signatureBase64);
  if (!result.ok) {
    return NextResponse.json({ error: "signature_failed", message: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}
