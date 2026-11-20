import { NextResponse } from "next/server";
import { getClinicAndRole } from "@/lib/auth";
import type { Clinic } from "@/lib/database.types";

/** Campanhas: só a proprietária, e só em clínica com o módulo ligado (migration 076). */
export async function requireCampaignOwner(clinicId: string): Promise<{ clinic: Clinic } | { error: NextResponse }> {
  const auth = await getClinicAndRole();
  if (!auth || auth.clinic.id !== clinicId) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (auth.role !== "owner") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!auth.clinic.campaigns_enabled) return { error: NextResponse.json({ error: "campaigns_disabled" }, { status: 404 }) };
  return { clinic: auth.clinic };
}
