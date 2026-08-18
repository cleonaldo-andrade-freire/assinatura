import { NextRequest, NextResponse } from "next/server";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/clinics/[clinicId]/staff — lista membros da clínica (somente owner) */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (auth.clinic.id !== params.clinicId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (auth.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, created_at")
    .eq("clinic_id", params.clinicId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}
