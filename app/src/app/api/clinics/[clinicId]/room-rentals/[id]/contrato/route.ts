import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";
import { prepareRentalContract } from "@/lib/roomRentalContractServer";

const bodySchema = z.object({
  /** true = manda o link pelo WhatsApp; false = só gera (para copiar o link). */
  send: z.boolean(),
  /** true = refaz um contrato já assinado (a assinatura anterior é descartada). */
  renew: z.boolean().optional(),
});

/** Gera o contrato da locação e, se pedido, envia o link ao locatário.
 * Só por clique da clínica — nada aqui é chamado automaticamente. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await prepareRentalContract(guard.clinic, params.id, { send: parsed.data.send, renew: parsed.data.renew ?? false });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ link: result.link, sent: result.sent, rental: result.rental });
}
