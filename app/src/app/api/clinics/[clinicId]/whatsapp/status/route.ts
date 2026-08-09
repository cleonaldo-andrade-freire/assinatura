import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { getConnectionState } from "@/lib/evolutionAdmin";

export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!clinic.evolution_instance_name) {
    return NextResponse.json({ state: "not_created" });
  }

  const state = await getConnectionState(clinic.evolution_instance_name);
  return NextResponse.json({ state });
}
