import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    status: z.enum(["bot_active", "waiting_reply", "urgent", "scheduled"]).optional(),
    // string vazia = limpar o nome (volta pra "Sem nome ainda")
    patient_name: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.status !== undefined || d.patient_name !== undefined, {
    message: "nada para atualizar",
  });

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.patient_name !== undefined) update.patient_name = parsed.data.patient_name || null;

  const supabase = await createSupabaseServerClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", params.id)
    .eq("clinic_id", params.clinicId)
    .select("*")
    .single();

  if (error || !lead) return NextResponse.json({ error: "update_failed", message: error?.message }, { status: 500 });
  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // RLS já restringe DELETE em `leads` a owner (migration 059), mas devolver
  // 403 explícito aqui evita depender só do erro genérico do Postgres.
  if (auth.role !== "owner") {
    return NextResponse.json({ error: "forbidden", message: "Só o proprietário pode excluir leads." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", params.id).eq("clinic_id", params.clinicId);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
