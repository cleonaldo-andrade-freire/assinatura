"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatBRDate } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

interface OpenTreatment {
  id: string;
  treatment_name: string;
  tooth_region: string | null;
  price: number;
  created_at: string;
}

function ToothIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3c-2 0-3.5 1.7-3.5 4 0 3 1.3 4.2 1.3 7.5 0 2.5 0.9 4.5 2.2 4.5 1.4 0 1.4-3.3 2-6 0.6 2.7 0.6 6 2 6 1.3 0 2.2-2 2.2-4.5 0-3.3 1.3-4.5 1.3-7.5 0-2.3-1.5-4-3.5-4-1 0-1.7 0.6-2 1.3C9.7 3.6 9 3 8 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Link "N tratamentos em aberto" no detalhe do agendamento — abre um modal
 * só de leitura com o resumo (nome, região, valor, desde quando). Existe
 * pra dentista saber do que se trata a consulta sem precisar abrir a ficha
 * do paciente antes; o campo de observação do agendamento fica livre pras
 * observações de verdade, sem essa sugestão automática disputando espaço.
 */
export function OpenTreatmentsSummary({ clinicId, patientId }: { clinicId: string; patientId: string | null }) {
  const [treatments, setTreatments] = useState<OpenTreatment[] | null>(null);
  const [open, setOpen] = useState(false);

  useEscapeToClose(() => setOpen(false), open);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    fetch(`/api/clinics/${clinicId}/patients/${patientId}/treatments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { treatments?: OpenTreatment[] } | null) => {
        if (!cancelled) setTreatments(data?.treatments ?? []);
      })
      .catch(() => {
        if (!cancelled) setTreatments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, patientId]);

  if (!treatments || treatments.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // O botão vive dentro do bloco clicável que abre a ficha do
          // paciente (ver AppointmentDetailBody) — sem isso, o clique
          // borbulhava e navegava por cima do modal recém-aberto.
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--attending-tint)",
          color: "var(--attending)",
          border: "1px solid transparent",
          borderRadius: "var(--radius-sm)",
          padding: "5px 10px",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        <ToothIcon />
        {treatments.length} tratamento{treatments.length === 1 ? "" : "s"} em aberto
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => setOpen(false)}>
            <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3 className={uiStyles.dialogTitle}>Tratamentos em aberto</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {treatments.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-sunken)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
                      {t.tooth_region ? `${t.tooth_region} — ` : ""}
                      {t.treatment_name}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                      R$ {formatMoneyDisplay(t.price)} · em aberto desde {formatBRDate(t.created_at)}
                    </div>
                  </div>
                ))}
              </div>
              <div className={uiStyles.dialogActions} style={{ marginTop: 16 }}>
                <button type="button" onClick={() => setOpen(false)} className={uiStyles.dialogBtnGhost}>
                  Fechar
                </button>
                {patientId && (
                  <a href={`/dashboard/pacientes/${patientId}?tab=tratamentos`} className={uiStyles.dialogBtnPrimary}>
                    Ver na ficha do paciente
                  </a>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
