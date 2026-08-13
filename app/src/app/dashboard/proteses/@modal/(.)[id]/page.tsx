import { notFound, redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DetailModalShell } from "@/components/dashboard/DetailModalShell";
import { ProsthesisOrderDetailBody } from "@/components/dashboard/ProsthesisOrderDetailBody";
import { PROSTHESIS_STAGE_LABEL } from "@/lib/prosthesisTemplates";
import type { ProsthesisOrder, ProsthesisOrderEvent } from "@/lib/database.types";

/**
 * Intercepta `/dashboard/proteses/[id]` quando a navegação parte de dentro
 * do próprio quadro kanban — abre como modal por cima dele em vez de trocar
 * de página. Acesso direto ou F5 continua caindo na página cheia
 * (`proteses/[id]/page.tsx`), fora do alcance da interceptação.
 */
export default async function ProsthesisOrderDetailModal({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("prosthesis_orders")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!order) notFound();
  const o = order as ProsthesisOrder;

  const { data: eventsData } = await supabase
    .from("prosthesis_order_events")
    .select("*")
    .eq("prosthesis_order_id", o.id)
    .order("created_at", { ascending: false });
  const events = (eventsData as ProsthesisOrderEvent[]) ?? [];

  return (
    <DetailModalShell title={o.description} subtitle={`Estágio atual: ${PROSTHESIS_STAGE_LABEL[o.stage]}`}>
      <ProsthesisOrderDetailBody clinicId={clinic.id} order={o} events={events} />
    </DetailModalShell>
  );
}
