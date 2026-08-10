import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateAsaasSubscription } from "@/lib/asaas";

const bodySchema = z.object({
  plan: z.enum(["starter", "basic", "standard", "plus", "pro", "enterprise"]),
});

/**
 * Self-service: a própria clínica troca de plano pelo /billing. O Asaas já passa
 * a cobrar o valor novo a partir da próxima fatura, mas o plano (e o limite de
 * uso) só muda de fato no nosso sistema quando essa fatura é confirmada —
 * guardamos como "pending_plan" até lá (ver /api/webhooks/asaas, que finaliza
 * a troca no evento de pagamento confirmado). Pedir o mesmo plano que já está
 * ativo cancela uma troca pendente, revertendo o valor no Asaas.
 */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const newPlan = parsed.data.plan;
  const supabase = createSupabaseAdminClient();

  if (newPlan === clinic.plan) {
    if (!clinic.pending_plan) {
      return NextResponse.json({ error: "same_plan" }, { status: 400 });
    }
    if (clinic.asaas_subscription_id) {
      try {
        await updateAsaasSubscription({ subscriptionId: clinic.asaas_subscription_id, plan: clinic.plan, cycle: clinic.billing_cycle });
      } catch (err) {
        return NextResponse.json(
          { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
          { status: 502 }
        );
      }
    }
    await supabase.from("clinics").update({ pending_plan: null }).eq("id", clinic.id);
    return NextResponse.json({ ok: true, plan: clinic.plan, pending_plan: null });
  }

  if (clinic.asaas_subscription_id) {
    try {
      await updateAsaasSubscription({ subscriptionId: clinic.asaas_subscription_id, plan: newPlan, cycle: clinic.billing_cycle });
    } catch (err) {
      return NextResponse.json(
        { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  const { error } = await supabase.from("clinics").update({ pending_plan: newPlan }).eq("id", clinic.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pending_plan: newPlan });
}
