import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";
import type { Appointment } from "@/lib/database.types";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

/** Mensagem avulsa por WhatsApp pro paciente do agendamento — texto livre, digitado na hora, diferente do /resend (que reenvia sempre o mesmo texto de confirmação). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const a = appointment as Appointment;
  if (!a.patient_phone) {
    return NextResponse.json({ error: "no_phone" }, { status: 400 });
  }

  const sent = await sendText(clinic, a.patient_phone, parsed.data.message);
  if (!sent) {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
