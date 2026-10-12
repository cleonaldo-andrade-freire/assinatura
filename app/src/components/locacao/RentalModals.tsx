"use client";

import { useEffect, useState } from "react";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { formatDateOnlyBR, formatTimestampBR } from "@/lib/date";
import { isReceivable, shortTime } from "@/lib/roomRental";
import type { RoomRental, RoomRentalShift, RoomTenant } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import { Modal, callApi } from "./shared";

function amountText(value: number | null | undefined): string {
  return value == null ? "" : formatMoneyInput(String(Math.round(Number(value) * 100)));
}

/** Nova locação — data e turno vêm da célula clicada, valor do turno; tudo editável. */
export function NewRentalModal({
  open,
  clinicId,
  initialDate,
  initialShiftId,
  shifts,
  tenants,
  onClose,
  onSaved,
}: {
  open: boolean;
  clinicId: string;
  initialDate: string;
  initialShiftId: string;
  shifts: RoomRentalShift[];
  tenants: RoomTenant[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const activeShifts = shifts.filter((s) => s.active);
  const activeTenants = tenants.filter((t) => t.active);
  const [date, setDate] = useState(initialDate);
  const [shiftId, setShiftId] = useState(initialShiftId);
  const [tenantId, setTenantId] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(initialDate);
    setShiftId(initialShiftId);
    setTenantId(activeTenants.length > 0 ? "" : "__novo__");
    setNewTenantName("");
    setAmount(amountText(shifts.find((s) => s.id === initialShiftId)?.default_amount));
    setNotes("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeShift(id: string) {
    setShiftId(id);
    const suggested = shifts.find((s) => s.id === id)?.default_amount;
    if (suggested != null) setAmount(amountText(suggested));
  }

  async function handleSave() {
    setError("");
    const creatingTenant = tenantId === "__novo__";
    if (creatingTenant ? !newTenantName.trim() : !tenantId) return setError("Escolha o locatário.");
    if (!shiftId) return setError("Escolha o turno.");
    if (!amount) return setError("Informe o valor.");

    setSaving(true);
    try {
      let finalTenantId = tenantId;
      if (creatingTenant) {
        const created = await callApi(`/api/clinics/${clinicId}/room-tenants`, { name: newTenantName.trim() });
        if (!created.ok) return setError(created.message);
        finalTenantId = (created.data as { tenant: RoomTenant }).tenant.id;
      }
      const res = await callApi(`/api/clinics/${clinicId}/room-rentals`, {
        tenant_id: finalTenantId,
        shift_id: shiftId,
        rental_date: date,
        amount: parseMoneyInput(amount),
        notes: notes.trim() || null,
      });
      if (!res.ok) return setError(res.message);
      onSaved("Locação registrada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Nova locação"
      onClose={onClose}
      actions={
        <>
          <button type="button" className={uiStyles.dialogBtnGhost} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={uiStyles.dialogBtnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Registrar"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className={styles.field} style={{ flex: "1 1 160px" }}>
          <label className={styles.label}>Data*</label>
          <input type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className={styles.field} style={{ flex: "1 1 160px" }}>
          <label className={styles.label}>Turno*</label>
          <select className={styles.input} value={shiftId} onChange={(e) => changeShift(e.target.value)}>
            {activeShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({shortTime(s.start_time)}–{shortTime(s.end_time)})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Locatário*</label>
        <select className={styles.input} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="" disabled>
            Selecione…
          </option>
          {activeTenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="__novo__">+ Novo locatário</option>
        </select>
        {tenantId === "__novo__" && (
          <input
            className={styles.input}
            style={{ marginTop: 8 }}
            placeholder="Nome do locatário (dá pra completar o cadastro depois)"
            value={newTenantName}
            onChange={(e) => setNewTenantName(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <div className={styles.field} style={{ maxWidth: 200 }}>
        <label className={styles.label}>Valor (R$)*</label>
        <input className={styles.input} inputMode="numeric" value={amount} onChange={(e) => setAmount(formatMoneyInput(e.target.value))} placeholder="0,00" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Observação</label>
        <textarea className={styles.input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

/** Data e forma de pagamento — uma vez para todas as locações selecionadas. */
export function PayModal({
  open,
  clinicId,
  rentals,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  clinicId: string;
  rentals: RoomRental[];
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState(PAYMENT_METHODS[1]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = rentals.reduce((sum, r) => sum + Number(r.amount), 0);

  useEffect(() => {
    if (!open) return;
    setPaidAt(today);
    setError("");
  }, [open, today]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await callApi(`/api/clinics/${clinicId}/room-rentals/pagar`, {
        ids: rentals.map((r) => r.id),
        paid_at: paidAt,
        payment_method: method,
      });
      if (!res.ok) return setError(res.message);
      onSaved(rentals.length === 1 ? "Pagamento registrado." : `${rentals.length} locações marcadas como pagas.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={rentals.length === 1 ? "Registrar pagamento" : `Registrar pagamento de ${rentals.length} locações`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={uiStyles.dialogBtnGhost} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={uiStyles.dialogBtnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : `Confirmar R$ ${formatMoneyDisplay(total)}`}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className={styles.field} style={{ flex: "1 1 160px" }}>
          <label className={styles.label}>Data do pagamento*</label>
          <input type="date" className={styles.input} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className={styles.field} style={{ flex: "1 1 160px" }}>
          <label className={styles.label}>Forma de pagamento*</label>
          <select className={styles.input} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

/** Detalhe de uma locação: editar valor/observação, pagar, desfazer pagamento, cancelar. */
export function RentalDetailModal({
  open,
  clinicId,
  rental,
  shift,
  tenant,
  today,
  onClose,
  onPay,
  onSaved,
}: {
  open: boolean;
  clinicId: string;
  rental: RoomRental | null;
  shift: RoomRentalShift | undefined;
  tenant: RoomTenant | undefined;
  today: string;
  onClose: () => void;
  onPay: (rental: RoomRental) => void;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !rental) return;
    setAmount(amountText(rental.amount));
    setNotes(rental.notes ?? "");
    setConfirmCancel(false);
    setCancelReason("");
    setError("");
  }, [open, rental]);

  if (!rental) return null;
  const paid = !!rental.paid_at;

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, message: string) {
    setBusy(true);
    setError("");
    try {
      const res = await action();
      if (!res.ok) return setError(res.message);
      onSaved(message);
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/clinics/${clinicId}/room-rentals/${rental.id}`;
  const status = paid
    ? { label: `Pago em ${formatTimestampBR(rental.paid_at!)}${rental.payment_method ? ` · ${rental.payment_method}` : ""}`, cls: styles.statusOk }
    : isReceivable(rental, today)
    ? { label: "A receber", cls: styles.statusWarn }
    : { label: "Agendada", cls: styles.statusInfo };

  return (
    <Modal
      open={open}
      title={`${tenant?.name ?? "Locação"} — ${formatDateOnlyBR(rental.rental_date)}`}
      onClose={onClose}
      actions={
        confirmCancel ? (
          <>
            <button type="button" className={uiStyles.dialogBtnGhost} onClick={() => setConfirmCancel(false)} disabled={busy}>
              Voltar
            </button>
            <button
              type="button"
              className={uiStyles.dialogBtnDanger}
              disabled={busy}
              onClick={() => run(() => callApi(`${base}/cancelar`, { reason: cancelReason.trim() || null }), "Locação cancelada — turno liberado.")}
            >
              {busy ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
          </>
        ) : (
          <>
            {paid ? (
              <button
                type="button"
                className={uiStyles.dialogBtnGhost}
                disabled={busy}
                onClick={() => run(() => callApi(`${base}/desfazer-pagamento`, {}), "Pagamento desfeito — locação voltou para a receber.")}
              >
                Desfazer pagamento
              </button>
            ) : (
              <button type="button" className={uiStyles.dialogBtnGhost} disabled={busy} onClick={() => setConfirmCancel(true)}>
                Cancelar locação
              </button>
            )}
            {!paid && (
              <button type="button" className={uiStyles.dialogBtnGhost} disabled={busy} onClick={() => onPay(rental)}>
                Registrar pagamento
              </button>
            )}
            <button
              type="button"
              className={uiStyles.dialogBtnPrimary}
              disabled={busy || !amount}
              onClick={() =>
                run(() => callApi(base, { amount: parseMoneyInput(amount), notes: notes.trim() || null }, "PATCH"), "Locação atualizada.")
              }
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </>
        )
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>
          {shift?.name ?? "Turno"} · {shortTime(new Date(rental.starts_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }))}–
          {shortTime(new Date(rental.ends_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }))}
        </span>
        <span className={`${styles.statusBadge} ${status.cls}`}>{status.label}</span>
      </div>

      {confirmCancel ? (
        <div className={styles.field}>
          <label className={styles.label}>Motivo do cancelamento</label>
          <input className={styles.input} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Opcional" autoFocus />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>
            O turno fica livre de novo. Se o cancelamento em cima da hora for cobrado, não cancele — ajuste o valor.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.field} style={{ maxWidth: 200 }}>
            <label className={styles.label}>Valor (R$)</label>
            <input
              className={styles.input}
              inputMode="numeric"
              value={amount}
              disabled={paid}
              title={paid ? "Desfaça o pagamento para mudar o valor" : undefined}
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Observação</label>
            <textarea className={styles.input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </>
      )}

      {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}
