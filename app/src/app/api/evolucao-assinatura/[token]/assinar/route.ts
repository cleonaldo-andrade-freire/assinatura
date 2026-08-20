import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidToken } from "@/lib/validation";
import { signEvolution } from "@/lib/evolutionSignature";
import { verifySessionToken, sessionCookieName } from "@/lib/evolutionSignatureSession";

const pointSchema = z.object({ x: z.number(), y: z.number(), t: z.number(), p: z.number().nullable() });
const strokeSchema = z.object({ index: z.number(), points: z.array(pointSchema) });
const strokeDataSchema = z.object({
  schema: z.literal("tracado/v1"),
  canvas: z.object({ cssWidth: z.number(), cssHeight: z.number(), dpr: z.number() }),
  capturedAt: z.string(),
  pointerType: z.string(),
  strokes: z.array(strokeSchema),
  metrics: z.object({
    durationTotalMs: z.number(),
    pointsTotal: z.number(),
    numStrokes: z.number(),
    bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  }),
});

const bodySchema = z.object({
  dataUrl: z.string().min(1),
  strokeData: strokeDataSchema,
  contentHashConfirmed: z.string().min(1),
  scrollCompleto: z.boolean(),
  needsConsentAcceptance: z.boolean(),
});

/** Assinatura final da evolução — exige sessão de segundo fator válida
 * (cookie httpOnly emitido em /verificar) e confere o hash do conteúdo
 * exibido contra o hash real, travando divergências. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cookie = req.cookies.get(sessionCookieName(params.token))?.value;
  if (!verifySessionToken(cookie, params.token)) {
    return NextResponse.json({ error: "session_required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  const result = await signEvolution({
    token: params.token,
    strokeSignature: { dataUrl: parsed.data.dataUrl, strokeData: parsed.data.strokeData },
    contentHashConfirmed: parsed.data.contentHashConfirmed,
    scrollCompleto: parsed.data.scrollCompleto,
    needsConsentAcceptance: parsed.data.needsConsentAcceptance,
    ip,
    userAgent,
  });

  if (!result.ok) {
    const statusByError: Record<string, number> = {
      not_found: 404,
      invalid_status: 409,
      no_snapshot: 409,
      scroll_incomplete: 400,
      content_mismatch: 409,
      patient_no_phone: 400,
      consent_term_not_configured: 400,
    };
    return NextResponse.json({ error: result.error }, { status: statusByError[result.error] ?? 400 });
  }

  return NextResponse.json({ ok: true, verification_code: result.verificationCode });
}
