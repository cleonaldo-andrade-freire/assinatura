"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PatientAvatar } from "@/components/PatientAvatar";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads";
import { formatBRDateTime } from "@/lib/date";
import type { Lead, LeadMessage, LeadStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const ROLE_LABEL: Record<LeadMessage["role"], string> = {
  patient: "Paciente",
  bot: "Assistente",
  staff: "Recepção",
};

export function LeadsBoard({ clinicId, role, leads }: { clinicId: string; role: "owner" | "staff"; leads: Lead[] }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  const [moving, setMoving] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [localLeads, setLocalLeads] = useState(leads);
  useEffect(() => setLocalLeads(leads), [leads]);

  const byStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const status of LEAD_STATUSES) map.set(status, []);
    for (const l of localLeads) map.get(l.status)?.push(l);
    return map;
  }, [localLeads]);

  async function moveLead(leadId: string, status: LeadStatus) {
    setDragOverStatus(null);
    const previous = localLeads;
    if (previous.find((l) => l.id === leadId)?.status === status) return;

    setLocalLeads((cur) => cur.map((l) => (l.id === leadId ? { ...l, status } : l)));
    setMoving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLocalLeads(previous);
        push(data?.message || data?.error || "Falha ao mover o lead.");
        return;
      }
      push(`Movido para ${LEAD_STATUS_LABEL[status]}.`, "success");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${confirmDeleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        push(data?.message || data?.error || "Falha ao excluir o lead.");
        return;
      }
      setLocalLeads((cur) => cur.filter((l) => l.id !== confirmDeleteId));
      setConfirmDeleteId(null);
      setOpenLead(null);
      push("Lead excluído.", "success");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={styles.kanbanBoard}>
        {LEAD_STATUSES.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              className={styles.kanbanColumn}
              onDragOver={
                !moving && draggingId
                  ? (e) => {
                      e.preventDefault();
                      if (dragOverStatus !== status) setDragOverStatus(status);
                    }
                  : undefined
              }
              onDragLeave={!moving && draggingId ? () => setDragOverStatus((s) => (s === status ? null : s)) : undefined}
              onDrop={
                !moving && draggingId
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      setDraggingId(null);
                      if (id) moveLead(id, status);
                    }
                  : undefined
              }
              style={{
                background: dragOverStatus === status ? "var(--brand-tint)" : undefined,
                outline: dragOverStatus === status ? "2px dashed var(--brand)" : undefined,
              }}
            >
              <div className={styles.kanbanColumnHeader}>
                <span>{LEAD_STATUS_LABEL[status]}</span>
                <span className={styles.kanbanColumnCount}>{items.length}</span>
              </div>

              <div className={styles.kanbanColumnBody}>
                {items.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    draggable={!moving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStatus(null);
                    }}
                    onClick={() => setOpenLead(lead)}
                    className={`${styles.kanbanCard} ${lead.status === "urgent" ? styles.kanbanCardUrgent : ""}`}
                    style={{ cursor: moving ? "default" : "grab" }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <PatientAvatar clinicId={clinicId} patientId={null} name={lead.patient_name || lead.patient_phone} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.kanbanCardTitle}>{lead.patient_name || "Sem nome ainda"}</div>
                        <div className={styles.kanbanCardSubtitle}>{lead.patient_phone}</div>
                      </div>
                    </div>
                    {lead.clinical_summary && (
                      <div className={styles.kanbanCardMeta}>
                        <span>{lead.clinical_summary}</span>
                      </div>
                    )}
                  </button>
                ))}
                {items.length === 0 && <p className={styles.kanbanEmptyColumn}>Nada por aqui</p>}
              </div>
            </div>
          );
        })}
      </div>

      {openLead && (
        <LeadDetailModal
          clinicId={clinicId}
          lead={openLead}
          role={role}
          onClose={() => setOpenLead(null)}
          onRequestDelete={() => setConfirmDeleteId(openLead.id)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lead"
        message="Isso apaga o lead e todo o histórico de conversa dele. Não pode ser desfeito."
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

function LeadDetailModal({
  clinicId,
  lead,
  role,
  onClose,
  onRequestDelete,
}: {
  clinicId: string;
  lead: Lead;
  role: "owner" | "staff";
  onClose: () => void;
  onRequestDelete: () => void;
}) {
  const [messages, setMessages] = useState<LeadMessage[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clinics/${clinicId}/leads/${lead.id}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, lead.id]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className={styles.panel}
        style={{ width: "min(520px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelHeaderTitle}>{lead.patient_name || "Sem nome ainda"}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>{lead.patient_phone}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {role === "owner" && (
              <button type="button" className={styles.iconActionBtn} onClick={onRequestDelete} title="Excluir lead">
                Excluir
              </button>
            )}
            <button type="button" className={styles.iconActionBtn} onClick={onClose} title="Fechar">
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "12px 4px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && <p style={{ color: "var(--ink-faint)", fontSize: 13 }}>Carregando…</p>}
          {!loading && messages?.length === 0 && <p style={{ color: "var(--ink-faint)", fontSize: 13 }}>Sem mensagens ainda.</p>}
          {messages?.map((m) => (
            <div key={m.id} style={{ alignSelf: m.role === "patient" ? "flex-start" : "flex-end", maxWidth: "80%" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-faint)",
                  marginBottom: 2,
                  textAlign: m.role === "patient" ? "left" : "right",
                }}
              >
                {ROLE_LABEL[m.role]} · {formatBRDateTime(m.created_at)}
              </div>
              <div
                style={{
                  background: m.role === "patient" ? "var(--surface-sunken)" : "var(--brand-tint)",
                  color: m.role === "patient" ? "var(--ink)" : "var(--brand-deep)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  fontSize: 13.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
