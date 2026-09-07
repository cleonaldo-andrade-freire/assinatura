import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidBRPhone, toE164BR, brPhoneVariants } from "@/lib/validation";
import { appendLeadMessage, findOpenLead, findPatientNameForPhone } from "@/lib/leads";
import type { Lead } from "@/lib/database.types";

const bodySchema = z.object({
  patient_phone: z.string().refine(isValidBRPhone, { message: "celular inválido" }),
  patient_name: z.string().trim().max(120).optional(),
  clinical_summary: z.string().trim().max(500).optional(),
  // Conversa que já aconteceu no WhatsApp, colada pela equipe — vira a
  // primeira mensagem do lead, marcada como reconstituída.
  conversation: z.string().trim().max(20_000).optional(),
});

/**
 * Cadastro manual de lead (retroativo) — pros contatos que a automação do
 * webhook não capturou. Se já existe um lead aberto pro número, devolve ele
 * em vez de duplicar.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const phone = toE164BR(input.patient_phone);

  const supabase = await createSupabaseServerClient();

  const existing = await findOpenLead(supabase, params.clinicId, phone);
  if (existing) {
    return NextResponse.json({ lead: existing, existed: true });
  }

  let name = input.patient_name || null;
  if (!name) {
    const { data: patients } = await supabase
      .from("patients")
      .select("name, phone")
      .eq("clinic_id", params.clinicId)
      .in("phone", brPhoneVariants(phone))
      .not("name", "is", null)
      .limit(5);
    name = findPatientNameForPhone(phone, patients ?? []);
  }

  const now = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      clinic_id: params.clinicId,
      patient_phone: phone,
      patient_name: name,
      status: "waiting_reply",
      clinical_summary: input.clinical_summary || null,
      last_message_at: now,
    })
    .select("*")
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  if (input.conversation) {
    await appendLeadMessage(supabase, {
      leadId: (lead as Lead).id,
      clinicId: params.clinicId,
      role: "staff",
      content: `[Conversa reconstituída pela equipe]\n\n${input.conversation}`,
    });
  }

  return NextResponse.json({ lead }, { status: 201 });
}
