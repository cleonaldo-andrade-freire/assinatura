import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PatientForm } from "@/components/PatientForm";
import { Pagination } from "@/components/ui/Pagination";
import { PatientTabs } from "@/components/PatientTabs";
import { PATIENT_TABS, type PatientTabKey } from "@/lib/patientTabs";
import { NewBudgetTrigger } from "@/components/budgets/NewBudgetTrigger";
import { BudgetRowActions } from "@/components/budgets/BudgetRowActions";
import { TreatmentsPanel } from "@/components/treatments/TreatmentsPanel";
import { PatientImagesPanel } from "@/components/patientImages/PatientImagesPanel";
import { AppointmentDetailTrigger } from "@/components/dashboard/AppointmentDetailTrigger";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_LABEL } from "@/lib/appointments";
import type { Anamnesis, Appointment, Budget, BudgetItem, Certificate, Patient, Prescription, Treatment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const DOCS_PAGE_SIZE = 5;

const BUDGET_STATUS_LABEL = { em_aberto: "Em aberto", aprovado: "Aprovado" } as const;
const BUDGET_STATUS_CLASS = { em_aberto: styles.statusWarn, aprovado: styles.statusOk } as const;

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

function isTabKey(v: string | undefined): v is PatientTabKey {
  return !!v && PATIENT_TABS.some((t) => t.key === v);
}

export default async function EditPatientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    page?: string;
    rxPage?: string;
    apPage?: string;
    anPage?: string;
    bgPage?: string;
    tpPage?: string;
    tpShowFinalized?: string;
    tab?: string;
  };
}) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) notFound();
  const patient = data as Patient;

  const activeTab: PatientTabKey = isTabKey(searchParams.tab) ? searchParams.tab : "agendamentos";
  // Preserva a aba atual nos links de paginação — sem isso, paginar dentro
  // de "Atestados" te devolvia na recarga com a aba "Anamneses" em foco.
  function pageHref(base: string, extra: Record<string, string | number>) {
    const p = new URLSearchParams({ ...extra, tab: activeTab } as Record<string, string>);
    return `${base}?${p.toString()}`;
  }

  const certificatesPage = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const certFrom = (certificatesPage - 1) * DOCS_PAGE_SIZE;
  const certTo = certFrom + DOCS_PAGE_SIZE - 1;
  const { data: certificatesData, count: certificatesCount } = await supabase
    .from("certificates")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .range(certFrom, certTo);
  const certificates = (certificatesData as Certificate[]) ?? [];
  const certificatesTotalPages = Math.max(1, Math.ceil((certificatesCount ?? 0) / DOCS_PAGE_SIZE));

  const prescriptionsPage = Math.max(1, parseInt(searchParams.rxPage ?? "1", 10) || 1);
  const rxFrom = (prescriptionsPage - 1) * DOCS_PAGE_SIZE;
  const rxTo = rxFrom + DOCS_PAGE_SIZE - 1;
  const { data: prescriptionsData, count: prescriptionsCount } = await supabase
    .from("prescriptions")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .range(rxFrom, rxTo);
  const prescriptions = (prescriptionsData as Prescription[]) ?? [];
  const prescriptionsTotalPages = Math.max(1, Math.ceil((prescriptionsCount ?? 0) / DOCS_PAGE_SIZE));

  const appointmentsPage = Math.max(1, parseInt(searchParams.apPage ?? "1", 10) || 1);
  const apFrom = (appointmentsPage - 1) * DOCS_PAGE_SIZE;
  const apTo = apFrom + DOCS_PAGE_SIZE - 1;
  const { data: appointmentsData, count: appointmentsCount } = await supabase
    .from("appointments")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .order("scheduled_at", { ascending: false })
    .range(apFrom, apTo);
  const appointments = (appointmentsData as Appointment[]) ?? [];
  const appointmentsTotalPages = Math.max(1, Math.ceil((appointmentsCount ?? 0) / DOCS_PAGE_SIZE));

  const budgetsPage = Math.max(1, parseInt(searchParams.bgPage ?? "1", 10) || 1);
  const bgFrom = (budgetsPage - 1) * DOCS_PAGE_SIZE;
  const bgTo = bgFrom + DOCS_PAGE_SIZE - 1;
  const { data: budgetsData, count: budgetsCount } = await supabase
    .from("budgets")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .range(bgFrom, bgTo);
  const budgets = (budgetsData as Budget[]) ?? [];
  const budgetsTotalPages = Math.max(1, Math.ceil((budgetsCount ?? 0) / DOCS_PAGE_SIZE));

  // Valor por orçamento (soma dos itens selecionados menos desconto) — busca
  // os itens dos orçamentos desta página numa query só, em vez de N+1.
  const budgetTotalById = new Map<string, number>();
  if (budgets.length > 0) {
    const { data: budgetItemsData } = await supabase
      .from("budget_items")
      .select("budget_id, price, selected")
      .in(
        "budget_id",
        budgets.map((b) => b.id)
      );
    const items = (budgetItemsData as Pick<BudgetItem, "budget_id" | "price" | "selected">[]) ?? [];
    for (const b of budgets) {
      const selectedValue = items.filter((i) => i.budget_id === b.id && i.selected).reduce((sum, i) => sum + i.price, 0);
      const discountAmount = b.discount_type === "percent" ? (selectedValue * b.discount_value) / 100 : b.discount_value;
      budgetTotalById.set(b.id, Math.max(0, selectedValue - discountAmount));
    }
  }

  const treatmentsPage = Math.max(1, parseInt(searchParams.tpPage ?? "1", 10) || 1);
  const tpFrom = (treatmentsPage - 1) * DOCS_PAGE_SIZE;
  const tpTo = tpFrom + DOCS_PAGE_SIZE - 1;
  const showFinalizedTreatments = searchParams.tpShowFinalized === "1";
  let treatmentsQuery = supabase
    .from("treatments")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id);
  if (!showFinalizedTreatments) treatmentsQuery = treatmentsQuery.eq("status", "aberto");
  const { data: treatmentsData, count: treatmentsCount } = await treatmentsQuery
    .order("created_at", { ascending: false })
    .range(tpFrom, tpTo);
  const treatments = (treatmentsData as Treatment[]) ?? [];
  const treatmentsTotalPages = Math.max(1, Math.ceil((treatmentsCount ?? 0) / DOCS_PAGE_SIZE));

  // Não existe `patient_id` em `anamneses` (tabela bem mais antiga, com histórico
  // real de antes do cadastro de pacientes existir) — o vínculo aqui é por
  // telefone, que já é a mesma chave usada por `upsertPatientFromContact` pra
  // não duplicar paciente ao iniciar uma anamnese nova.
  const anamnesesPage = Math.max(1, parseInt(searchParams.anPage ?? "1", 10) || 1);
  const anFrom = (anamnesesPage - 1) * DOCS_PAGE_SIZE;
  const anTo = anFrom + DOCS_PAGE_SIZE - 1;
  let anamneses: Anamnesis[] = [];
  let anamnesesCount = 0;
  let signedAnamnesisIds = new Set<string>();
  if (patient.phone) {
    const { data: anamnesesData, count } = await supabase
      .from("anamneses")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinic.id)
      .eq("patient_phone", patient.phone)
      .order("created_at", { ascending: false })
      .range(anFrom, anTo);
    anamneses = (anamnesesData as Anamnesis[]) ?? [];
    anamnesesCount = count ?? 0;

    if (anamneses.length > 0) {
      const { data: signaturesData } = await supabase
        .from("signatures")
        .select("anamnesis_id")
        .in(
          "anamnesis_id",
          anamneses.map((a) => a.id)
        );
      signedAnamnesisIds = new Set((signaturesData ?? []).map((s) => s.anamnesis_id));
    }
  }
  const anamnesesTotalPages = Math.max(1, Math.ceil(anamnesesCount / DOCS_PAGE_SIZE));

  const anamnesesPanel = !patient.phone ? (
    <div className={styles.emptyState}>Cadastre o WhatsApp do paciente pra ver as anamneses vinculadas.</div>
  ) : anamneses.length === 0 ? (
    <div className={styles.emptyState}>Nenhuma anamnese registrada pra este telefone ainda.</div>
  ) : (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {anamneses.map((a) => (
            <tr key={a.id}>
              <td>{formatBRDate(a.created_at)}</td>
              <td>
                {signedAnamnesisIds.has(a.id) ? (
                  <span className={`${styles.statusDot} ${styles.statusOk}`}>Assinada</span>
                ) : (
                  <span className={`${styles.statusDot} ${styles.statusWarn}`}>Pendente</span>
                )}
              </td>
              <td>
                <Link href={`/dashboard/anamneses/${a.id}`}>Ver detalhes</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        page={anamnesesPage}
        totalPages={anamnesesTotalPages}
        count={anamnesesCount}
        itemLabel="anamnese"
        itemLabelPlural="anamneses"
        hrefFor={(p) => pageHref(`/dashboard/pacientes/${patient.id}`, { anPage: p })}
      />
    </>
  );

  const agendamentosPanel =
    appointments.length === 0 ? (
      <div className={styles.emptyState}>Nenhum agendamento pra este paciente ainda.</div>
    ) : (
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data e horário</th>
              <th>Profissional</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id}>
                <td>{formatBRDateTime(a.scheduled_at, "medium")}</td>
                <td>{a.professional_name}</td>
                <td>
                  <span className={`${styles.statusDot} ${styles[APPOINTMENT_STATUS_CLASS[a.status]]}`}>
                    {APPOINTMENT_STATUS_LABEL[a.status]}
                  </span>
                </td>
                <td>
                  <AppointmentDetailTrigger clinicId={clinic.id} appointmentId={a.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={appointmentsPage}
          totalPages={appointmentsTotalPages}
          count={appointmentsCount ?? 0}
          itemLabel="agendamento"
          hrefFor={(p) => pageHref(`/dashboard/pacientes/${patient.id}`, { apPage: p })}
        />
      </>
    );

  const orcamentosPanel = !patient.phone ? (
    <div className={styles.emptyState}>Cadastre o WhatsApp do paciente pra criar um orçamento.</div>
  ) : (
    <>
      <div style={{ marginBottom: 14 }}>
        <NewBudgetTrigger
          clinicId={clinic.id}
          patientId={patient.id}
          patientName={patient.name}
          defaultResponsibleName={clinic.dentist_name || clinic.name}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          + Novo orçamento
        </NewBudgetTrigger>
      </div>
      {budgets.length === 0 ? (
        <div className={styles.emptyState}>Nenhum orçamento criado pra este paciente ainda.</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td>{formatBRDate(`${b.budget_date}T12:00:00-03:00`)}</td>
                  <td className={styles.rowTitle}>{b.description}</td>
                  <td data-label="Valor">{formatMoney(budgetTotalById.get(b.id) ?? 0)}</td>
                  <td data-label="Status">
                    <span className={`${styles.statusDot} ${BUDGET_STATUS_CLASS[b.status]}`}>{BUDGET_STATUS_LABEL[b.status]}</span>
                  </td>
                  <td>
                    <BudgetRowActions clinicId={clinic.id} budgetId={b.id} status={b.status} hasPdf={!!b.pdf_storage_key} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={budgetsPage}
            totalPages={budgetsTotalPages}
            count={budgetsCount ?? 0}
            itemLabel="orçamento"
            hrefFor={(p) => pageHref(`/dashboard/pacientes/${patient.id}`, { bgPage: p })}
          />
        </>
      )}
    </>
  );

  const tratamentosPanel = (
    <TreatmentsPanel
      clinicId={clinic.id}
      patientId={patient.id}
      initialTreatments={treatments}
      page={treatmentsPage}
      totalPages={treatmentsTotalPages}
      count={treatmentsCount ?? 0}
      showFinalized={showFinalizedTreatments}
      toggleShowFinalizedHref={pageHref(`/dashboard/pacientes/${patient.id}`, {
        tpPage: 1,
        ...(showFinalizedTreatments ? {} : { tpShowFinalized: "1" }),
      })}
    />
  );

  const imagensPanel = <PatientImagesPanel clinicId={clinic.id} patientId={patient.id} />;

  const atestadosPanel =
    certificates.length === 0 ? (
      <div className={styles.emptyState}>
        Nenhum atestado emitido pra este paciente ainda — só aparecem aqui os emitidos buscando ou cadastrando pelo
        nome dele.
      </div>
    ) : (
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Dias de afastamento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((c) => (
              <tr key={c.id}>
                <td>{formatBRDate(c.created_at)}</td>
                <td>{c.rest_days}</td>
                <td>
                  <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[c.status]]}`}>
                    {DOCUMENT_STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/atestados/${c.id}`}>Ver detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={certificatesPage}
          totalPages={certificatesTotalPages}
          count={certificatesCount ?? 0}
          itemLabel="atestado"
          hrefFor={(p) => pageHref(`/dashboard/pacientes/${patient.id}`, { page: p })}
        />
      </>
    );

  const prescricoesPanel =
    prescriptions.length === 0 ? (
      <div className={styles.emptyState}>
        Nenhuma prescrição emitida pra este paciente ainda — só aparecem aqui as emitidas buscando ou cadastrando
        pelo nome dele.
      </div>
    ) : (
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Itens</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prescriptions.map((p) => (
              <tr key={p.id}>
                <td>{formatBRDate(p.created_at)}</td>
                <td>{p.items.length}</td>
                <td>
                  <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[p.status]]}`}>
                    {DOCUMENT_STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/prescricoes/${p.id}`}>Ver detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={prescriptionsPage}
          totalPages={prescriptionsTotalPages}
          count={prescriptionsCount ?? 0}
          itemLabel="prescrição"
          hrefFor={(p) => pageHref(`/dashboard/pacientes/${patient.id}`, { rxPage: p })}
        />
      </>
    );

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title={patient.name}>
      <PatientForm clinicId={clinic.id} patient={patient} />

      <PatientTabs
        initialTab={activeTab}
        panels={{
          anamneses: anamnesesPanel,
          agendamentos: agendamentosPanel,
          orcamentos: orcamentosPanel,
          tratamentos: tratamentosPanel,
          imagens: imagensPanel,
          atestados: atestadosPanel,
          prescricoes: prescricoesPanel,
        }}
      />
    </ClinicShell>
  );
}
