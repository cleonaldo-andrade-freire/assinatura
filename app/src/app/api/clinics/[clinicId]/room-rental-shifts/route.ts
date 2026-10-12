import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRoomRentalClinic } from "@/lib/roomRentalServer";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido.");

const shiftSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do turno.").max(60),
    start_time: time,
    end_time: time,
    default_amount: z.number().min(0).nullable().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => v.end_time > v.start_time, { message: "O fim do turno precisa ser depois do início.", path: ["end_time"] });

/** Cria um turno. Turnos podem se sobrepor (ex.: "Integral") — quem impede
 * duas locações no mesmo horário é a constraint por intervalo da 073. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const guard = await requireRoomRentalClinic(params.clinicId);
  if ("response" in guard) return guard.response;
  const { clinic } = guard;

  const parsed = shiftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: shift, error } = await supabase
    .from("room_rental_shifts")
    .insert({ clinic_id: clinic.id, ...parsed.data, default_amount: parsed.data.default_amount ?? null })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate", message: "Já existe um turno com esse nome." }, { status: 409 });
    return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ shift });
}
