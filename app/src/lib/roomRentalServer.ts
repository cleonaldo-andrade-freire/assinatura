import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClinicAndRole } from "@/lib/auth";
import { DEFAULT_SHIFTS } from "@/lib/roomRental";
import type { Clinic, RoomRentalShift } from "@/lib/database.types";

/**
 * Guarda das rotas de locação: clínica do usuário logado, papel `owner` (o
 * módulo mexe com valores, como o Financeiro) e módulo ligado. Módulo
 * desligado responde 404 — pra clínica, a rota não existe.
 */
export async function requireRoomRentalClinic(clinicId: string): Promise<{ clinic: Clinic } | { response: NextResponse }> {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== clinicId || auth.role !== "owner") {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!auth.clinic.room_rental_enabled) {
    return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  return { clinic: auth.clinic };
}

/** Turnos da clínica, semeando Manhã/Tarde/Noite na primeira vez (tabela vazia). */
export async function loadShifts(supabase: SupabaseClient, clinicId: string): Promise<RoomRentalShift[]> {
  const { data } = await supabase.from("room_rental_shifts").select("*").eq("clinic_id", clinicId).order("sort_order").order("start_time");
  if (data && data.length > 0) return data as RoomRentalShift[];

  // Se outra requisição semeou no meio tempo, o índice único por nome recusa
  // esta inserção — aí é só ler o que a outra gravou.
  await supabase.from("room_rental_shifts").insert(DEFAULT_SHIFTS.map((s) => ({ ...s, clinic_id: clinicId })));
  const { data: seeded } = await supabase.from("room_rental_shifts").select("*").eq("clinic_id", clinicId).order("sort_order").order("start_time");
  return (seeded as RoomRentalShift[]) ?? [];
}
