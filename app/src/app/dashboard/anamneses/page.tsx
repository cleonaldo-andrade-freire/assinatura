import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { StopPropagationTd } from "@/components/ui/StopPropagation";
import { ConversationRowActions } from "@/components/ConversationRowActions";
import { countMonthlyAnamneses } from "@/lib/usage";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import type { Conversation, QuestionTemplate } from "@/lib/database.types";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewAnamnesisTrigger } from "@/components/NewAnamnesisTrigger";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 5;

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function AnamnesesPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; status?: string; new?: string };
}) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status === "signed" || searchParams.status === "pending" ? searchParams.status : "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const [
    { count: totalCount },
    { count: signedCount },
    { data: signatures },
    { data: activeConversations },
    { data: patientsData },
    usedThisMonth,
    { data: templatesData },
  ] = await Promise.all([
    supabase.from("anamneses").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    supabase.from("signatures").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    supabase.from("signatures").select("id, anamnesis_id").eq("clinic_id", clinic.id),
    supabase
      .from("conversations")
      .select("*")
      .eq("clinic_id", clinic.id)
      .in("status", ["active", "abandoned"])
      .order("created_at", { ascending: false }),
    supabase.from("patients").select("id, cpf, phone").eq("clinic_id", clinic.id),
    countMonthlyAnamneses(supabase, clinic.id),
    supabase.from("question_templates").select("*").eq("clinic_id", clinic.id).order("created_at", { ascending: false }),
  ]);

  const signatureByAnamnesis = new Map((signatures ?? []).map((s) => [s.anamnesis_id, s.id]));
  const signedIds = Array.from(signatureByAnamnesis.keys());
  const conversations = (activeConversations as Conversation[]) ?? [];

  // anamneses é anterior à tabela `patients` — não tem FK. Resolve pra foto
  // por telefone (sempre presente no motor de conversa via WhatsApp, mesmo
  // quando o CPF não foi coletado) e por CPF como reforço (só dígitos, pra
  // não depender de como cada lado formatou a máscara) — mesmo critério de
  // telefone já usado na aba Anamneses da ficha do paciente.
  const patientIdByPhone = new Map<string, string>();
  const patientIdByCpf = new Map<string, string>();
  for (const p of patientsData ?? []) {
    if (p.phone) patientIdByPhone.set(p.phone, p.id);
    const digits = onlyDigits(p.cpf);
    if (digits) patientIdByCpf.set(digits, p.id);
  }

  let query = supabase
    .from("anamneses")
    .select("id, token, patient_name, patient_cpf, patient_phone, created_at", { count: "exact" })
    .eq("clinic_id", clinic.id);
  if (q) query = query.ilike("patient_name", `%${q}%`);
  if (status === "signed") {
    query = signedIds.length > 0 ? query.in("id", signedIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (status === "pending" && signedIds.length > 0) {
    query = query.not("id", "in", `(${signedIds.join(",")})`);
  }
  const { data: anamneses, count } = await query.order("created_at", { ascending: false }).range(from, to);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const activeConversationCount = conversations.filter((c) => c.status === "active").length;
  const pendingCount = (totalCount ?? 0) - (signedCount ?? 0);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `/dashboard/anamneses?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Anamneses"
      subtitle="Todas as anamneses recebidas pela clínica"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/templates" className={`${styles.btn} ${styles.btnGhost}`}>
            Modelos de anamnese
          </Link>
          <NewAnamnesisTrigger
            clinicId={clinic.id}
            templates={(templatesData as QuestionTemplate[]) ?? []}
            className={`${styles.btn} ${styles.btnPrimary}`}
            autoOpen={searchParams.new === "1"}
          >
            + Nova anamnese
          </NewAnamnesisTrigger>
        </div>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{usedThisMonth}</div>
          <div className={styles.statLabel}>Anamneses este mês</div>
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
          <div className={styles.statValue}>{activeConversationCount}</div>
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
                <th>Status</th>
                <th>Progresso</th>
                <th>Última resposta</th>
                <th>Atividade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const total = c.questions.length;
                const pct = total > 0 ? Math.round((c.current_index / total) * 100) : 0;
                const lastAnswer = c.answers[c.answers.length - 1];
                return (
                  <tr key={c.id}>
                    <td className={styles.rowTitle}>{c.patient_name}</td>
                    <td data-label="Status">
                      {c.status === "abandoned" ? (
                        <span className={`${styles.statusDot} ${styles.statusDanger}`}>Cancelada</span>
                      ) : (
                        <span className={`${styles.statusDot} ${styles.statusWarn}`}>Aguardando</span>
                      )}
                    </td>
                    <td data-label="Progresso">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 999,
                            background: "var(--surface-sunken)",
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)" }} />
                        </div>
                        <span style={{ fontSize: 12.5, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                          {c.current_index}/{total}
                        </span>
                      </div>
                    </td>
                    <td data-label="Última resposta" style={{ maxWidth: 220, color: "var(--ink-soft)", fontSize: 13 }}>
                      {lastAnswer ? (
                        <span title={`${lastAnswer.question}: ${lastAnswer.answer}`}>{lastAnswer.answer}</span>
                      ) : (
                        "Sem resposta ainda"
                      )}
                    </td>
                    <td data-label="Atividade" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                      {formatBRDateTime(c.updated_at)}
                    </td>
                    <td>
                      <ConversationRowActions clinicId={clinic.id} conversationId={c.id} status={c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Todas as anamneses</p>
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className={styles.searchBox}>
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
            </div>
            <select name="status" defaultValue={status} className={styles.select} style={{ width: "auto" }}>
              <option value="">Todos os status</option>
              <option value="signed">Assinadas</option>
              <option value="pending">Pendentes</option>
            </select>
            <button type="submit" className={`${styles.btn} ${styles.btnGhost}`}>
              Filtrar
            </button>
          </form>
        </div>

        {!anamneses || anamneses.length === 0 ? (
          <div className={styles.emptyState}>
            {q || status
              ? `Nenhuma anamnese encontrada${q ? ` pra "${q}"` : ""}${status ? " com esse filtro" : ""}.`
              : "Nenhuma anamnese registrada ainda."}
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
                    <ClickableRow key={a.id} href={`/dashboard/anamneses/${a.id}`}>
                      <td>
                        <span className={styles.rowMain}>
                          <PatientAvatar
                            clinicId={clinic.id}
                            patientId={
                              (a.patient_phone && patientIdByPhone.get(a.patient_phone)) ||
                              patientIdByCpf.get(onlyDigits(a.patient_cpf)) ||
                              null
                            }
                            name={a.patient_name}
                            size={28}
                            radius="7px"
                            tone="brand"
                            label={initials(a.patient_name)}
                          />
                          <span className={styles.rowTitle}>{a.patient_name}</span>
                        </span>
                      </td>
                      <td data-label="Data">{formatBRDate(a.created_at)}</td>
                      <td data-label="Status">
                        {signatureId ? (
                          <span className={`${styles.statusDot} ${styles.statusOk}`}>Assinado</span>
                        ) : (
                          <span className={`${styles.statusDot} ${styles.statusWarn}`}>Pendente</span>
                        )}
                      </td>
                      <StopPropagationTd>
                        <Link href={`/dashboard/anamneses/${a.id}`}>Ver detalhes</Link>
                        {" · "}
                        {signatureId ? (
                          <a href={`/api/pdf/${signatureId}`} target="_blank" rel="noreferrer">
                            Baixar PDF
                          </a>
                        ) : (
                          <a href={`/assinatura?token=${a.token}`} target="_blank" rel="noreferrer">
                            Link de assinatura
                          </a>
                        )}
                      </StopPropagationTd>
                    </ClickableRow>
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
