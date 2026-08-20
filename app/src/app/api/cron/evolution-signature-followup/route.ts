import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requestEvolutionSignature } from "@/lib/evolutionSignature";
import { appendSignatureEvent } from "@/lib/documentSignatureEvents";

// Total de lembretes automáticos antes de desistir (além da solicitação
// original) — insistir pra sempre com um paciente que nunca respondeu não
// ajuda ninguém. Depois disso o status vira "expirada" de vez (só então o
// botão "Solicitar assinatura" reaparece na ficha do dentista — sem essa
// transição a evolução ficava "pendente" pra sempre, sem jeito de reenviar
// pela tela, mesmo com o link original já morto).
const MAX_AUTO_FOLLOWUPS = 2;

/**
 * Roda 1x/dia (ver vercel.json — cron do plano Hobby da Vercel não aceita
 * frequência maior que isso, um cron sub-diário já travou TODOS os deploys
 * silenciosamente uma vez neste projeto). Reenvia o link de assinatura de
 * evolução que expirou sem resposta do paciente, até um limite; depois disso
 * marca como "expirada" definitivamente.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: pending } = await supabase
    .from("treatment_evolutions")
    .select("id, clinic_id, signature_followup_count")
    .eq("signature_status", "solicitada")
    .lt("signature_token_expires_at", new Date().toISOString());

  let resent = 0;
  let expired = 0;

  for (const ev of pending ?? []) {
    if (ev.signature_followup_count < MAX_AUTO_FOLLOWUPS) {
      const result = await requestEvolutionSignature(ev.clinic_id, ev.id, { isFollowup: true });
      if (result.ok) resent++;
      continue;
    }

    await supabase.from("treatment_evolutions").update({ signature_status: "expirada" }).eq("id", ev.id);
    await appendSignatureEvent(supabase, {
      clinicId: ev.clinic_id,
      documentType: "treatment_evolution",
      documentId: ev.id,
      eventType: "expirada_sem_resposta",
      actor: "system",
      payload: { followup_count: ev.signature_followup_count },
    });
    expired++;
  }

  return NextResponse.json({ ok: true, checked: pending?.length ?? 0, resent, expired });
}
