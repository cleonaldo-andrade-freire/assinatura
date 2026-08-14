import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  description: z.string().min(1),
  category: z.string().nullable().optional(),
  amount: z.number().positive(),
  due_date: z.string().min(1),
});

/** Cria uma despesa avulsa (não ligada a uma recorrência). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      clinic_id: clinic.id,
      description: parsed.data.description,
      category: parsed.data.category ?? null,
      amount: parsed.data.amount,
      due_date: parsed.data.due_date,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ expense });
}
