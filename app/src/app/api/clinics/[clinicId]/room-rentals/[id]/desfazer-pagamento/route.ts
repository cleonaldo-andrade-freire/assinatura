import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

/** Volta a locação para "a receber" — necessário antes de mudar o valor ou cancelar uma locação paga. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("room_rentals")
    .update({ paid_at: null, payment_method: null, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not_found", message: "Locação não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
