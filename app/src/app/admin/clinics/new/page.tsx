import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminSession";
import { NewClinicForm } from "./NewClinicForm";

export default async function NewClinicPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <NewClinicForm />;
}
