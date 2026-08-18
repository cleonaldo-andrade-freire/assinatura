import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "staff"]).default("staff"),
});

/**
 * POST /api/clinics/[clinicId]/staff/invite
 * Convida um membro para a clínica via e-mail (somente owner).
 * Passa clinic_id e role em raw_user_meta_data para que o trigger
 * `on_staff_invite_confirmed` crie o profile automaticamente.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (auth.clinic.id !== params.clinicId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (auth.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { email, role } = parsed.data;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/aceitar-convite`,
    data: {
      clinic_id: params.clinicId,
      role,
    },
  });

  if (error) {
    console.error("Erro ao convidar membro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
