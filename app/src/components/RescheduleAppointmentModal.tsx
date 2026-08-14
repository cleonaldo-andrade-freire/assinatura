"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { buildDaySlotTimes, slotKey } from "@/lib/appointments";
import { brDateOnly, formatBRTime } from "@/lib/date";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

/** Remarcar em modal, não mais inline no card de Ações — mesmo padrão do resto do projeto. */
export function RescheduleAppointmentModal({
  open,
  onClose,
  scheduledAt,
  durationMinutes,
  saving,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  scheduledAt: string;
  durationMinutes: number;
  saving: boolean;
  onConfirm: (newTime: string, newDuration: number) => void;
}) {
  // scheduledAt vem do banco como "...+00:00"; os <option> da grade de
  // horário são gerados via Date.toISOString() ("...000Z") — precisa
  // normalizar pros dois lados baterem, senão o select abre sem nada
  // pré-selecionado (mesmo bug de fundo que fazia o agendamento sumir da
  // grade/lista).
  const [newDate, setNewDate] = useState(brDateOnly(new Date(scheduledAt)));
  const [newTime, setNewTime] = useState(slotKey(scheduledAt));
  const [newDuration, setNewDuration] = useState(durationMinutes);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setNewDate(brDateOnly(new Date(scheduledAt)));
    setNewTime(slotKey(scheduledAt));
    setNewDuration(durationMinutes);
  }, [open, scheduledAt, durationMinutes]);

  // Mesma lógica do formulário de criação — filtra horários que já passaram
  // pra não oferecer uma remarcação que o servidor vai recusar.
  const slots = buildDaySlotTimes(newDate).filter((s) => new Date(s).getTime() > Date.now());

  useEffect(() => {
    if (newTime && !slots.includes(newTime)) setNewTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate]);

  if (!open || typeof document === "undefined") return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newTime) return;
    onConfirm(newTime, newDuration);
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Remarcar agendamento</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="rescheduleDate" className={styles.label}>
                Nova data
              </label>
              <input
                id="rescheduleDate"
                type="date"
                className={styles.input}
                value={newDate}
                min={brDateOnly()}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setNewTime("");
                }}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="rescheduleTime" className={styles.label}>
                Novo horário
              </label>
              <select id="rescheduleTime" className={styles.select} value={newTime} onChange={(e) => setNewTime(e.target.value)} required>
                <option value="">Selecione…</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {formatBRTime(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="rescheduleDuration" className={styles.label}>
              Duração
            </label>
            <select id="rescheduleDuration" className={styles.select} value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value))}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutos{d === 30 ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !newTime} className={`${styles.btn} ${styles.btnPrimary}`}>
              {saving ? "Remarcando…" : "Confirmar remarcação"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
