"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { buildDaySlotTimes, slotKey } from "@/lib/appointments";
import { brDateOnly, formatBRTime } from "@/lib/date";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function AppointmentActions({
  clinicId,
  appointmentId,
  patientId,
  status,
  urgent,
  scheduledAt,
  durationMinutes,
}: {
  clinicId: string;
  appointmentId: string;
  /** Paciente vinculado — "Iniciar atendimento" leva pra aba Tratamentos da
   * ficha dele. Sem cadastro (só nome/telefone), não tem pra onde navegar. */
  patientId: string | null;
  status: AppointmentStatus;
  urgent: boolean;
  scheduledAt: string;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  // scheduledAt vem do banco como "...+00:00"; os <option> da grade de
  // horário são gerados via Date.toISOString() ("...000Z") — precisa
  // normalizar pros dois lados baterem, senão o select abre sem nada
  // pré-selecionado (mesmo bug de fundo que fazia o agendamento sumir da
  // grade/lista).
  const [newDate, setNewDate] = useState(brDateOnly(new Date(scheduledAt)));
  const [newTime, setNewTime] = useState(slotKey(scheduledAt));
  const [newDuration, setNewDuration] = useState(durationMinutes);
  const [resending, setResending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toasts, push, dismiss } = useToasts();

  // Fecha o menu "⋯ Mais ações" ao clicar fora ou apertar Esc — não é um
  // modal (não usa useEscapeToClose), então trata os dois aqui mesmo.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}/resend`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.error === "send_failed" ? "Falha ao enviar — confira se o WhatsApp da clínica está conectado." : "Falha ao enviar a mensagem.");
        return;
      }
      push("Mensagem de confirmação enviada por WhatsApp.", "success");
    } finally {
      setResending(false);
    }
  }

  async function patch(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao atualizar o agendamento.");
        return false;
      }
      if (successMessage) push(successMessage, "success");
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patch({ scheduled_at: newTime, duration_minutes: newDuration }, "Agendamento remarcado.");
    if (ok) setRescheduling(false);
  }

  async function handleStartAttendance() {
    const ok = await patch({ status: "em_atendimento" }, "Atendimento iniciado.");
    // Leva direto pra aba de Tratamentos da ficha — é lá que o registro do
    // atendimento (evolução, finalização) acontece. Sem paciente cadastrado
    // não tem ficha pra abrir, só atualiza o status mesmo.
    if (ok && patientId) router.push(`/dashboard/pacientes/${patientId}?tab=tratamentos`);
  }

  // Mesma lógica do formulário de criação — filtra horários que já passaram
  // pra não oferecer uma remarcação que o servidor vai recusar.
  const slots = buildDaySlotTimes(newDate).filter((s) => new Date(s).getTime() > Date.now());
  const isTerminal = status === "atendido" || status === "cancelado_paciente" || status === "cancelado_dentista" || status === "faltou";

  useEffect(() => {
    if (newTime && !slots.includes(newTime)) setNewTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate]);

  // Só a ação mais relevante pro status atual fica em destaque — o resto
  // (mais raro/secundário) vai pro menu "⋯", inclusive Cancelar (em
  // vermelho, mas sem competir visualmente com as ações do dia a dia).
  const menuItems: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [];
  if (status === "agendado") {
    menuItems.push({ label: resending ? "Enviando…" : "📲 Enviar confirmação por WhatsApp", onClick: handleResend, disabled: resending });
  }
  if (!isTerminal) {
    // "atendido" já está entre os status terminais (isTerminal), então
    // chegar aqui garante que ainda não foi marcado como atendido.
    menuItems.push({ label: "Marcar como atendido", onClick: () => patch({ status: "atendido" }, "Marcado como atendido.") });
    menuItems.push({ label: "Marcar falta", onClick: () => patch({ status: "faltou" }, "Marcado como falta.") });
    menuItems.push({ label: "Remarcar", onClick: () => setRescheduling(true) });
    menuItems.push({
      label: urgent ? "Remover urgência" : "Marcar como urgência",
      onClick: () => patch({ urgent: !urgent }, urgent ? "Urgência removida." : "Marcado como urgência."),
    });
    menuItems.push({
      label: "Cancelar",
      danger: true,
      onClick: () => patch({ status: "cancelado_dentista" }, "Agendamento cancelado — horário liberado."),
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {status !== "confirmado" && status !== "em_atendimento" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "confirmado" }, "Agendamento confirmado.")} className={`${styles.btn} ${styles.btnPrimary}`}>
            Confirmar
          </button>
        )}
        {status !== "em_atendimento" && !isTerminal && (
          <button type="button" disabled={busy} onClick={handleStartAttendance} className={`${styles.btn} ${styles.btnPrimary}`}>
            Iniciar atendimento
          </button>
        )}
        {menuItems.length > 0 && (
          <div className={styles.menuWrap} ref={menuRef}>
            <button type="button" disabled={busy} onClick={() => setMenuOpen((v) => !v)} className={styles.menuTrigger} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Mais ações">
              ⋯
            </button>
            {menuOpen && (
              <div className={styles.menuPanel} role="menu">
                {menuItems.map((item, i) => (
                  <div key={i}>
                    {item.danger && i > 0 && !menuItems[i - 1].danger && <hr className={styles.menuDivider} />}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy || item.disabled}
                      onClick={() => {
                        setMenuOpen(false);
                        item.onClick();
                      }}
                      className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ""}`}
                    >
                      {item.label}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isTerminal && (
        <p style={{ color: "var(--ink-faint)", fontSize: 12.5, margin: "10px 0 0" }}>
          {status === "atendido"
            ? "Consulta já concluída — sem mais ações de status."
            : status === "faltou"
              ? "Paciente não compareceu — sem mais ações de status."
              : "Horário liberado — crie um novo agendamento pra realocá-lo."}
        </p>
      )}

      {rescheduling && (
        <form onSubmit={handleReschedule} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
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
            <select
              id="rescheduleDuration"
              className={styles.select}
              value={newDuration}
              onChange={(e) => setNewDuration(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutos{d === 30 ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formActions}>
            <button type="submit" disabled={busy || !newTime} className={`${styles.btn} ${styles.btnPrimary}`}>
              Confirmar remarcação
            </button>
          </div>
        </form>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
