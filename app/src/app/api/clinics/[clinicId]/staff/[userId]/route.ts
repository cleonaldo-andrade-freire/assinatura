import { NextRequest, NextResponse } from "next/server";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * DELETE /api/clinics/[clinicId]/staff/[userId]
 * Remove um membro da clínica (somente owner, não pode remover a si mesmo).
 * Deleta o profile — o usuário perde acesso imediatamente.
 * O registro em auth.users é mantido (não deletamos a conta).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { clinicId: string; userId: string } }
) {
  const auth = await getClinicAndRole();
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (auth.clinic.id !== params.clinicId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (auth.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Obtém o id do usuário logado para impedir auto-remoção
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === params.userId) {
    return NextResponse.json({ error: "cannot_remove_self" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .delete()
    .eq("id", params.userId)
    .eq("clinic_id", params.clinicId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
