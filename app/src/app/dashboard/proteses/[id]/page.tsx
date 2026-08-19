import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ProsthesisOrderDetailBody } from "@/components/dashboard/ProsthesisOrderDetailBody";
import { PROSTHESIS_STAGE_LABEL } from "@/lib/prosthesisTemplates";
import type { ProsthesisOrder, ProsthesisOrderEvent } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function ProsthesisOrderDetailPage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

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
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={o.description}
      subtitle={`Estágio atual: ${PROSTHESIS_STAGE_LABEL[o.stage]}`}
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <Link href="/dashboard/proteses" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <div className={styles.narrowContent}>
        <ProsthesisOrderDetailBody clinicId={clinic.id} order={o} events={events} />
      </div>
    </ClinicShell>
  );
}
