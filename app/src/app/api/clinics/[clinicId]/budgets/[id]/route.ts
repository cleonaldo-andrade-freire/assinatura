import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  status: z.enum(["em_aberto", "aprovado"]),
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
    .from("budgets")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ budget: data });
}
