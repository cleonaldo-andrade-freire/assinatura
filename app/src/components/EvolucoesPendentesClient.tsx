"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentCertificateSelector, useAgent, type AgentCertificate } from "@/components/AgentDetector";
import { signEvolutionAsDentist } from "@/lib/evolutionDentistSigningClient";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatTimestampBR, formatDateOnlyBR } from "@/lib/date";
import type { EvolutionSignatureStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

interface EvolutionRow {
  id: string;
  evolution_date: string;
  text: string;
  patient_id: string;
  patient_name: string;
  treatment_name: string;
  tooth_region: string | null;
  signature_status: EvolutionSignatureStatus;
}

const TRUNCATE_LENGTH = 140;

const PATIENT_STATUS_LABEL: Record<EvolutionSignatureStatus, string> = {
  nao_solicitada: "Não enviada",
  solicitada: "Aguardando paciente",
  assinada: "Paciente assinou",
  recusada: "Recusada",
  expirada: "Link expirado",
};

function SignIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WaiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path d="M5.6 5.6l12.8 12.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.5 8.5 0 01-12.36 7.56L3 21l2.02-5.4A8.5 8.5 0 1121 11.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EvolucoesPendentesClient({
  clinicId,
  dentistCpf,
  initialRows,
  showWaived,
}: {
  clinicId: string;
  dentistCpf: string | null;
  initialRows: EvolutionRow[];
  /** Filtro "Dispensadas" — evoluções em que a assinatura do paciente foi dispensada (migration 072). */
  showWaived: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const { signHash } = useAgent();
  const { toasts, push, dismiss } = useToasts();

  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  // Só dá pra contra-assinar depois que o paciente assinou (ver
  // evolutionDentistSignature.ts) — as demais linhas não entram na seleção.
  const signableIds = rows.filter((r) => r.signature_status === "assinada").map((r) => r.id);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === signableIds.length ? new Set() : new Set(signableIds)));
  }

  function startSigning(ids: string[]) {
    if (!isLocalAgentMode) {
      push("Este recurso exige o Agente de Assinatura Digital local — configure em Configurações.", "error");
      return;
    }
    if (ids.length === 0) return;
    setQueue(ids);
    setShowAgentSelector(true);
  }

  async function handleSendToPatient(row: EvolutionRow) {
    setSendingId(row.id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatment-evolutions/${row.id}/solicitar-assinatura`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao enviar pelo WhatsApp. Tenta de novo.", "error");
        return;
      }
      // Solicitar desfaz a dispensa no servidor — no filtro "Dispensadas" a
      // linha deixa de pertencer à lista.
      setRows((prev) =>
        showWaived ? prev.filter((r) => r.id !== row.id) : prev.map((r) => (r.id === row.id ? { ...r, signature_status: "solicitada" } : r))
      );
      push(`Pedido de assinatura enviado por WhatsApp a ${row.patient_name}.`, "success");
    } finally {
      setSendingId(null);
    }
  }

  async function handleToggleWaived(row: EvolutionRow) {
    setWaivingId(row.id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatment-evolutions/${row.id}/dispensar-assinatura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waived: !showWaived }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao atualizar. Tenta de novo.", "error");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      push(
        showWaived
          ? `Evolução de ${row.patient_name} voltou para as pendentes.`
          : `Assinatura dispensada — evolução de ${row.patient_name} movida para "Dispensadas".`,
        "success"
      );
    } finally {
      setWaivingId(null);
    }
  }

  async function runQueue(cert: AgentCertificate, ids: string[]) {
    setShowAgentSelector(false);
    setProgress({ done: 0, total: ids.length });
    let signedCount = 0;
    let sentCount = 0;
    const failures: string[] = [];

    for (const id of ids) {
      const result = await signEvolutionAsDentist(clinicId, id, cert, signHash);
      if (result.ok) {
        signedCount++;
        if (result.sentToPatient) sentCount++;
        setRows((prev) => prev.filter((r) => r.id !== id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        const row = rows.find((r) => r.id === id);
        failures.push(`${row?.patient_name ?? id}: ${result.error}`);
      }
      setProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : null));
    }

    setProgress(null);
    setQueue(null);

    if (signedCount > 0) {
      push(
        `${signedCount} evolução(ões) assinada(s)${sentCount > 0 ? ` — ${sentCount} enviada(s) ao paciente por WhatsApp` : ""}.`,
        "success"
      );
    }
    if (failures.length > 0) {
      push(`Falha em ${failures.length}: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`, "error");
    }
    router.refresh();
  }

  const allSelected = signableIds.length > 0 && selected.size === signableIds.length;

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        <Link href="/dashboard/evolucoes" className={`${styles.tabBtn} ${!showWaived ? styles.tabBtnActive : ""}`}>
          Pendentes
        </Link>
        <Link href="/dashboard/evolucoes?filtro=dispensadas" className={`${styles.tabBtn} ${showWaived ? styles.tabBtnActive : ""}`}>
          Dispensadas
        </Link>
      </div>

      <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className={styles.panelHeaderTitle}>{showWaived ? `${rows.length} dispensada(s)` : `${rows.length} pendente(s)`}</p>
        {!showWaived && (
          <button
            type="button"
            disabled={selected.size === 0 || progress !== null}
            onClick={() => startSigning([...selected])}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {progress ? `Assinando ${progress.done}/${progress.total}…` : `Assinar selecionadas (${selected.size})`}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          {showWaived ? "Nenhuma evolução com assinatura dispensada." : "Nenhuma evolução pendente de assinatura da dentista."}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={signableIds.length === 0}
                  onChange={toggleAll}
                  aria-label="Selecionar todas as assinadas pelo paciente"
                />
              </th>
              <th>Paciente</th>
              <th>Tratamento</th>
              <th>Data</th>
              <th>Evolução</th>
              <th>Assinatura do paciente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const preview = r.text.length > TRUNCATE_LENGTH ? `${r.text.slice(0, TRUNCATE_LENGTH).trimEnd()}…` : r.text;
              const patientSigned = r.signature_status === "assinada";
              return (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      disabled={!patientSigned}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Selecionar evolução de ${r.patient_name}`}
                      title={patientSigned ? undefined : "Aguardando o paciente assinar"}
                    />
                  </td>
                  <td className={styles.rowTitle} data-label="Paciente">
                    {r.patient_name}
                  </td>
                  <td data-label="Tratamento">{r.tooth_region ? `${r.tooth_region} — ${r.treatment_name}` : r.treatment_name}</td>
                  <td data-label="Data">{formatDateOnlyBR(r.evolution_date)}</td>
                  <td data-label="Evolução" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                    {preview}
                  </td>
                  <td data-label="Assinatura do paciente">
                    <span
                      className={`${styles.statusBadge} ${
                        patientSigned
                          ? styles.statusOk
                          : r.signature_status === "recusada" || r.signature_status === "expirada"
                          ? styles.statusDanger
                          : styles.statusWarn
                      }`}
                    >
                      {PATIENT_STATUS_LABEL[r.signature_status]}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {!patientSigned && (
                        <button
                          type="button"
                          disabled={sendingId === r.id || progress !== null}
                          onClick={() => handleSendToPatient(r)}
                          className={styles.iconActionBtn}
                          title={
                            sendingId === r.id
                              ? "Enviando…"
                              : r.signature_status === "nao_solicitada"
                              ? "Enviar ao paciente para assinar por WhatsApp"
                              : "Reenviar ao paciente para assinar por WhatsApp"
                          }
                          aria-label="Enviar ao paciente para assinar por WhatsApp"
                        >
                          <WhatsAppIcon />
                        </button>
                      )}
                      {!patientSigned && (
                        <button
                          type="button"
                          disabled={waivingId === r.id || progress !== null}
                          onClick={() => handleToggleWaived(r)}
                          className={styles.iconActionBtn}
                          title={showWaived ? "Voltar para as pendentes" : "Dispensar assinatura do paciente (sai da lista)"}
                          aria-label={showWaived ? "Voltar para as pendentes" : "Dispensar assinatura do paciente"}
                        >
                          {showWaived ? <RestoreIcon /> : <WaiveIcon />}
                        </button>
                      )}
                      {!showWaived && (
                        <button
                          type="button"
                          disabled={!patientSigned || progress !== null}
                          onClick={() => startSigning([r.id])}
                          className={styles.iconActionBtn}
                          style={patientSigned ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
                          title={patientSigned ? "Assinar como dentista" : "Aguardando o paciente assinar"}
                          aria-label="Assinar como dentista"
                        >
                          <SignIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AgentCertificateSelector
        open={showAgentSelector}
        onOpenChange={(open) => {
          setShowAgentSelector(open);
          if (!open) setQueue(null);
        }}
        onCertificateSelected={(cert) => {
          if (queue) runQueue(cert, queue);
        }}
        requiredCpf={dentistCpf ?? undefined}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
