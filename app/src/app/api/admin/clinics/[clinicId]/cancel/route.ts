import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cancelAsaasSubscription } from "@/lib/asaas";

/** Cancela a assinatura de uma clínica — usado pela tela de admin. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, asaas_subscription_id")
    .eq("id", params.clinicId)
    .single();
  if (!clinic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (clinic.asaas_subscription_id) {
    try {
      await cancelAsaasSubscription(clinic.asaas_subscription_id);
    } catch (err) {
      console.error("Falha ao cancelar assinatura no Asaas:", err);
    }
  }

  await supabase.from("clinics").update({ subscription_status: "canceled" }).eq("id", clinic.id);

  return NextResponse.json({ ok: true });
}
