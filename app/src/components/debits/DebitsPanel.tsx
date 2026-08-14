"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatMoneyDisplay } from "@/lib/money";
import { formatBRDateTime } from "@/lib/date";
import type { TreatmentDebit } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import db from "./debits.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export function DebitsPanel({
  clinicId,
  patientId,
  initialOpenDebits,
  openPage,
  openTotalPages,
  openCount,
  totalToReceive,
  initialPaidDebits,
  paidPage,
  paidTotalPages,
  paidCount,
  totalReceived,
}: {
  clinicId: string;
  patientId: string;
  initialOpenDebits: TreatmentDebit[];
  openPage: number;
  openTotalPages: number;
  openCount: number;
  totalToReceive: number;
  initialPaidDebits: TreatmentDebit[];
  paidPage: number;
  paidTotalPages: number;
  paidCount: number;
  totalReceived: number;
}) {
  const router = useRouter();

  // Funções criadas aqui dentro (não recebidas via prop) de propósito — ver
  // mesmo comentário em TreatmentsPanel.tsx (RSC não deixa passar função
  // pronta de Server pra Client Component).
  function openHrefFor(p: number) {
    const params = new URLSearchParams();
    params.set("dbPage", String(p));
    params.set("tab", "debitos");
    return `/dashboard/pacientes/${patientId}?${params.toString()}`;
  }
  function paidHrefFor(p: number) {
    const params = new URLSearchParams();
    params.set("dbPaidPage", String(p));
    params.set("tab", "debitos");
    return `/dashboard/pacientes/${patientId}?${params.toString()}`;
  }

  const [openDebits, setOpenDebits] = useState(initialOpenDebits);
  const [paidDebits, setPaidDebits] = useState(initialPaidDebits);
  useEffect(() => setOpenDebits(initialOpenDebits), [initialOpenDebits]);
  useEffect(() => setPaidDebits(initialPaidDebits), [initialPaidDebits]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/debits/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao excluir. Tenta de novo.");
        return;
      }
      setOpenDebits((prev) => prev.filter((d) => d.id !== id));
      setPaidDebits((prev) => prev.filter((d) => d.id !== id));
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className={db.totals}>
        <div className={`${db.totalCard} ${db.totalCardOpen}`}>
          <p className={db.totalCardLabel}>A receber</p>
          <p className={db.totalCardValue}>{formatMoney(totalToReceive)}</p>
        </div>
        <div className={`${db.totalCard} ${db.totalCardPaid}`}>
          <p className={db.totalCardLabel}>Recebido</p>
          <p className={db.totalCardValue}>{formatMoney(totalReceived)}</p>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <p className={db.sectionTitle}>Em aberto</p>
        {openDebits.length === 0 ? (
          <div className={styles.emptyState}>Nenhum débito em aberto.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openDebits.map((d) => (
                <div key={d.id} className={db.row}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{d.description}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(d.amount)}</div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(d.id)}
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ color: "var(--danger)", flexShrink: 0 }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
            <Pagination page={openPage} totalPages={openTotalPages} count={openCount} itemLabel="débito" hrefFor={openHrefFor} />
          </>
        )}
      </div>

      <div>
        <p className={db.sectionTitle}>Pago</p>
        {paidDebits.length === 0 ? (
          <div className={styles.emptyState}>Nenhum débito pago ainda.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {paidDebits.map((d) => {
                const subtitleParts = [d.payment_method, d.paid_at ? formatBRDateTime(d.paid_at, "medium") : null].filter(Boolean);
                return (
                  <div key={d.id} className={db.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{d.description}</div>
                      {subtitleParts.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{subtitleParts.join(" — ")}</div>}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(d.amount)}</div>
                    <span className={`${styles.statusDot} ${styles.statusOk}`}>Pago</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(d.id)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ color: "var(--danger)", flexShrink: 0 }}
                    >
                      Excluir
                    </button>
                  </div>
                );
              })}
            </div>
            <Pagination page={paidPage} totalPages={paidTotalPages} count={paidCount} itemLabel="débito" hrefFor={paidHrefFor} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir débito"
        message="Isso remove esse lançamento financeiro da ficha do paciente. Não é possível desfazer."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
