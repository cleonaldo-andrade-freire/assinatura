import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { PlanForm } from "@/components/admin/PlanForm";

export default async function NewPlanPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return (
    <AdminShell title="Novo plano" subtitle="Cria uma faixa nova — fica disponível na landing e nos seletores assim que ativa">
      <PlanForm />
    </AdminShell>
  );
}
