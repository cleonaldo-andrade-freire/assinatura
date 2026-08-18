import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { finishCertificateExternalSignature } from "@/lib/certificates";
import { z } from "zod";

const finishSchema = z.object({
  signatureSessionId: z.string().uuid(),
  signatureBase64: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = finishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const certificate = await finishCertificateExternalSignature(
      params.id,
      parsed.data.signatureSessionId,
      parsed.data.signatureBase64
    );

    return NextResponse.json({ certificate });
  } catch (err: any) {
    console.error("Erro finalizando assinatura local:", err);
    return NextResponse.json({ error: "signature_failed", message: err.message }, { status: 500 });
  }
}
