"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PatientAvatar } from "@/components/PatientAvatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  LEAD_BOARD_STATUSES,
  LEAD_STATUS_LABEL,
  STALE_WAITING_DAYS,
  compareLeadsForColumn,
  isStaleWaiting,
} from "@/lib/leads";
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

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M5 7v11a1 1 0 001 1h12a1 1 0 001-1V7M4 7l1.5-3h13L21 7M10 11h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LeadsBoard({
  clinicId,
  role,
  openLeads,
  scheduledLeads,
  archivedLeads,
  listLimit,
}: {
  clinicId: string;
  role: "owner" | "staff";
  openLeads: Lead[];
  scheduledLeads: Lead[];
  archivedLeads: Lead[];
  listLimit: number;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  const [moving, setMoving] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [localOpen, setLocalOpen] = useState(openLeads);
  const [localScheduled, setLocalScheduled] = useState(scheduledLeads);
  const [localArchived, setLocalArchived] = useState(archivedLeads);
  useEffect(() => setLocalOpen(openLeads), [openLeads]);
  useEffect(() => setLocalScheduled(scheduledLeads), [scheduledLeads]);
  useEffect(() => setLocalArchived(archivedLeads), [archivedLeads]);

  const [search, setSearch] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

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

  const query = search.trim().toLowerCase();
  const matchesSearch = (l: Lead) =>
    !query ||
    (l.patient_name?.toLowerCase().includes(query) ?? false) ||
    l.patient_phone.includes(query) ||
    (l.clinical_summary?.toLowerCase().includes(query) ?? false);

  const byStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const status of LEAD_BOARD_STATUSES) map.set(status, []);
    for (const l of localOpen) {
      if (!matchesSearch(l)) continue;
      if (onlyStale && !isStaleWaiting(l, STALE_WAITING_DAYS)) continue;
      map.get(l.status)?.push(l);
    }
    for (const [status, items] of map) items.sort((a, b) => compareLeadsForColumn(status, a, b));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOpen, query, onlyStale]);

  const visibleScheduled = localScheduled.filter(matchesSearch);
  const staleCount = localOpen.filter((l) => isStaleWaiting(l, STALE_WAITING_DAYS)).length;

  /** Move um lead entre as colunas do quadro e a lista de agendados. */
  async function moveLead(leadId: string, status: LeadStatus) {
    setDragOverStatus(null);
    const lead = localOpen.find((l) => l.id === leadId) ?? localScheduled.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;

    const prevOpen = localOpen;
    const prevScheduled = localScheduled;
    const moved = { ...lead, status };
    setLocalOpen((cur) => (status === "scheduled" ? cur.filter((l) => l.id !== leadId) : upsert(cur, moved)));
    setLocalScheduled((cur) => (status === "scheduled" ? upsert(cur, moved) : cur.filter((l) => l.id !== leadId)));
    setMoving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLocalOpen(prevOpen);
        setLocalScheduled(prevScheduled);
        push(data?.message || data?.error || "Falha ao mover o lead.");
        return;
      }
      push(`Movido para ${LEAD_STATUS_LABEL[status]}.`, "success");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

  async function setArchived(lead: Lead, archived: boolean) {
    const prevOpen = localOpen;
    const prevScheduled = localScheduled;
    const prevArchived = localArchived;
    if (archived) {
      setLocalOpen((cur) => cur.filter((l) => l.id !== lead.id));
      setLocalScheduled((cur) => cur.filter((l) => l.id !== lead.id));
      setLocalArchived((cur) => [{ ...lead, archived_at: new Date().toISOString() }, ...cur]);
    } else {
      setLocalArchived((cur) => cur.filter((l) => l.id !== lead.id));
    }
    setOpenLead(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        setLocalOpen(prevOpen);
        setLocalScheduled(prevScheduled);
        setLocalArchived(prevArchived);
        push("Falha ao arquivar o lead.");
        return;
      }
      push(archived ? "Lead arquivado." : "Lead restaurado.", "success");
      router.refresh();
    } catch {
      setLocalOpen(prevOpen);
      setLocalScheduled(prevScheduled);
      setLocalArchived(prevArchived);
      push("Falha ao arquivar o lead.");
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
      setLocalOpen((cur) => cur.filter((l) => l.id !== confirmDeleteId));
      setLocalScheduled((cur) => cur.filter((l) => l.id !== confirmDeleteId));
      setLocalArchived((cur) => cur.filter((l) => l.id !== confirmDeleteId));
      setConfirmDeleteId(null);
      setOpenLead(null);
      push("Lead excluído.", "success");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const dropHandlers = (status: LeadStatus) =>
    !moving && draggingId
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragOverStatus !== status) setDragOverStatus(status);
          },
          onDragLeave: () => setDragOverStatus((s) => (s === status ? null : s)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            setDraggingId(null);
            if (id) moveLead(id, status);
          },
        }
      : {};

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou motivo…"
          className={styles.input}
          style={{ flex: "1 1 260px", maxWidth: 360 }}
        />
        <button
          type="button"
          onClick={() => setOnlyStale((v) => !v)}
          className={`${styles.btn} ${onlyStale ? styles.btnPrimary : styles.btnGhost}`}
          style={{ fontSize: 12.5 }}
        >
          Sem resposta há +{STALE_WAITING_DAYS} dias{staleCount > 0 ? ` (${staleCount})` : ""}
        </button>
      </div>

      <div className={styles.kanbanBoard}>
        {LEAD_BOARD_STATUSES.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              className={styles.kanbanColumn}
              {...dropHandlers(status)}
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
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                          <div
                            className={styles.kanbanCardTitle}
                            style={{ marginBottom: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {lead.patient_name || "Sem nome ainda"}
                          </div>
                          <div
                            className={styles.kanbanCardTitle}
                            style={{ marginBottom: 0, flex: "none", whiteSpace: "nowrap" }}
                            title={`Lead criado em ${formatBRWeekday(lead.created_at, "long")}, ${new Date(lead.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${formatBRTime(lead.created_at)}`}
                          >
                            {leadDateLabel(lead.last_message_at ?? lead.created_at)}
                          </div>
                        </div>
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

      {/* Agendados — lista, não coluna: lead agendado é caso encerrado. Continua
          aceitando drop pra marcar um card como agendado. */}
      <section
        {...dropHandlers("scheduled")}
        className={styles.panel}
        style={{
          marginTop: 18,
          background: dragOverStatus === "scheduled" ? "var(--brand-tint)" : undefined,
          outline: dragOverStatus === "scheduled" ? "2px dashed var(--brand)" : undefined,
        }}
      >
        <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className={styles.panelHeaderTitle}>Agendados</p>
          <span className={styles.kanbanColumnCount}>{localScheduled.length}</span>
        </div>
        <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visibleScheduled.length === 0 ? (
            <p className={styles.kanbanEmptyColumn} style={{ padding: "8px 0" }}>
              {localScheduled.length === 0 ? "Nenhum lead agendado." : "Nada bate com a busca."}
            </p>
          ) : (
            visibleScheduled.map((lead) => (
              <MiniLeadRow
                key={lead.id}
                clinicId={clinicId}
                lead={lead}
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
                trailing={<span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{leadDateLabel(lead.created_at)}</span>}
              />
            ))
          )}
          {localScheduled.length >= listLimit && (
            <p className={styles.hint} style={{ margin: "4px 0 0" }}>
              Mostrando os {listLimit} agendados mais recentes.
            </p>
          )}
        </div>
      </section>

      {/* Arquivados — recolhido por padrão. */}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ fontSize: 12.5 }}
        >
          {showArchived ? "▾" : "▸"} Arquivados ({localArchived.length})
        </button>
        {showArchived && (
          <div className={styles.panel} style={{ marginTop: 8 }}>
            <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {localArchived.length === 0 ? (
                <p className={styles.kanbanEmptyColumn} style={{ padding: "8px 0" }}>Nenhum lead arquivado.</p>
              ) : (
                localArchived.map((lead) => (
                  <MiniLeadRow
                    key={lead.id}
                    clinicId={clinicId}
                    lead={lead}
                    onClick={() => setOpenLead(lead)}
                    trailing={
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ fontSize: 12, padding: "3px 10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchived(lead, false);
                        }}
                      >
                        Restaurar
                      </button>
                    }
                  />
                ))
              )}
              {localArchived.length >= listLimit && (
                <p className={styles.hint} style={{ margin: "4px 0 0" }}>
                  Mostrando os {listLimit} mais recentes.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {openLead && (
        <LeadDetailModal
          clinicId={clinicId}
          lead={openLead}
          role={role}
          onClose={() => setOpenLead(null)}
          onRequestDelete={() => setConfirmDeleteId(openLead.id)}
          onArchive={() => setArchived(openLead, !openLead.archived_at)}
          onLeadPatched={(patch) => {
            const apply = (l: Lead) => (l.id === openLead.id ? { ...l, ...patch } : l);
            setLocalOpen((cur) => cur.map(apply));
            setLocalScheduled((cur) => cur.map(apply));
            setLocalArchived((cur) => cur.map(apply));
            setOpenLead((o) => (o ? { ...o, ...patch } : o));
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lead"
        message="Isso apaga o lead e todo o histórico de conversa dele. Não pode ser desfeito. Pra só tirar do quadro sem perder a conversa, use Arquivar."
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

/** Substitui um lead na lista pelo id, ou adiciona no início se não estiver lá. */
function upsert(list: Lead[], lead: Lead): Lead[] {
  return list.some((l) => l.id === lead.id) ? list.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...list];
}

function MiniLeadRow({
  clinicId,
  lead,
  trailing,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  clinicId: string;
  lead: Lead;
  trailing?: React.ReactNode;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={styles.kanbanCard}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: draggable ? "grab" : "pointer" }}
    >
      <PatientAvatar clinicId={clinicId} patientId={null} name={lead.patient_name || lead.patient_phone} size={26} />
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {lead.patient_name || "Sem nome ainda"}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>{lead.patient_phone}</span>
      </span>
      {trailing}
    </div>
  );
}

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  bot_active: styles.statusInfo,
  waiting_reply: styles.statusWarn,
  urgent: styles.statusDanger,
  scheduled: styles.statusOk,
};

/** Data de entrada do lead pro rodapé do card: "Hoje HH:mm" / "Ontem HH:mm"
 * pros recentes, DD/MM/AAAA pros mais antigos. */
function leadDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return `Hoje ${formatBRTime(iso)}`;
  if (sameDay(d, yesterday)) return `Ontem ${formatBRTime(iso)}`;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

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
  onArchive,
  onLeadPatched,
}: {
  clinicId: string;
  lead: Lead;
  role: "owner" | "staff";
  onClose: () => void;
  onRequestDelete: () => void;
  onArchive: () => void;
  onLeadPatched: (patch: Partial<Lead>) => void;
}) {
  const [messages, setMessages] = useState<LeadMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(lead.patient_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(lead.clinical_summary ?? "");
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
      onLeadPatched({ patient_name: next || null });
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  async function saveSummary() {
    const next = summaryDraft.trim();
    if (next === (lead.clinical_summary ?? "")) {
      setEditingSummary(false);
      return;
    }
    setSavingSummary(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinical_summary: next }),
      });
      if (!res.ok) {
        setSummaryError("Não deu pra salvar. Tenta de novo.");
        return;
      }
      onLeadPatched({ clinical_summary: next || null });
      setEditingSummary(false);
    } finally {
      setSavingSummary(false);
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
          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={onArchive}
            title={lead.archived_at ? "Restaurar lead" : "Arquivar lead"}
            aria-label={lead.archived_at ? "Restaurar lead" : "Arquivar lead"}
          >
            <ArchiveIcon />
          </button>
          {role === "owner" && (
            <button type="button" className={styles.iconActionBtn} onClick={onRequestDelete} title="Excluir lead" aria-label="Excluir lead">
              <TrashIcon />
            </button>
          )}
          <button type="button" className={styles.iconActionBtn} onClick={onClose} title="Fechar" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--line)",
            background: "var(--surface-sunken)",
            fontSize: 13,
          }}
        >
          {editingSummary ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                autoFocus
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSummaryDraft(lead.clinical_summary ?? "");
                    setSummaryError(null);
                    setEditingSummary(false);
                  }
                }}
                placeholder="Ex.: dor de dente há 2 dias, quer avaliação; convênio X; retorno de canal…"
                maxLength={500}
                rows={2}
                disabled={savingSummary}
                style={{
                  width: "100%",
                  resize: "vertical",
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1.5px solid var(--line)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ padding: "4px 10px", fontSize: 12.5 }}
                  onClick={saveSummary}
                  disabled={savingSummary}
                >
                  {savingSummary ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "4px 10px", fontSize: 12.5 }}
                  onClick={() => {
                    setSummaryDraft(lead.clinical_summary ?? "");
                    setSummaryError(null);
                    setEditingSummary(false);
                  }}
                  disabled={savingSummary}
                >
                  Cancelar
                </button>
                {summaryError && <span style={{ fontSize: 12, color: "var(--danger)" }}>{summaryError}</span>}
              </div>
            </div>
          ) : lead.clinical_summary ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap" }}>
                <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>Motivo: </strong>
                {lead.clinical_summary}
              </span>
              <button
                type="button"
                className={styles.iconActionBtn}
                style={{ width: 26, height: 26, flex: "none" }}
                onClick={() => {
                  setSummaryDraft(lead.clinical_summary ?? "");
                  setEditingSummary(true);
                }}
                title="Editar motivo"
                aria-label="Editar motivo"
              >
                <PencilIcon />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSummaryDraft("");
                setEditingSummary(true);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--brand)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Adicionar motivo do contato
            </button>
          )}
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
