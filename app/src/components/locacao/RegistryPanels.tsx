"use client";

import { useEffect, useState } from "react";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { shortTime } from "@/lib/roomRental";
import type { RoomRentalShift, RoomTenant } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import { Modal, callApi } from "./shared";

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Locatários -----------------------------------------------------------

const EMPTY_TENANT = { name: "", document: "", cro: "", cro_uf: "", phone: "", email: "", notes: "" };

export function TenantsPanel({ clinicId, tenants, onSaved }: { clinicId: string; tenants: RoomTenant[]; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState<RoomTenant | "novo" | null>(null);
  const [form, setForm] = useState(EMPTY_TENANT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    setError("");
    setForm(
      editing === "novo"
        ? EMPTY_TENANT
        : {
            name: editing.name,
            document: editing.document ?? "",
            cro: editing.cro ?? "",
            cro_uf: editing.cro_uf ?? "",
            phone: editing.phone ?? "",
            email: editing.email ?? "",
            notes: editing.notes ?? "",
          }
    );
  }, [editing]);

  async function save(body: Record<string, unknown>, message: string) {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const res =
        editing === "novo"
          ? await callApi(`/api/clinics/${clinicId}/room-tenants`, body)
          : await callApi(`/api/clinics/${clinicId}/room-tenants/${editing.id}`, body, "PATCH");
      if (!res.ok) return setError(res.message);
      setEditing(null);
      onSaved(message);
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof EMPTY_TENANT, label: string, extra?: { flex?: string; maxLength?: number }) => (
    <div className={styles.field} style={{ flex: extra?.flex ?? "1 1 200px" }}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        value={form[key]}
        maxLength={extra?.maxLength}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className={styles.panelHeaderTitle}>{tenants.length} locatário(s)</p>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setEditing("novo")}>
          Novo locatário
        </button>
      </div>
      {tenants.length === 0 ? (
        <div className={styles.emptyState}>Nenhum locatário cadastrado — dá pra cadastrar também direto ao registrar uma locação.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CRO</th>
              <th>Telefone</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className={styles.rowTitle} data-label="Nome">
                  {t.name}
                </td>
                <td data-label="CRO">{t.cro ? `${t.cro}${t.cro_uf ? `/${t.cro_uf}` : ""}` : "—"}</td>
                <td data-label="Telefone">{t.phone || "—"}</td>
                <td data-label="Situação">
                  <span className={`${styles.statusBadge} ${t.active ? styles.statusOk : styles.statusMuted}`}>{t.active ? "Ativo" : "Inativo"}</span>
                </td>
                <td>
                  <button type="button" className={styles.iconActionBtn} onClick={() => setEditing(t)} title="Editar" aria-label={`Editar ${t.name}`}>
                    <EditIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={editing !== null}
        title={editing === "novo" ? "Novo locatário" : "Editar locatário"}
        onClose={() => setEditing(null)}
        actions={
          <>
            {editing && editing !== "novo" && (
              <button
                type="button"
                className={uiStyles.dialogBtnGhost}
                disabled={saving}
                onClick={() => save({ active: !editing.active }, editing.active ? "Locatário desativado." : "Locatário reativado.")}
              >
                {editing.active ? "Desativar" : "Reativar"}
              </button>
            )}
            <button type="button" className={uiStyles.dialogBtnGhost} onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className={uiStyles.dialogBtnPrimary} disabled={saving || !form.name.trim()} onClick={() => save(form, "Locatário salvo.")}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {field("name", "Nome*", { flex: "1 1 100%" })}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {field("document", "CPF ou CNPJ")}
          {field("cro", "CRO", { flex: "1 1 120px" })}
          {field("cro_uf", "UF", { flex: "0 0 70px", maxLength: 2 })}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {field("phone", "Telefone")}
          {field("email", "E-mail")}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Observação</label>
          <textarea className={styles.input} rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
        </div>
        {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      </Modal>
    </section>
  );
}

// ---- Turnos ---------------------------------------------------------------

export function ShiftsPanel({ clinicId, shifts, onSaved }: { clinicId: string; shifts: RoomRentalShift[]; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState<RoomRentalShift | "novo" | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    setError("");
    if (editing === "novo") {
      setName("");
      setStart("");
      setEnd("");
      setAmount("");
    } else {
      setName(editing.name);
      setStart(shortTime(editing.start_time));
      setEnd(shortTime(editing.end_time));
      setAmount(editing.default_amount == null ? "" : formatMoneyInput(String(Math.round(Number(editing.default_amount) * 100))));
    }
  }, [editing]);

  async function save(body: Record<string, unknown>, message: string) {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const res =
        editing === "novo"
          ? await callApi(`/api/clinics/${clinicId}/room-rental-shifts`, { ...body, sort_order: shifts.length + 1 })
          : await callApi(`/api/clinics/${clinicId}/room-rental-shifts/${editing.id}`, body, "PATCH");
      if (!res.ok) return setError(res.message);
      setEditing(null);
      onSaved(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className={styles.panelHeaderTitle}>Turnos</p>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setEditing("novo")}>
          Novo turno
        </button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Turno</th>
            <th>Horário</th>
            <th>Valor sugerido</th>
            <th>Situação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td className={styles.rowTitle} data-label="Turno">
                {s.name}
              </td>
              <td data-label="Horário">
                {shortTime(s.start_time)}–{shortTime(s.end_time)}
              </td>
              <td data-label="Valor sugerido">{s.default_amount == null ? "—" : `R$ ${formatMoneyDisplay(Number(s.default_amount))}`}</td>
              <td data-label="Situação">
                <span className={`${styles.statusBadge} ${s.active ? styles.statusOk : styles.statusMuted}`}>{s.active ? "Ativo" : "Inativo"}</span>
              </td>
              <td>
                <button type="button" className={styles.iconActionBtn} onClick={() => setEditing(s)} title="Editar" aria-label={`Editar turno ${s.name}`}>
                  <EditIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, padding: "12px 20px", fontSize: 12, color: "var(--ink-soft)" }}>
        Mudar o horário ou o valor de um turno vale só para locações novas — as já registradas mantêm o que foi combinado.
      </p>

      <Modal
        open={editing !== null}
        title={editing === "novo" ? "Novo turno" : "Editar turno"}
        onClose={() => setEditing(null)}
        actions={
          <>
            {editing && editing !== "novo" && (
              <button
                type="button"
                className={uiStyles.dialogBtnGhost}
                disabled={saving}
                onClick={() => save({ active: !editing.active }, editing.active ? "Turno desativado." : "Turno reativado.")}
              >
                {editing.active ? "Desativar" : "Reativar"}
              </button>
            )}
            <button type="button" className={uiStyles.dialogBtnGhost} onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className={uiStyles.dialogBtnPrimary}
              disabled={saving || !name.trim() || !start || !end}
              onClick={() =>
                save(
                  { name: name.trim(), start_time: start, end_time: end, default_amount: amount ? parseMoneyInput(amount) : null },
                  "Turno salvo."
                )
              }
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <div className={styles.field}>
          <label className={styles.label}>Nome*</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Manhã" />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className={styles.field} style={{ flex: "1 1 120px" }}>
            <label className={styles.label}>Início*</label>
            <input type="time" className={styles.input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className={styles.field} style={{ flex: "1 1 120px" }}>
            <label className={styles.label}>Fim*</label>
            <input type="time" className={styles.input} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className={styles.field} style={{ flex: "1 1 140px" }}>
            <label className={styles.label}>Valor sugerido (R$)</label>
            <input className={styles.input} inputMode="numeric" value={amount} onChange={(e) => setAmount(formatMoneyInput(e.target.value))} placeholder="0,00" />
          </div>
        </div>
        {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      </Modal>
    </section>
  );
}
