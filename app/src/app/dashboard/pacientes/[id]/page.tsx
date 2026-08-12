import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PatientForm } from "@/components/PatientForm";
import { Pagination } from "@/components/ui/Pagination";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import type { Anamnesis, Certificate, Patient, Prescription } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const DOCS_PAGE_SIZE = 5;

export default async function EditPatientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string; rxPage?: string };
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

  // Não existe `patient_id` em `anamneses` (tabela bem mais antiga, com histórico
  // real de antes do cadastro de pacientes existir) — o vínculo aqui é por
  // telefone, que já é a mesma chave usada por `upsertPatientFromContact` pra
  // não duplicar paciente ao iniciar uma anamnese nova.
  let anamneses: Anamnesis[] = [];
  let signedAnamnesisIds = new Set<string>();
  if (patient.phone) {
    const { data: anamnesesData } = await supabase
      .from("anamneses")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("patient_phone", patient.phone)
      .order("created_at", { ascending: false });
    anamneses = (anamnesesData as Anamnesis[]) ?? [];

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

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title={patient.name}>
      <PatientForm clinicId={clinic.id} patient={patient} />

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Anamneses deste paciente</p>
        </div>
        {!patient.phone ? (
          <div className={styles.emptyState}>Cadastre o WhatsApp do paciente pra ver as anamneses vinculadas.</div>
        ) : anamneses.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma anamnese registrada pra este telefone ainda.</div>
        ) : (
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
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Atestados deste paciente</p>
        </div>
        {certificates.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhum atestado emitido pra este paciente ainda — só aparecem aqui os emitidos buscando ou cadastrando
            pelo nome dele.
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
              hrefFor={(p) => `/dashboard/pacientes/${patient.id}?page=${p}`}
            />
          </>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Prescrições deste paciente</p>
        </div>
        {prescriptions.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhuma prescrição emitida pra este paciente ainda — só aparecem aqui as emitidas buscando ou
            cadastrando pelo nome dele.
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
              hrefFor={(p) => `/dashboard/pacientes/${patient.id}?rxPage=${p}`}
            />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
