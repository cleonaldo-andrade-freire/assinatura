import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";

/**
 * Chamado pela página pública /assinatura quando o paciente abre o link. Sem
 * usuário logado — chave de serviço, com o `token` (uuid aleatório) fazendo
 * o papel de credencial de acesso a essa anamnese específica.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, clinic_id, patient_name, patient_cpf, answers")
    .eq("token", params.token)
    .single();

  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ data: clinic }, { data: signature }] = await Promise.all([
    supabase.from("clinics").select("name, logo_url").eq("id", anamnesis.clinic_id).single(),
    supabase.from("signatures").select("id").eq("anamnesis_id", anamnesis.id).maybeSingle(),
  ]);

  return NextResponse.json({
    clinic_name: clinic?.name ?? "Clínica",
    clinic_logo_url: clinic?.logo_url ?? null,
    patient_name: anamnesis.patient_name,
    patient_cpf: anamnesis.patient_cpf,
    answers: anamnesis.answers,
    already_signed: signature !== null,
    // Novo campo, opcional — quem já lia essa resposta antes de hoje não
    // quebra por ignorá-lo. Deixa /assinatura oferecer o PDF de novo pra
    // quem reabre o link depois de já ter assinado.
    signature_id: signature?.id ?? null,
  });
}

const patchSchema = z.object({
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
});

/**
 * Corrige uma resposta antes de assinar — chamado pela tela de revisão em
 * /assinatura. Bloqueado depois de assinado: o documento já virou um PDF
 * assinado com as respostas daquele momento, corrigir o registro depois
 * criaria uma divergência entre o que foi assinado e o que a clínica vê.
 */
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: anamnesis } = await supabase.from("anamneses").select("id").eq("token", params.token).maybeSingle();
  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: existingSignature } = await supabase.from("signatures").select("id").eq("anamnesis_id", anamnesis.id).maybeSingle();
  if (existingSignature) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { error } = await supabase.from("anamneses").update({ answers: parsed.data.answers }).eq("id", anamnesis.id);
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
