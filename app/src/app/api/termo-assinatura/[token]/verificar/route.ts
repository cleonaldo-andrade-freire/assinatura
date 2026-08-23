import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ cpf: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token || !/^[0-9a-f]{64}$/i.test(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: request } = await supabase
    .from("consent_term_signatures")
    .select("*")
    .eq("token", params.token)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ data: clinic }, { data: patient }] = await Promise.all([
    supabase.from("clinics").select("name, logo_url, consent_term_text, cnpj").eq("id", request.clinic_id).single(),
    supabase.from("patients").select("name, cpf, phone").eq("id", request.patient_id).single()
  ]);

  if (!clinic || !patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cleanCpf = (cpf: string) => cpf.replace(/\D/g, "");

  if (cleanCpf(patient.cpf || "") !== cleanCpf(parsed.data.cpf)) {
    return NextResponse.json({ error: "wrong_cpf" }, { status: 401 });
  }

  const processedHtml = (clinic.consent_term_text || "")
    .replace(/\{\{clinica_nome\}\}/g, clinic.name || "")
    .replace(/\{\{clinica_cnpj\}\}/g, clinic.cnpj || "Não informado")
    .replace(/\{\{paciente_nome\}\}/g, patient.name || "")
    .replace(/\{\{paciente_cpf\}\}/g, patient.cpf || "Não informado");

  return NextResponse.json({
    ok: true,
    consentTermHtml: processedHtml
  });
}
