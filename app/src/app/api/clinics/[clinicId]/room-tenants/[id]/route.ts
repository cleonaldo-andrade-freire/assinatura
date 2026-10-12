import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";
import { tenantSchema, tenantRow } from "../schema";

const patchSchema = tenantSchema.partial().extend({ active: z.boolean().optional() });

/** Edita ou desativa um locatário. Não há exclusão: locações antigas apontam pra ele (FK restrict). */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const update: Record<string, unknown> = { ...tenantRow(parsed.data), updated_at: new Date().toISOString() };
  if (parsed.data.active !== undefined) update.active = parsed.data.active;

  const supabase = await createSupabaseServerClient();
  const { data: tenant, error } = await supabase
    .from("room_tenants")
    .update(update)
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  if (!tenant) return NextResponse.json({ error: "not_found", message: "Locatário não encontrado." }, { status: 404 });
  return NextResponse.json({ tenant });
}
