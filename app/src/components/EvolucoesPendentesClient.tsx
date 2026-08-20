"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentCertificateSelector, useAgent, type AgentCertificate } from "@/components/AgentDetector";
import { signEvolutionAsDentist } from "@/lib/evolutionDentistSigningClient";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatBRDate } from "@/lib/date";
import styles from "@/styles/shell.module.css";

interface EvolutionRow {
  id: string;
  evolution_date: string;
  text: string;
  patient_id: string;
  patient_name: string;
  treatment_name: string;
  tooth_region: string | null;
}

const TRUNCATE_LENGTH = 140;

export function EvolucoesPendentesClient({
  clinicId,
  dentistCpf,
  initialRows,
}: {
  clinicId: string;
  dentistCpf: string | null;
  initialRows: EvolutionRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { signHash } = useAgent();
  const { toasts, push, dismiss } = useToasts();

  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
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

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className={styles.panelHeaderTitle}>{rows.length} pendente(s)</p>
        <button
          type="button"
          disabled={selected.size === 0 || progress !== null}
          onClick={() => startSigning([...selected])}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          {progress ? `Assinando ${progress.done}/${progress.total}…` : `Assinar selecionadas (${selected.size})`}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>Nenhuma evolução pendente de assinatura da dentista.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todas" />
              </th>
              <th>Paciente</th>
              <th>Tratamento</th>
              <th>Data</th>
              <th>Evolução</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const preview = r.text.length > TRUNCATE_LENGTH ? `${r.text.slice(0, TRUNCATE_LENGTH).trimEnd()}…` : r.text;
              return (
                <tr key={r.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`Selecionar evolução de ${r.patient_name}`} />
                  </td>
                  <td className={styles.rowTitle} data-label="Paciente">
                    {r.patient_name}
                  </td>
                  <td data-label="Tratamento">{r.tooth_region ? `${r.tooth_region} — ${r.treatment_name}` : r.treatment_name}</td>
                  <td data-label="Data">{formatBRDate(`${r.evolution_date}T12:00:00-03:00`)}</td>
                  <td data-label="Evolução" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                    {preview}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={progress !== null}
                      onClick={() => startSigning([r.id])}
                      style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                    >
                      Assinar
                    </button>
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
