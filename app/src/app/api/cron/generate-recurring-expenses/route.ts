import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateDueExpenses } from "@/lib/recurringExpenses";

/**
 * Roda 1x/dia (ver vercel.json) — gera a despesa do mês pra cada
 * recorrência ativa de qualquer clínica. Protegido pelo header que a
 * própria Vercel Cron injeta quando CRON_SECRET está configurada, mesmo
 * padrão de /api/cron/appointment-reminders.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const created = await generateDueExpenses(supabase);
  return NextResponse.json({ ok: true, created });
}
