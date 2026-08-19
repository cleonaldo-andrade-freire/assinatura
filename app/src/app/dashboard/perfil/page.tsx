import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ProfileForm } from "@/components/ProfileForm";

const ROLE_LABELS: Record<"owner" | "staff", string> = {
  owner: "Proprietário(a)",
  staff: "Atendente",
};

/**
 * Acessível a qualquer papel (owner ou staff) — diferente das outras
 * páginas de Configurações, aqui cada um edita só o próprio nome/foto.
 */
export default async function PerfilPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Meu perfil"
      subtitle="Nome e foto mostrados pra identificar sua sessão"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <ProfileForm
        initialName={userName ?? ""}
        initialAvatarUrl={userAvatarUrl}
        roleLabel={ROLE_LABELS[role]}
        email={userEmail}
      />
    </ClinicShell>
  );
}
