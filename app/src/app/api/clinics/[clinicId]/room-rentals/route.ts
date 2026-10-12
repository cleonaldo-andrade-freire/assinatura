import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";
import { rentalConflictMessage, shiftRange } from "@/lib/roomRental";

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  rental_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().min(0),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Cria uma locação avulsa. Data passada é aceita de propósito — a cobrança é
 * depois do uso, e lançar um turno que já aconteceu ("esqueci de registrar")
 * é o caso comum, não exceção. Os conflitos (outra locação, consulta na
 * agenda) são garantidos pelo banco (migration 073). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const [{ data: shift }, { data: tenant }] = await Promise.all([
    supabase.from("room_rental_shifts").select("*").eq("id", input.shift_id).eq("clinic_id", clinic.id).eq("active", true).maybeSingle(),
    supabase.from("room_tenants").select("id").eq("id", input.tenant_id).eq("clinic_id", clinic.id).eq("active", true).maybeSingle(),
  ]);
  if (!shift) return NextResponse.json({ error: "invalid_body", message: "Turno não encontrado." }, { status: 400 });
  if (!tenant) return NextResponse.json({ error: "invalid_body", message: "Locatário não encontrado." }, { status: 400 });

  const { startsAt, endsAt } = shiftRange(input.rental_date, shift);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rental, error } = await supabase
    .from("room_rentals")
    .insert({
      clinic_id: clinic.id,
      tenant_id: input.tenant_id,
      shift_id: input.shift_id,
      rental_date: input.rental_date,
      starts_at: startsAt,
      ends_at: endsAt,
      amount: input.amount,
      notes: input.notes || null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error || !rental) {
    const conflict = rentalConflictMessage(error);
    if (conflict) return NextResponse.json({ error: "conflict", message: conflict }, { status: 409 });
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ rental });
}
