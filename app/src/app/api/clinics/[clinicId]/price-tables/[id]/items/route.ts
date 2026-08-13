import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  specialty: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
});

export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
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
    .from("price_table_items")
    .insert({
      clinic_id: clinic.id,
      price_table_id: params.id,
      specialty: parsed.data.specialty || null,
      name: parsed.data.name,
      price: parsed.data.price,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
