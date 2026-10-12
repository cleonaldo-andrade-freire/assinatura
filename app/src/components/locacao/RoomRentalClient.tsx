"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { addDaysToDateStr, formatDateOnlyBR } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { buildWeekGrid, groupReceivables, isReceivable, shortTime, type BusyInterval } from "@/lib/roomRental";
import type { RoomRental, RoomRentalShift, RoomTenant } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import { NewRentalModal, PayModal, RentalDetailModal } from "./RentalModals";
import { ShiftsPanel, TenantsPanel } from "./RegistryPanels";
import { dayLabel } from "./shared";

type Tab = "quadro" | "locatarios" | "turnos";

const cellBase: React.CSSProperties = {
  width: "100%",
  minHeight: 64,
  borderRadius: 8,
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 13,
  lineHeight: 1.35,
  border: "1px solid var(--line)",
};

export function RoomRentalClient({
  clinicId,
  tab,
  today,
  weekStart,
  days,
  shifts,
  tenants,
  weekRentals,
  appointments,
  receivableRentals,
}: {
  clinicId: string;
  tab: Tab;
  today: string;
  weekStart: string;
  days: string[];
  shifts: RoomRentalShift[];
  tenants: RoomTenant[];
  weekRentals: RoomRental[];
  appointments: BusyInterval[];
  receivableRentals: RoomRental[];
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [newRental, setNewRental] = useState<{ date: string; shiftId: string } | null>(null);
  const [detail, setDetail] = useState<RoomRental | null>(null);
  const [paying, setPaying] = useState<RoomRental[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeShifts = shifts.filter((s) => s.active);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const tenantById = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const grid = useMemo(() => buildWeekGrid(days, activeShifts, weekRentals, appointments), [days, activeShifts, weekRentals, appointments]);
  const receivables = useMemo(() => groupReceivables(receivableRentals, tenants, today), [receivableRentals, tenants, today]);
  const receivableTotal = receivables.reduce((sum, g) => sum + g.total, 0);

  // Receita prevista da semana: locações agendadas, pagas ou não.
  const weekTotal = weekRentals.reduce((sum, r) => sum + Number(r.amount), 0);

  function saved(message: string) {
    setNewRental(null);
    setDetail(null);
    setPaying(null);
    setSelected(new Set());
    push(message, "success");
    router.refresh();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tabHref = (t: Tab) => (t === "quadro" ? `/dashboard/locacao?semana=${weekStart}` : `/dashboard/locacao?aba=${t}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className={styles.panel}>
        <div className={styles.tabBar}>
          {(
            [
              ["quadro", "Quadro da semana"],
              ["locatarios", "Locatários"],
              ["turnos", "Turnos"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <Link key={key} href={tabHref(key)} className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ""}`}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "locatarios" && <TenantsPanel clinicId={clinicId} tenants={tenants} onSaved={saved} />}
      {tab === "turnos" && <ShiftsPanel clinicId={clinicId} shifts={shifts} onSaved={saved} />}

      {tab === "quadro" && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <p className={styles.panelHeaderTitle}>
                Semana de {formatDateOnlyBR(days[0])} a {formatDateOnlyBR(days[6])}
                {weekTotal > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}> · R$ {formatMoneyDisplay(weekTotal)} em locações</span>
                )}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/dashboard/locacao?semana=${addDaysToDateStr(weekStart, -7)}`} className={`${styles.btn} ${styles.btnGhost}`}>
                  ‹ Anterior
                </Link>
                <Link href="/dashboard/locacao" className={`${styles.btn} ${styles.btnGhost}`}>
                  Hoje
                </Link>
                <Link href={`/dashboard/locacao?semana=${addDaysToDateStr(weekStart, 7)}`} className={`${styles.btn} ${styles.btnGhost}`}>
                  Próxima ›
                </Link>
              </div>
            </div>

            {activeShifts.length === 0 ? (
              <div className={styles.emptyState}>Nenhum turno ativo — cadastre em “Turnos”.</div>
            ) : (
              // Rola na horizontal dentro do próprio painel no celular — 7 dias não cabem.
              <div style={{ overflowX: "auto", padding: "12px 16px 16px" }}>
                <table style={{ width: "100%", minWidth: 760, borderCollapse: "separate", borderSpacing: 6 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 96 }}></th>
                      {days.map((d) => (
                        <th
                          key={d}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            textTransform: "capitalize",
                            color: d === today ? "var(--brand-deep)" : "var(--ink-soft)",
                          }}
                        >
                          {dayLabel(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeShifts.map((s) => (
                      <tr key={s.id}>
                        <th style={{ textAlign: "left", fontSize: 13, verticalAlign: "middle" }}>
                          {s.name}
                          <span style={{ display: "block", fontWeight: 400, fontSize: 12, color: "var(--ink-faint)" }}>
                            {shortTime(s.start_time)}–{shortTime(s.end_time)}
                          </span>
                        </th>
                        {days.map((d) => {
                          const cell = grid.get(`${d}|${s.id}`);
                          if (!cell) return <td key={d} />;
                          if (cell.kind === "alugada") {
                            const r = cell.rental;
                            const paid = !!r.paid_at;
                            const due = isReceivable(r, today);
                            return (
                              <td key={d}>
                                <button
                                  type="button"
                                  onClick={() => setDetail(r)}
                                  style={{ ...cellBase, cursor: "pointer", background: "var(--brand-tint)", borderColor: "var(--brand)" }}
                                >
                                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {tenantById.get(r.tenant_id)?.name ?? "—"}
                                  </strong>
                                  <span style={{ color: "var(--ink-soft)" }}>R$ {formatMoneyDisplay(Number(r.amount))}</span>
                                  <span
                                    style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: paid ? "var(--brand-deep)" : due ? "var(--warn)" : "var(--ink-faint)" }}
                                  >
                                    {paid ? "✓ pago" : due ? "a receber" : "agendada"}
                                  </span>
                                </button>
                              </td>
                            );
                          }
                          if (cell.kind === "clinica") {
                            return (
                              <td key={d}>
                                <div
                                  style={{ ...cellBase, background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
                                  title="Há consulta marcada na agenda nesse turno"
                                >
                                  Agenda da clínica
                                  <span style={{ display: "block", fontSize: 11.5 }}>
                                    {cell.appointmentCount} consulta{cell.appointmentCount > 1 ? "s" : ""}
                                  </span>
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={d}>
                              <button
                                type="button"
                                onClick={() => setNewRental({ date: d, shiftId: s.id })}
                                style={{ ...cellBase, cursor: "pointer", background: "var(--surface)", borderStyle: "dashed", color: "var(--ink-faint)" }}
                                aria-label={`Alugar ${s.name} de ${dayLabel(d)}`}
                              >
                                + Livre
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <p className={styles.panelHeaderTitle}>
                A receber{receivableTotal > 0 && <span style={{ fontWeight: 400 }}> · R$ {formatMoneyDisplay(receivableTotal)}</span>}
              </p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={selected.size === 0}
                onClick={() => setPaying(receivableRentals.filter((r) => selected.has(r.id)))}
              >
                Marcar como pagas ({selected.size})
              </button>
            </div>
            {receivables.length === 0 ? (
              <div className={styles.emptyState}>Nenhuma locação usada aguardando pagamento.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Data</th>
                    <th>Turno</th>
                    <th>Valor</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                {receivables.map((g) => {
                  const ids = g.rentals.map((r) => r.id);
                  const allChecked = ids.every((id) => selected.has(id));
                  return (
                    <tbody key={g.tenant.id}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            aria-label={`Selecionar todas de ${g.tenant.name}`}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                ids.forEach((id) => (allChecked ? next.delete(id) : next.add(id)));
                                return next;
                              })
                            }
                          />
                        </td>
                        <td colSpan={4} className={styles.rowTitle}>
                          {g.tenant.name} — R$ {formatMoneyDisplay(g.total)} ({g.rentals.length} turno{g.rentals.length > 1 ? "s" : ""})
                        </td>
                      </tr>
                      {g.rentals.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Selecionar locação de ${formatDateOnlyBR(r.rental_date)}`} />
                          </td>
                          <td data-label="Data">
                            <button type="button" onClick={() => setDetail(r)} style={{ background: "none", border: "none", padding: 0, color: "var(--brand-deep)", cursor: "pointer", font: "inherit" }}>
                              {formatDateOnlyBR(r.rental_date)}
                            </button>
                          </td>
                          <td data-label="Turno">{shiftById.get(r.shift_id)?.name ?? "—"}</td>
                          <td data-label="Valor">R$ {formatMoneyDisplay(Number(r.amount))}</td>
                          <td data-label="Observação" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                            {r.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            )}
          </section>
        </>
      )}

      <NewRentalModal
        open={newRental !== null}
        clinicId={clinicId}
        initialDate={newRental?.date ?? today}
        initialShiftId={newRental?.shiftId ?? activeShifts[0]?.id ?? ""}
        shifts={shifts}
        tenants={tenants}
        onClose={() => setNewRental(null)}
        onSaved={saved}
      />

      <RentalDetailModal
        open={detail !== null && paying === null}
        clinicId={clinicId}
        rental={detail}
        shift={detail ? shiftById.get(detail.shift_id) : undefined}
        tenant={detail ? tenantById.get(detail.tenant_id) : undefined}
        today={today}
        onClose={() => setDetail(null)}
        onPay={(r) => setPaying([r])}
        onSaved={saved}
      />

      <PayModal open={paying !== null} clinicId={clinicId} rentals={paying ?? []} today={today} onClose={() => setPaying(null)} onSaved={saved} />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
