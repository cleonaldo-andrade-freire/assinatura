import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

const bodySchema = z.object({ reason: z.string().trim().max(500).nullable().optional() });

/** Cancela a locação e libera o turno. Locação paga é recusada (também por
 * check constraint na 073). Sem multa: se o cancelamento em cima da hora for
 * cobrado, não se cancela — edita-se o valor. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: rental } = await supabase
    .from("room_rentals")
    .select("id, status, paid_at")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!rental) return NextResponse.json({ error: "not_found", message: "Locação não encontrada." }, { status: 404 });
  if (rental.status === "cancelada") return NextResponse.json({ ok: true });
  if (rental.paid_at) {
    return NextResponse.json(
      { error: "already_paid", message: "Locação já paga — desfaça o pagamento antes de cancelar." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("room_rentals")
    .update({ status: "cancelada", cancelled_at: now, cancel_reason: parsed.data.reason || null, updated_at: now })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
