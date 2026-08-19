import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";

/**
 * Aponte de entrada da tab "Documentos" do shell mobile v2 (prompt §5).
 * Nesta fase (shell — Fase 1) é só um agrupador de navegação: as listas
 * completas com segmented control e estado preservado por sessão são
 * conteúdo da Fase 2/3, que reformula Anamneses/Atestados/Prescrições em
 * si. Reaproveita as rotas existentes — nenhuma lista é duplicada aqui.
 */
export default async function DocumentosPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const sections = [
    { href: "/dashboard/anamneses", title: "Anamneses", description: "Enviadas, em andamento e assinadas" },
    { href: "/dashboard/atestados", title: "Atestados", description: "Emitidos pela clínica" },
    { href: "/dashboard/prescricoes", title: "Prescrições", description: "Emitidas pela clínica" },
  ];

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Documentos"
      subtitle="Anamneses, atestados e prescrições em um só lugar"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 17, color: "var(--brand-deep)" }}>{section.title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-soft)" }}>{section.description}</p>
          </a>
        ))}
      </div>
    </ClinicShell>
  );
}
