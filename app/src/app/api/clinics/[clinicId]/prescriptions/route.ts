import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issuePrescription } from "@/lib/prescriptions";
import { isValidCPF } from "@/lib/validation";
import { upsertPatientFromContact } from "@/lib/patients";

const itemSchema = z.object({
  drug_name: z.string().min(1),
  dosage: z.string().min(1),
  instructions: z.string().min(1),
  generic_allowed: z.boolean().default(false),
  // Autodeclarado pelo dentista — ver `lib/prescriptionControl.ts`. Não
  // classificamos isso automaticamente.
  control_type: z.enum(["comum", "antimicrobiano_retencao", "controlado_especial"]).default("comum"),
});

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_cpf: z
    .string()
    .min(1)
    .optional()
    .refine((val) => !val || isValidCPF(val), { message: "CPF inválido" }),
  patient_phone: z.string().min(10).optional(),
  patient_id: z.string().uuid().optional(),
  items: z.array(itemSchema).min(1),
  notes: z.string().optional(),
  signerCertificatePem: z.string().optional(),
  // Via não assinada digitalmente (shell mobile v2, prompt §8) — default
  // false preserva o fluxo de assinatura normal pra quem não manda esse campo.
  unsigned: z.boolean().default(false),
});

/** Lista as prescrições da clínica logada. RLS já garante que só vem o que é dela. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ prescriptions: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) {
    return NextResponse.json({ error: "dentist_not_configured" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Sistema não suporta numeração/talão de receituário especial — bloqueia
  // aqui também (não só no client), a classificação é autodeclarada e
  // reforçar no servidor evita depender só da validação da tela.
  if (input.items.some((item) => item.control_type === "controlado_especial")) {
    return NextResponse.json({ error: "controlado_especial_nao_suportado" }, { status: 400 });
  }

  // Escrita via chave de serviço — `prescriptions` não tem policy de insert
  // pra usuário autenticado, mesmo padrão de `certificates`.
  const supabase = createSupabaseAdminClient();

  // Cadastra/vincula o paciente automaticamente se o dentista não selecionou
  // uma sugestão da busca — mesma correção aplicada em `certificates/route.ts`.
  let patientId = input.patient_id;
  let finalPhone = input.patient_phone ?? null;
  let finalCpf = input.patient_cpf ?? null;

  if (patientId) {
    const { data: patient } = await supabase.from("patients").select("phone, cpf").eq("id", patientId).single();
    if (patient) {
      if (!finalPhone) finalPhone = patient.phone;
      if (!finalCpf) finalCpf = patient.cpf;
    }
  } else {
    patientId = await upsertPatientFromContact(supabase, clinic.id, input.patient_name, input.patient_phone, input.patient_cpf);
  }

  const { data: prescription, error } = await supabase
    .from("prescriptions")
    .insert({
      clinic_id: clinic.id,
      patient_name: input.patient_name,
      patient_cpf: finalCpf,
      patient_phone: finalPhone,
      patient_id: patientId,
      dentist_name: clinic.dentist_name,
      dentist_cro: clinic.dentist_cro,
      dentist_cro_uf: clinic.dentist_cro_uf,
      items: input.items,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !prescription) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  const issued = await issuePrescription(prescription.id, input.signerCertificatePem, input.unsigned);
  return NextResponse.json({ prescription: issued }, { status: 201 });
}
