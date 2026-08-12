import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  dentist_name: z.string().min(1),
  dentist_cro: z.string().min(1),
  dentist_cro_uf: z.string().length(2),
  dentist_phone: z.string().min(10).optional(),
  dentist_email: z.string().email().optional(),
  clinic_address: z.string().optional(),
});

/** A própria clínica cadastra/atualiza o perfil do responsável técnico e o endereço de atendimento. */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      dentist_name: parsed.data.dentist_name,
      dentist_cro: parsed.data.dentist_cro,
      dentist_cro_uf: parsed.data.dentist_cro_uf.toUpperCase(),
      dentist_phone: parsed.data.dentist_phone ?? null,
      dentist_email: parsed.data.dentist_email ?? null,
      clinic_address: parsed.data.clinic_address ?? null,
    })
    .eq("id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
