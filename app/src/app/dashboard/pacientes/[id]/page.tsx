import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PatientForm } from "@/components/PatientForm";
import { Pagination } from "@/components/ui/Pagination";
import { PatientTabs } from "@/components/PatientTabs";
import { PATIENT_TABS, STAFF_ALLOWED_TAB_KEYS, type PatientTabKey } from "@/lib/patientTabs";
import { NewBudgetTrigger } from "@/components/budgets/NewBudgetTrigger";
import { BudgetRowActions } from "@/components/budgets/BudgetRowActions";
import { TreatmentsPanel } from "@/components/treatments/TreatmentsPanel";
import { DebitsPanel } from "@/components/debits/DebitsPanel";
import { PatientImagesPanel } from "@/components/patientImages/PatientImagesPanel";
import { AppointmentDetailTrigger } from "@/components/dashboard/AppointmentDetailTrigger";
import { NewAnamnesisTrigger } from "@/components/NewAnamnesisTrigger";
import { NewCertificateTrigger } from "@/components/NewCertificateTrigger";
import { NewPrescriptionTrigger } from "@/components/NewPrescriptionTrigger";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_LABEL } from "@/lib/appointments";
import type {
  Anamnesis,
  Appointment,
  Budget,
  BudgetItem,
  Certificate,
  CertificateTemplate,
  Patient,
  Prescription,
  PrescriptionTemplate,
  QuestionTemplate,
  Treatment,
  TreatmentDebit,
} from "@/lib/database.types";
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
    dbPage?: string;
    dbPaidPage?: string;
    tab?: string;
  };
}) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) notFound();
  const patient = data as Patient;

  const dentistConfigured = !!(clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf);
  const [{ data: certificateTemplatesData }, { data: prescriptionTemplatesData }, { data: questionTemplatesData }] = await Promise.all([
    supabase.from("certificate_templates").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
    supabase.from("prescription_templates").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
    supabase.from("question_templates").select("*").eq("clinic_id", clinic.id).order("created_at", { ascending: false }),
  ]);
  const certificateTemplates = (certificateTemplatesData as CertificateTemplate[]) ?? [];
  const prescriptionTemplates = (prescriptionTemplatesData as PrescriptionTemplate[]) ?? [];
  const questionTemplates = (questionTemplatesData as QuestionTemplate[]) ?? [];

  const requestedTab: PatientTabKey = isTabKey(searchParams.tab) ? searchParams.tab : "agendamentos";
  const activeTab: PatientTabKey =
    role === "staff" && !STAFF_ALLOWED_TAB_KEYS.has(requestedTab) ? "agendamentos" : requestedTab;
  // Preserva a aba atual nos links de paginação — sem isso, paginar dentro
  // de "Atestados" te devolvia na recarga com a aba "Anamneses" em foco.
  function pageHref(base: string, extra: Record<string, string | number>) {
    const p = new URLSearchParams({ ...extra, tab: activeTab } as Record<string, string>);
    return `${base}?${p.toString()}`;
  }

  // Documentos clínicos (atestados/prescrições/orçamentos/anamneses) só
  // consultam o banco pra owner — pra staff, nem os dados chegam a existir
  // no RSC payload enviado ao navegador (esconder só a aba não bastava).
  const certificatesPage = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const certFrom = (certificatesPage - 1) * DOCS_PAGE_SIZE;
  const certTo = certFrom + DOCS_PAGE_SIZE - 1;
  let certificates: Certificate[] = [];
  let certificatesCount = 0;
  if (role === "owner") {
    const { data: certificatesData, count } = await supabase
      .from("certificates")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinic.id)
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .range(certFrom, certTo);
    certificates = (certificatesData as Certificate[]) ?? [];
    certificatesCount = count ?? 0;
  }
  const certificatesTotalPages = Math.max(1, Math.ceil(certificatesCount / DOCS_PAGE_SIZE));

  const prescriptionsPage = Math.max(1, parseInt(searchParams.rxPage ?? "1", 10) || 1);
  const rxFrom = (prescriptionsPage - 1) * DOCS_PAGE_SIZE;
  const rxTo = rxFrom + DOCS_PAGE_SIZE - 1;
  let prescriptions: Prescription[] = [];
  let prescriptionsCount = 0;
  if (role === "owner") {
    const { data: prescriptionsData, count } = await supabase
      .from("prescriptions")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinic.id)
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .range(rxFrom, rxTo);
    prescriptions = (prescriptionsData as Prescription[]) ?? [];
    prescriptionsCount = count ?? 0;
  }
  const prescriptionsTotalPages = Math.max(1, Math.ceil(prescriptionsCount / DOCS_PAGE_SIZE));

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
  let budgets: Budget[] = [];
  let budgetsCount = 0;
  if (role === "owner") {
    const { data: budgetsData, count } = await supabase
      .from("budgets")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinic.id)
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .range(bgFrom, bgTo);
    budgets = (budgetsData as Budget[]) ?? [];
    budgetsCount = count ?? 0;
  }
  const budgetsTotalPages = Math.max(1, Math.ceil(budgetsCount / DOCS_PAGE_SIZE));

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

  const debitsOpenPage = Math.max(1, parseInt(searchParams.dbPage ?? "1", 10) || 1);
  const dbFrom = (debitsOpenPage - 1) * DOCS_PAGE_SIZE;
  const dbTo = dbFrom + DOCS_PAGE_SIZE - 1;
  const { data: openDebitsData, count: openDebitsCount } = await supabase
    .from("treatment_debits")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .eq("status", "aberto")
    .order("created_at", { ascending: false })
    .range(dbFrom, dbTo);
  const openDebits = (openDebitsData as TreatmentDebit[]) ?? [];
  const openDebitsTotalPages = Math.max(1, Math.ceil((openDebitsCount ?? 0) / DOCS_PAGE_SIZE));

  const debitsPaidPage = Math.max(1, parseInt(searchParams.dbPaidPage ?? "1", 10) || 1);
  const dbpFrom = (debitsPaidPage - 1) * DOCS_PAGE_SIZE;
  const dbpTo = dbpFrom + DOCS_PAGE_SIZE - 1;
  const { data: paidDebitsData, count: paidDebitsCount } = await supabase
    .from("treatment_debits")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .eq("status", "pago")
    .order("paid_at", { ascending: false })
    .range(dbpFrom, dbpTo);
  const paidDebits = (paidDebitsData as TreatmentDebit[]) ?? [];
  const paidDebitsTotalPages = Math.max(1, Math.ceil((paidDebitsCount ?? 0) / DOCS_PAGE_SIZE));

  // Totais — soma em JS a partir de um select só do valor (ficha de
  // paciente não tem milhares de débitos, não compensa uma view/RPC só
  // pra isso).
  const { data: openAmountsData } = await supabase
    .from("treatment_debits")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .eq("status", "aberto");
  const totalToReceive = (openAmountsData ?? []).reduce((sum, d) => sum + Number(d.amount), 0);

  const { data: paidAmountsData } = await supabase
    .from("treatment_debits")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", patient.id)
    .eq("status", "pago");
  const totalReceived = (paidAmountsData ?? []).reduce((sum, d) => sum + Number(d.amount), 0);

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
  if (role === "owner" && patient.phone) {
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

  const anamnesesPanel = role !== "owner" ? null : !patient.phone ? (
    <div className={styles.emptyState}>Cadastre o WhatsApp do paciente pra ver as anamneses vinculadas.</div>
  ) : (
    <>
      <div style={{ marginBottom: 14 }}>
        <NewAnamnesisTrigger
          clinicId={clinic.id}
          templates={questionTemplates}
          patientName={patient.name}
          patientPhone={patient.phone}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          + Nova anamnese
        </NewAnamnesisTrigger>
      </div>
      {anamneses.length === 0 ? (
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
      )}
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

  const orcamentosPanel = role !== "owner" ? null : !patient.phone ? (
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

  const debitosPanel = (
    <DebitsPanel
      clinicId={clinic.id}
      patientId={patient.id}
      initialOpenDebits={openDebits}
      openPage={debitsOpenPage}
      openTotalPages={openDebitsTotalPages}
      openCount={openDebitsCount ?? 0}
      totalToReceive={totalToReceive}
      initialPaidDebits={paidDebits}
      paidPage={debitsPaidPage}
      paidTotalPages={paidDebitsTotalPages}
      paidCount={paidDebitsCount ?? 0}
      totalReceived={totalReceived}
    />
  );

  const imagensPanel = <PatientImagesPanel clinicId={clinic.id} patientId={patient.id} />;

  const atestadosPanel = role !== "owner" ? null : (
    <>
      <div style={{ marginBottom: 14 }}>
        <NewCertificateTrigger
          clinicId={clinic.id}
          templates={certificateTemplates}
          dentistConfigured={dentistConfigured}
          patientId={patient.id}
          patientName={patient.name}
          patientCpf={patient.cpf}
          patientPhone={patient.phone}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          + Novo atestado
        </NewCertificateTrigger>
      </div>
      {certificates.length === 0 ? (
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
      )}
    </>
  );

  const prescricoesPanel = role !== "owner" ? null : (
    <>
      <div style={{ marginBottom: 14 }}>
        <NewPrescriptionTrigger
          clinicId={clinic.id}
          templates={prescriptionTemplates}
          dentistConfigured={dentistConfigured}
          patientId={patient.id}
          patientName={patient.name}
          patientCpf={patient.cpf}
          patientPhone={patient.phone}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          + Nova prescrição
        </NewPrescriptionTrigger>
      </div>
      {prescriptions.length === 0 ? (
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
      )}
    </>
  );

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={patient.name}
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <PatientForm clinicId={clinic.id} patient={patient} />

      <PatientTabs
        initialTab={activeTab}
        role={role}
        panels={{
          anamneses: anamnesesPanel,
          agendamentos: agendamentosPanel,
          orcamentos: orcamentosPanel,
          tratamentos: tratamentosPanel,
          debitos: debitosPanel,
          imagens: imagensPanel,
          atestados: atestadosPanel,
          prescricoes: prescricoesPanel,
        }}
      />
    </ClinicShell>
  );
}
