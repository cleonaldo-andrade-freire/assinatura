import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  finalized_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evolution_text: z.string().trim().min(1),
});

/** Finaliza um ou vários tratamentos juntos (um por vez ou em lote, mesma
 * rota) — o profissional nunca vem do corpo da requisição, é sempre o
 * responsável técnico configurado na clínica agora, não o que estava
 * gravado na linha quando ela foi criada. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
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
    .from("treatments")
    .update({
      status: "finalizado",
      finalized_at: parsed.data.finalized_at,
      evolution_text: parsed.data.evolution_text,
      dentist_name: clinic.dentist_name || clinic.name,
      updated_at: new Date().toISOString(),
    })
    .in("id", parsed.data.ids)
    .eq("clinic_id", clinic.id)
    .select("*");

  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  // Best-effort — finalizar já registra uma evolução no histórico de cada
  // tratamento (uma linha por tratamento, mesmo texto/data), pra "tela de
  // edição do tratamento" sempre mostrar isso junto com as outras.
  try {
    await supabase.from("treatment_evolutions").insert(
      (data ?? []).map((t) => ({
        clinic_id: clinic.id,
        treatment_id: t.id,
        patient_id: t.patient_id,
        evolution_date: parsed.data.finalized_at,
        text: parsed.data.evolution_text,
        image_keys: [],
      }))
    );
  } catch (err) {
    console.error("Falha ao registrar evolução ao finalizar tratamento:", err);
  }

  return NextResponse.json({ treatments: data });
}
