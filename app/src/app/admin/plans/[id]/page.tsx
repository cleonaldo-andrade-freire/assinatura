import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlanById } from "@/lib/plans";
import { AdminShell } from "@/components/admin/AdminShell";
import { PlanForm } from "@/components/admin/PlanForm";

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  if (!(await hasAdminSession())) redirect("/admin/login");

  const supabase = createSupabaseAdminClient();
  const plan = await getPlanById(supabase, params.id);
  if (!plan) redirect("/admin/plans");

  return (
    <AdminShell title={plan.name} subtitle={`/${plan.id}`}>
      <PlanForm plan={plan} />
    </AdminShell>
  );
}
