import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { NewProsthesisOrderModal } from "@/components/NewProsthesisOrderModal";
import { ProsthesisBoard } from "@/components/ProsthesisBoard";
import type { ProsthesisOrder } from "@/lib/database.types";

export default async function ProsthesisPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prosthesis_orders")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("stage_since", { ascending: true });
  const orders = (data as ProsthesisOrder[]) ?? [];

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Controle de prótese"
      subtitle="Acompanhamento do serviço de prótese, do pedido à instalação"
      role={role}
      userEmail={userEmail}
      actions={<NewProsthesisOrderModal clinicId={clinic.id} />}
    >
      <ProsthesisBoard clinicId={clinic.id} orders={orders} />
    </ClinicShell>
  );
}
