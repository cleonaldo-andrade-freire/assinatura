import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteOpenDebitsForTreatment, syncDebitAfterPriceChange } from "@/lib/treatmentDebits";
import type { Treatment } from "@/lib/database.types";

const bodySchema = z.object({
  treatment_name: z.string().trim().min(1).optional(),
  tooth_region: z.string().trim().nullable().optional(),
  price: z.number().nonnegative().optional(),
  price_table_name: z.string().trim().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("treatments")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  if (parsed.data.price !== undefined) {
    try {
      await syncDebitAfterPriceChange(supabase, data as Treatment);
    } catch (err) {
      console.error("Falha ao sincronizar débito após editar o valor do tratamento:", err);
    }
  }

  return NextResponse.json({ treatment: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();

  try {
    await deleteOpenDebitsForTreatment(supabase, params.id);
  } catch (err) {
    console.error("Falha ao limpar débitos em aberto do tratamento:", err);
  }

  const { error } = await supabase.from("treatments").delete().eq("id", params.id).eq("clinic_id", clinic.id);

  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
