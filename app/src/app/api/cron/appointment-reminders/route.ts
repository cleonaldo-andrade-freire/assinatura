import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendAppointmentReminder } from "@/lib/appointmentNotifications";
import type { Appointment, Clinic } from "@/lib/database.types";

const FINAL_REMINDER_HOURS_BEFORE = 3;

/**
 * Lembrete escalonado (ver vercel.json pro agendamento do cron): 24h antes
 * da consulta, se ainda `agendado`, manda um lembrete; poucas horas antes
 * (`FINAL_REMINDER_HOURS_BEFORE`), se continuar sem resposta, manda o
 * lembrete final. Cada nível só dispara uma vez — `reminder_24h_sent_at`/
 * `reminder_final_sent_at` nulo é a condição, não uma janela de tempo
 * exata, então rodar o cron com atraso ou repetido não duplica envio.
 *
 * Protegido pelo header que a própria Vercel Cron injeta quando a env var
 * CRON_SECRET está configurada — sem isso, qualquer um poderia chamar essa
 * rota e gastar a cota de WhatsApp da clínica.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const inFinalWindow = new Date(now.getTime() + FINAL_REMINDER_HOURS_BEFORE * 3_600_000);

  const clinicCache = new Map<string, Clinic | null>();
  async function getClinic(id: string): Promise<Clinic | null> {
    if (clinicCache.has(id)) return clinicCache.get(id) ?? null;
    const { data } = await supabase.from("clinics").select("*").eq("id", id).single();
    clinicCache.set(id, (data as Clinic) ?? null);
    return (data as Clinic) ?? null;
  }

  async function processTier(tier: "24h" | "final", windowEnd: Date): Promise<number> {
    const column = tier === "24h" ? "reminder_24h_sent_at" : "reminder_final_sent_at";
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("status", "agendado")
      .is(column, null)
      .gt("scheduled_at", now.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());

    let sent = 0;
    for (const a of (data as Appointment[]) ?? []) {
      const clinic = await getClinic(a.clinic_id);
      if (!clinic) continue;
      try {
        await sendAppointmentReminder(supabase, clinic, a, tier);
        sent++;
      } catch (err) {
        console.error(`[appointment-reminders] falha no lembrete "${tier}" do agendamento ${a.id}:`, err);
      }
    }
    return sent;
  }

  const sent24h = await processTier("24h", in24h);
  const sentFinal = await processTier("final", inFinalWindow);

  return NextResponse.json({ ok: true, sent24h, sentFinal });
}
