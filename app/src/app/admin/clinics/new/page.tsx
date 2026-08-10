import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActivePlans } from "@/lib/plans";
import { NewClinicForm } from "./NewClinicForm";

export default async function NewClinicPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  const supabase = createSupabaseAdminClient();
  const plans = await getActivePlans(supabase);
  return <NewClinicForm plans={plans} />;
}
