import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  nature: z.enum(["fixa", "variavel"]).nullable().optional(),
  amount: z.number().positive().optional(),
  day_of_month: z.number().int().min(1).max(28).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: recurringExpense, error } = await supabase
    .from("recurring_expenses")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ recurring_expense: recurringExpense });
}

/** Exclui o molde — não apaga as despesas já geradas por ele (o FK desvincula sozinho, ver migration). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", params.id).eq("clinic_id", clinic.id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
