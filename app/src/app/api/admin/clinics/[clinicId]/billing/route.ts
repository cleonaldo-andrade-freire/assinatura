import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequestAuthorized } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateAsaasSubscriptionFields } from "@/lib/asaas";
import { getPlanById } from "@/lib/plans";
import type { Clinic } from "@/lib/database.types";

const bodySchema = z.object({
  trial_ends_at: z.string().datetime().optional(),
  custom_monthly_price: z.number().positive().nullable().optional(),
});

/**
 * Ajustes manuais de cobrança feitos pelo admin: estender o trial (empurra a
 * data no nosso banco *e* o nextDueDate da assinatura no Asaas, senão ficam
 * dessincronizados) e preço customizado/desconto (substitui o preço padrão do
 * plano, aplicado na hora — diferente da troca de plano self-service, que só
 * vale na próxima cobrança).
 */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", params.clinicId).single();
  if (!clinic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const typedClinic = clinic as Clinic;
  const updates: Record<string, unknown> = {};

  if (parsed.data.trial_ends_at !== undefined) {
    if (typedClinic.subscription_status !== "trialing") {
      return NextResponse.json({ error: "not_trialing" }, { status: 400 });
    }
    updates.trial_ends_at = parsed.data.trial_ends_at;
    if (typedClinic.asaas_subscription_id) {
      try {
        await updateAsaasSubscriptionFields({
          subscriptionId: typedClinic.asaas_subscription_id,
          nextDueDate: parsed.data.trial_ends_at.slice(0, 10),
        });
      } catch (err) {
        return NextResponse.json(
          { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
          { status: 502 }
        );
      }
    }
  }

  if (parsed.data.custom_monthly_price !== undefined) {
    updates.custom_monthly_price = parsed.data.custom_monthly_price;
    if (typedClinic.asaas_subscription_id) {
      const plan = await getPlanById(supabase, typedClinic.plan);
      const monthly = parsed.data.custom_monthly_price ?? plan?.monthly_price ?? 0;
      const value = typedClinic.billing_cycle === "yearly" ? monthly * 10 : monthly;
      try {
        await updateAsaasSubscriptionFields({ subscriptionId: typedClinic.asaas_subscription_id, value });
      } catch (err) {
        return NextResponse.json(
          { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
          { status: 502 }
        );
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const { error } = await supabase.from("clinics").update(updates).eq("id", params.clinicId);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
