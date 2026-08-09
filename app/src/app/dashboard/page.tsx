import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import type { Conversation } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("anamneses")
    .select("id, token, patient_name, created_at", { count: "exact" })
    .eq("clinic_id", clinic.id);
  if (q) query = query.ilike("patient_name", `%${q}%`);
  const { data: anamneses, count } = await query.order("created_at", { ascending: false }).range(from, to);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const [{ count: totalCount }, { count: signedCount }, { data: signatures }, { data: activeConversations }] =
    await Promise.all([
      supabase.from("anamneses").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
      supabase.from("signatures").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
      supabase.from("signatures").select("id, anamnesis_id").eq("clinic_id", clinic.id),
      supabase.from("conversations").select("*").eq("clinic_id", clinic.id).eq("status", "active").order("created_at", { ascending: false }),
    ]);

  const signatureByAnamnesis = new Map((signatures ?? []).map((s) => [s.anamnesis_id, s.id]));
  const conversations = (activeConversations as Conversation[]) ?? [];
  const pendingCount = (totalCount ?? 0) - (signedCount ?? 0);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/dashboard?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Anamneses"
      subtitle="Todas as anamneses recebidas pela clínica"
      actions={
        <Link href="/dashboard/new" className={`${styles.btn} ${styles.btnPrimary}`}>
          + Nova anamnese
        </Link>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalCount ?? 0}</div>
          <div className={styles.statLabel}>Total de anamneses</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{signedCount ?? 0}</div>
          <div className={styles.statLabel}>Assinadas</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{pendingCount}</div>
          <div className={styles.statLabel}>Pendentes</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{conversations.length}</div>
          <div className={styles.statLabel}>Em andamento</div>
        </div>
      </div>

      {conversations.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Em andamento</p>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Progresso</th>
                <th>Iniciada em</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id}>
                  <td>{c.patient_name}</td>
                  <td>
                    {c.current_index}/{c.questions.length} perguntas
                  </td>
                  <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Todas as anamneses</p>
          <form method="GET" className={styles.searchBox}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar por paciente…"
              className={styles.searchInput}
            />
          </form>
        </div>

        {!anamneses || anamneses.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? `Nenhuma anamnese encontrada pra "${q}".` : "Nenhuma anamnese registrada ainda."}
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {anamneses.map((a) => {
                  const signatureId = signatureByAnamnesis.get(a.id);
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className={styles.rowMain}>
                          <div className={styles.rowAvatarPlaceholder}>{initials(a.patient_name)}</div>
                          <span className={styles.rowTitle}>{a.patient_name}</span>
                        </div>
                      </td>
                      <td>{new Date(a.created_at).toLocaleDateString("pt-BR")}</td>
                      <td>
                        {signatureId ? (
                          <span className={`${styles.statusDot} ${styles.statusOk}`}>Assinado</span>
                        ) : (
                          <span className={`${styles.statusDot} ${styles.statusWarn}`}>Pendente</span>
                        )}
                      </td>
                      <td>
                        {signatureId ? (
                          <a href={`/api/pdf/${signatureId}`} target="_blank" rel="noreferrer">
                            Baixar PDF
                          </a>
                        ) : (
                          <a href={`/assinatura?token=${a.token}`} target="_blank" rel="noreferrer">
                            Link de assinatura
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Página {page} de {totalPages} — {count} anamnese{count === 1 ? "" : "s"}
                </span>
                <div className={styles.paginationLinks}>
                  <a
                    href={pageHref(Math.max(1, page - 1))}
                    className={`${styles.pageLink} ${page === 1 ? styles.pageLinkDisabled : ""}`}
                  >
                    ‹
                  </a>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p} style={{ display: "flex", gap: 6 }}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <span className={styles.paginationInfo} style={{ padding: "0 2px" }}>
                            …
                          </span>
                        )}
                        <a href={pageHref(p)} className={`${styles.pageLink} ${p === page ? styles.pageLinkActive : ""}`}>
                          {p}
                        </a>
                      </span>
                    ))}
                  <a
                    href={pageHref(Math.min(totalPages, page + 1))}
                    className={`${styles.pageLink} ${page === totalPages ? styles.pageLinkDisabled : ""}`}
                  >
                    ›
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClinicShell>
  );
}
