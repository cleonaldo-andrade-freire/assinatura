import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { locationBodySchema, locationRow } from "./schema";

/**
 * Locais de atendimento da clínica. `?active=1` traz só os ativos — é o que
 * os seletores (agendamento, envio de anamnese) usam; a tela de cadastro
 * lista todos. Padrão primeiro, depois por nome.
 */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("clinic_locations").select("*").eq("clinic_id", clinic.id);
  if (req.nextUrl.searchParams.get("active") === "1") query = query.eq("active", true);
  const { data, error } = await query.order("is_default", { ascending: false }).order("name", { ascending: true });

  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = locationBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Primeiro local cadastrado já nasce padrão — senão a clínica cadastra um
  // local só e as mensagens continuam sem endereço até alguém marcar.
  const { count } = await supabase
    .from("clinic_locations")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id);
  const isDefault = parsed.data.is_default || !count;

  if (isDefault) {
    await supabase.from("clinic_locations").update({ is_default: false }).eq("clinic_id", clinic.id).eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("clinic_locations")
    .insert({ clinic_id: clinic.id, ...locationRow(parsed.data), is_default: isDefault, active: true })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ location: data }, { status: 201 });
}
