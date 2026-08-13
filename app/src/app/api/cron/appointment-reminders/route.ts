import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendAppointmentReminder } from "@/lib/appointmentNotifications";
import { addDaysToDateStr, brDateOnly, brDayRangeUtc } from "@/lib/date";
import type { Appointment, Clinic } from "@/lib/database.types";

/**
 * Lembrete escalonado, com granularidade de DIA, não de hora — de propósito:
 * o plano Hobby da Vercel só permite cron 1x/dia (foi o motivo do deploy
 * não publicar quando este arquivo mandava rodar a cada 30min, ver
 * vercel.json). Com um único disparo por dia, não dá pra mirar "3 horas
 * antes" com precisão — em vez disso, a régua vira: "amanhã" (roda de
 * manhã, avisa quem tem consulta no dia seguinte) e "hoje" (mesmo horário
 * do disparo, avisa quem tem consulta ainda hoje e continua sem resposta).
 * Cada nível só dispara uma vez — `reminder_24h_sent_at`/
 * `reminder_final_sent_at` nulo é a condição, não uma janela de tempo
 * exata, então rodar o cron atrasado ou de novo no mesmo dia não duplica
 * envio. Se a clínica migrar pro plano Pro, dá pra apertar o cron pra
 * várias vezes ao dia sem mudar nada aqui — a lógica já é "ainda não
 * mandei esse nível pra essa consulta", não depende da frequência do cron.
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
  const today = brDateOnly(now);
  const tomorrow = addDaysToDateStr(today, 1);

  const clinicCache = new Map<string, Clinic | null>();
  async function getClinic(id: string): Promise<Clinic | null> {
    if (clinicCache.has(id)) return clinicCache.get(id) ?? null;
    const { data } = await supabase.from("clinics").select("*").eq("id", id).single();
    clinicCache.set(id, (data as Clinic) ?? null);
    return (data as Clinic) ?? null;
  }

  async function processTier(tier: "24h" | "final", dayStr: string): Promise<number> {
    const column = tier === "24h" ? "reminder_24h_sent_at" : "reminder_final_sent_at";
    const { fromIso, toIso } = brDayRangeUtc(dayStr);
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("status", "agendado")
      .is(column, null)
      .gt("scheduled_at", now.toISOString()) // nunca lembra de uma consulta que já passou
      .gte("scheduled_at", fromIso)
      .lt("scheduled_at", toIso);

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

  const sent24h = await processTier("24h", tomorrow);
  const sentFinal = await processTier("final", today);

  return NextResponse.json({ ok: true, sent24h, sentFinal });
}
