import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";
import { tenantSchema, tenantRow } from "./schema";

/** Cadastra um locatário (só o nome é obrigatório — o formulário da locação faz cadastro rápido). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = tenantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: tenant, error } = await supabase
    .from("room_tenants")
    .insert({ clinic_id: clinic.id, ...tenantRow(parsed.data) })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ tenant });
}
