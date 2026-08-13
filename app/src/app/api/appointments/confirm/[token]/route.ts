import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import { processAppointmentResponse } from "@/lib/appointmentNotifications";
import type { Appointment, Clinic } from "@/lib/database.types";

const bodySchema = z.object({
  action: z.enum(["confirm", "cancel"]),
});

/** Chamado pela página pública /confirmacao/[token] quando o paciente toca em "Confirmar" ou "Cancelar". */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(createSupabaseAdminClient(), `appointment-confirm:${ip}`, {
    windowSeconds: 300,
    maxAttempts: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("confirm_token", params.token)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", appointment.clinic_id).single();
  if (!clinic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await processAppointmentResponse(
    supabase,
    clinic as Clinic,
    appointment as Appointment,
    parsed.data.action,
    "paciente"
  );

  if (!result.ok) {
    const status = result.reason === "expired" ? 410 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
