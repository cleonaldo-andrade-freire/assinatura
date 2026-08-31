"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PatientAvatar } from "@/components/PatientAvatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads";
import { formatBRTime, formatBRWeekday } from "@/lib/date";
import type { Lead, LeadMessage, LeadStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import chat from "@/components/leads.module.css";

const SENDER_LABEL: Record<Exclude<LeadMessage["role"], "patient">, string> = {
  bot: "Assistente",
  staff: "Recepção",
};

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L18.5 9.5a2.121 2.121 0 00-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

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

  // Mantém o board sozinho em dia (mesmo padrão de AgendaRealtimeRefresh:
  // postgres_changes + polling de segurança a cada 30s) e avisa com um toast
  // quando um lead vira "urgente" — silencioso demais e a equipe só percebe
  // se estiver de olho na aba; um toast em toda mensagem de bot vira ruído
  // que a equipe aprende a ignorar, por isso só a entrada em urgente alerta.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`leads-${clinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `clinic_id=eq.${clinicId}` },
        (payload) => {
          const newRow = payload.new as Partial<Lead> | undefined;
          const oldRow = payload.old as Partial<Lead> | undefined;
          const tornouUrgente = newRow?.status === "urgent" && oldRow?.status !== "urgent";
          if (tornouUrgente) {
            push(`🚨 Lead urgente: ${newRow?.patient_name || newRow?.patient_phone || "paciente"}`, "error");
          }
          router.refresh();
        }
      )
      .subscribe();

    const fallbackInterval = setInterval(() => router.refresh(), 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(fallbackInterval);
    };
  }, [clinicId, push, router]);

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
          onRenamed={(name) => {
            setLocalLeads((cur) => cur.map((l) => (l.id === openLead.id ? { ...l, patient_name: name } : l)));
            setOpenLead((o) => (o ? { ...o, patient_name: name } : o));
          }}
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
        zIndex={1100}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  bot_active: styles.statusInfo,
  waiting_reply: styles.statusWarn,
  urgent: styles.statusDanger,
  scheduled: styles.statusOk,
};

/** "Hoje", "Ontem", ou o dia da semana + data — mesma lógica de agrupar por
 * dia que um app de mensagens de verdade usa pra separador entre grupos. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, yesterday)) return "Ontem";
  return formatBRWeekday(iso, "long");
}

function LeadDetailModal({
  clinicId,
  lead,
  role,
  onClose,
  onRequestDelete,
  onRenamed,
}: {
  clinicId: string;
  lead: Lead;
  role: "owner" | "staff";
  onClose: () => void;
  onRequestDelete: () => void;
  onRenamed: (name: string | null) => void;
}) {
  const [messages, setMessages] = useState<LeadMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(lead.patient_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function saveName() {
    const next = nameDraft.trim();
    if (next === (lead.patient_name ?? "")) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: next }),
      });
      if (!res.ok) {
        setNameError("Não deu pra salvar. Tenta de novo.");
        return;
      }
      onRenamed(next || null);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

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

  // Abre a thread já rolada pro final — igual a qualquer app de mensagens,
  // ninguém quer começar lendo do topo de uma conversa longa.
  useEffect(() => {
    if (!loading) threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [loading, messages]);

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
      <div className={`${styles.panel} ${chat.chatModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={chat.chatHeader}>
          <PatientAvatar clinicId={clinicId} patientId={null} name={lead.patient_name || lead.patient_phone} size={38} tone="brand" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setNameDraft(lead.patient_name ?? "");
                      setNameError(null);
                      setEditingName(false);
                    }
                  }}
                  placeholder="Nome do paciente"
                  maxLength={120}
                  disabled={savingName}
                  style={{
                    flex: 1,
                    minWidth: 140,
                    fontSize: 15,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1.5px solid var(--line)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ padding: "4px 10px", fontSize: 12.5 }}
                  onClick={saveName}
                  disabled={savingName}
                >
                  {savingName ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "4px 10px", fontSize: 12.5 }}
                  onClick={() => {
                    setNameDraft(lead.patient_name ?? "");
                    setNameError(null);
                    setEditingName(false);
                  }}
                  disabled={savingName}
                >
                  Cancelar
                </button>
                {nameError && <span style={{ fontSize: 12, color: "var(--danger)", width: "100%" }}>{nameError}</span>}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={chat.chatHeaderName}>{lead.patient_name || "Sem nome ainda"}</span>
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  style={{ width: 26, height: 26 }}
                  onClick={() => {
                    setNameDraft(lead.patient_name ?? "");
                    setEditingName(true);
                  }}
                  title="Editar nome"
                  aria-label="Editar nome"
                >
                  <PencilIcon />
                </button>
              </div>
            )}
            <div className={chat.chatHeaderPhone}>{lead.patient_phone}</div>
          </div>
          <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[lead.status]}`}>{LEAD_STATUS_LABEL[lead.status]}</span>
          {role === "owner" && (
            <button type="button" className={styles.iconActionBtn} onClick={onRequestDelete} title="Excluir lead" aria-label="Excluir lead">
              <TrashIcon />
            </button>
          )}
          <button type="button" className={styles.iconActionBtn} onClick={onClose} title="Fechar" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div ref={threadRef} className={chat.chatThread}>
          {loading && <p className={chat.chatEmpty}>Carregando…</p>}
          {!loading && messages?.length === 0 && <p className={chat.chatEmpty}>Sem mensagens ainda.</p>}
          {messages?.map((m, i) => {
            const previous = messages[i - 1];
            const showDayDivider = !previous || dayLabel(previous.created_at) !== dayLabel(m.created_at);
            const outgoing = m.role !== "patient";
            return (
              <div key={m.id}>
                {showDayDivider && (
                  <div style={{ textAlign: "center", margin: "4px 0 10px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ink-soft)",
                        background: "var(--surface)",
                        borderRadius: 999,
                        padding: "3px 10px",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`${chat.bubbleRow} ${outgoing ? chat.bubbleRowOutgoing : chat.bubbleRowIncoming}`}>
                  {outgoing && <span className={chat.bubbleSender}>{SENDER_LABEL[m.role as "bot" | "staff"]}</span>}
                  <div className={`${chat.bubble} ${outgoing ? chat.bubbleOutgoing : chat.bubbleIncoming}`}>
                    {m.content}
                    <span className={chat.bubbleTime}>{formatBRTime(m.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
