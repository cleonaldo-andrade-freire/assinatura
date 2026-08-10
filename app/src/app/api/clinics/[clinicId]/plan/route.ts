import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDays, createAsaasSubscription, planValueFor, updateAsaasSubscription, updateAsaasSubscriptionFields } from "@/lib/asaas";

const bodySchema = z.object({
  plan: z.enum(["starter", "basic", "standard", "plus", "pro", "enterprise"]),
});

/**
 * Self-service: a própria clínica troca de plano pelo /billing.
 *
 * Em trial (sem cobrança agendada até aqui — ver POST /api/admin/clinics),
 * escolher um plano vale NA HORA: cria a assinatura no Asaas se ainda não
 * existir (ou atualiza valor + data de vencimento pra hoje, se já existir de
 * uma clínica antiga), e já grava o `plan` novo direto — sem prorateio a
 * calcular, porque não tinha assinatura rodando antes. O acesso continua
 * dependendo do pagamento confirmar (`subscription_status` só vira "active"
 * no webhook do Asaas), então o limite de anamneses do trial segue valendo
 * até lá.
 *
 * Fora do trial, o Asaas já cobra o valor novo a partir da próxima fatura,
 * mas o `plan` no nosso banco só muda de fato quando essa fatura é
 * confirmada — fica guardado em `pending_plan` até lá (ver
 * /api/webhooks/asaas). Pedir o mesmo plano que já está ativo cancela uma
 * troca pendente, revertendo o valor no Asaas.
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

  if (clinic.subscription_status === "trialing") {
    if (!clinic.asaas_customer_id) {
      return NextResponse.json({ error: "asaas_customer_missing" }, { status: 400 });
    }

    try {
      let subscriptionId = clinic.asaas_subscription_id;
      if (!subscriptionId) {
        const subscription = await createAsaasSubscription({
          customerId: clinic.asaas_customer_id,
          plan: newPlan,
          cycle: clinic.billing_cycle,
          description: `Assinatura ${newPlan} — ${clinic.name}`,
        });
        subscriptionId = subscription.id;
      } else {
        await updateAsaasSubscriptionFields({
          subscriptionId,
          value: planValueFor(newPlan, clinic.billing_cycle),
          nextDueDate: addDays(new Date(), 0),
        });
      }

      const { error } = await supabase
        .from("clinics")
        .update({ plan: newPlan, asaas_subscription_id: subscriptionId })
        .eq("id", clinic.id);
      if (error) {
        return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, plan: newPlan, immediate: true });
    } catch (err) {
      return NextResponse.json(
        { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

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
