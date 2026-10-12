import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido.");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  start_time: time.optional(),
  end_time: time.optional(),
  default_amount: z.number().min(0).nullable().optional(),
  sort_order: z.number().int().optional(),
  active: z.boolean().optional(),
});

/** Edita ou desativa um turno. Mudar o horário só vale para locações novas —
 * as existentes guardam o próprio horário (starts_at/ends_at). Não há
 * exclusão: locações antigas apontam pro turno (FK restrict). */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from("room_rental_shifts")
    .select("start_time, end_time")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "not_found", message: "Turno não encontrado." }, { status: 404 });

  const start = parsed.data.start_time ?? current.start_time.slice(0, 5);
  const end = parsed.data.end_time ?? current.end_time.slice(0, 5);
  if (end <= start) {
    return NextResponse.json({ error: "invalid_body", message: "O fim do turno precisa ser depois do início." }, { status: 400 });
  }

  const { data: shift, error } = await supabase
    .from("room_rental_shifts")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate", message: "Já existe um turno com esse nome." }, { status: 409 });
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ shift });
}
