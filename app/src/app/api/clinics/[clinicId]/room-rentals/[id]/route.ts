import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

const bodySchema = z.object({
  amount: z.number().min(0).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Edita valor e observação. Valor de locação já paga não muda — desfaz o
 * pagamento antes, pra o valor recebido nunca divergir do registrado em
 * silêncio. Data e turno também não: aí é cancelar e criar outra. */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: rental } = await supabase
    .from("room_rentals")
    .select("id, status, paid_at, amount")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!rental) return NextResponse.json({ error: "not_found", message: "Locação não encontrada." }, { status: 404 });
  if (rental.status === "cancelada") {
    return NextResponse.json({ error: "cancelled", message: "Locação cancelada não pode ser editada." }, { status: 409 });
  }
  if (parsed.data.amount !== undefined && rental.paid_at && Number(rental.amount) !== parsed.data.amount) {
    return NextResponse.json(
      { error: "already_paid", message: "Locação já paga — desfaça o pagamento antes de mudar o valor." },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.amount !== undefined) update.amount = parsed.data.amount;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes || null;

  const { data: updated, error } = await supabase.from("room_rentals").update(update).eq("id", params.id).select("*").single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ rental: updated });
}
