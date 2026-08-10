import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logoutInstance } from "@/lib/evolutionAdmin";

/**
 * Desconecta o WhatsApp da clínica (ex.: trocou de aparelho/número). Limpa
 * whatsapp_number pra a próxima conexão pedir confirmação do número de novo —
 * a instância (evolution_instance_name) continua a mesma, só a sessão muda.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (clinic.evolution_instance_name) {
    await logoutInstance(clinic.evolution_instance_name);
  }

  const supabase = createSupabaseAdminClient();
  await supabase.from("clinics").update({ whatsapp_number: null }).eq("id", clinic.id);

  return NextResponse.json({ ok: true });
}
