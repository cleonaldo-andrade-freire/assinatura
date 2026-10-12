import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  /** Data local ("YYYY-MM-DD") — o pagamento pode ter sido em outro dia. */
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.string().min(1),
});

/** Marca uma ou várias locações como pagas — é assim que o acerto do mês
 * acontece, sem uma entidade de "fatura" própria. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { ids, paid_at, payment_method } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("room_rentals").select("id, status, paid_at").eq("clinic_id", clinic.id).in("id", ids);
  if (!existing || existing.length !== ids.length) {
    return NextResponse.json({ error: "not_found", message: "Uma ou mais locações não foram encontradas." }, { status: 404 });
  }
  if (existing.some((r) => r.status === "cancelada" || r.paid_at)) {
    return NextResponse.json({ error: "invalid_state", message: "Uma ou mais locações já estão pagas ou canceladas." }, { status: 409 });
  }

  // Meio-dia no fuso do Brasil: a data escolhida não pode virar o dia
  // anterior/seguinte ao ser convertida (mesmo padrão de expenses/mark-paid).
  const paidAtIso = new Date(`${paid_at}T12:00:00-03:00`).toISOString();
  const { error } = await supabase
    .from("room_rentals")
    .update({ paid_at: paidAtIso, payment_method, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinic.id)
    .in("id", ids);
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
