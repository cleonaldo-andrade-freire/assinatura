import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { locationBodySchema, locationRow } from "../schema";

// Edição completa do endereço OU só alternar ativo/padrão (botões da lista) —
// o segundo formato não reenvia o endereço inteiro.
const patchSchema = z.union([
  locationBodySchema.extend({ active: z.boolean().optional() }),
  z.object({ active: z.boolean().optional(), is_default: z.boolean().optional() }).strict(),
]);

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from("clinic_locations")
    .select("id, is_default, active")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("street" in input) Object.assign(update, locationRow(input));
  if (input.active !== undefined) update.active = input.active;
  if (input.is_default !== undefined) update.is_default = input.is_default;

  // Local inativo não pode ser o padrão (o padrão é o que já vem marcado nos
  // seletores, que só listam ativos) — desativar tira o padrão junto.
  if (update.active === false) update.is_default = false;
  if (update.is_default === true && current.active === false && update.active !== true) {
    return NextResponse.json(
      { error: "inactive_default", message: "Reative o local antes de marcá-lo como padrão." },
      { status: 400 }
    );
  }

  if (update.is_default === true && !current.is_default) {
    await supabase
      .from("clinic_locations")
      .update({ is_default: false })
      .eq("clinic_id", clinic.id)
      .eq("is_default", true)
      .neq("id", params.id);
  }

  const { data, error } = await supabase
    .from("clinic_locations")
    .update(update)
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "update_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ location: data });
}

/**
 * Apaga de vez só se nenhuma consulta usa o local; senão desativa (some dos
 * seletores, mas as consultas antigas continuam com o endereço certo) e
 * avisa na resposta — a tela mostra a diferença pro usuário.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { count: usage } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id)
    .eq("location_id", params.id);

  if (usage) {
    const { data, error } = await supabase
      .from("clinic_locations")
      .update({ active: false, is_default: false, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("clinic_id", clinic.id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, deactivated: true, appointments: usage });
  }

  const { error, count } = await supabase
    .from("clinic_locations")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id);

  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, deactivated: false });
}
