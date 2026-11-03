import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidToken } from "@/lib/validation";
import { signContract } from "@/lib/roomRentalContractServer";

const pointSchema = z.object({ x: z.number(), y: z.number(), t: z.number(), p: z.number().nullable() });
const strokeDataSchema = z.object({
  schema: z.literal("tracado/v1"),
  canvas: z.object({ cssWidth: z.number(), cssHeight: z.number(), dpr: z.number() }),
  capturedAt: z.string(),
  pointerType: z.string(),
  strokes: z.array(z.object({ index: z.number(), points: z.array(pointSchema) })),
  metrics: z.object({
    durationTotalMs: z.number(),
    pointsTotal: z.number(),
    numStrokes: z.number(),
    bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  }),
});

const bodySchema = z.object({
  // PNG do traço — limite folgado para um canvas de celular, mas barra lixo.
  dataUrl: z.string().startsWith("data:image/png;base64,").max(500_000),
  strokeData: strokeDataSchema,
  contentHashConfirmed: z.string().min(1),
  accepted: z.literal(true),
});

/** Assinatura do contrato pelo locatário — o token do link é a credencial. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await signContract({
    token: params.token,
    signature: { dataUrl: parsed.data.dataUrl, strokeData: parsed.data.strokeData },
    contentHashConfirmed: parsed.data.contentHashConfirmed,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) {
    const status: Record<string, number> = { not_found: 404, cancelled: 409, already_signed: 409, content_mismatch: 409, update_failed: 409 };
    return NextResponse.json({ error: result.error }, { status: status[result.error] ?? 400 });
  }
  return NextResponse.json({ ok: true, signedAt: result.signedAt });
}
