"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PatientAvatar } from "@/components/PatientAvatar";
import { PROSTHESIS_STAGES, PROSTHESIS_STAGE_LABEL } from "@/lib/prosthesisTemplates";
import { formatBRDate } from "@/lib/date";
import type { ProsthesisOrder, ProsthesisStage } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function daysInStage(stageSince: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(stageSince).getTime()) / 86400000));
}

const SHOW_REALIZADO_KEY = "prosthesis-show-realizado";

export function ProsthesisBoard({ clinicId, orders }: { clinicId: string; orders: ProsthesisOrder[] }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ProsthesisStage | null>(null);
  const [moving, setMoving] = useState(false);
  const [search, setSearch] = useState("");
  // Serviço já realizado deixa de precisar de atenção no dia a dia — some do
  // board por padrão, com um toggle pra reabrir quando precisar consultar
  // (ex.: conferir uma prótese antiga). Preferência lembrada por navegador.
  const [showRealizado, setShowRealizado] = useState(false);
  useEffect(() => setShowRealizado(localStorage.getItem(SHOW_REALIZADO_KEY) === "1"), []);
  function toggleShowRealizado() {
    setShowRealizado((prev) => {
      const next = !prev;
      localStorage.setItem(SHOW_REALIZADO_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Estado local otimista: o card muda de coluna assim que solta, sem
  // esperar o PATCH voltar (que inclui o envio da mensagem de WhatsApp —
  // podia demorar mais de um segundo e a transição parecia travada).
  // Ressincroniza com a prop sempre que o servidor manda dado novo
  // (router.refresh() depois de qualquer movimentação bem-sucedida).
  const [localOrders, setLocalOrders] = useState(orders);
  useEffect(() => setLocalOrders(orders), [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? localOrders.filter((o) => o.patient_name.toLowerCase().includes(q)) : localOrders;
  }, [localOrders, search]);

  const byStage = useMemo(() => {
    const map = new Map<ProsthesisStage, ProsthesisOrder[]>();
    for (const stage of PROSTHESIS_STAGES) map.set(stage, []);
    for (const o of filteredOrders) map.get(o.stage)?.push(o);
    return map;
  }, [filteredOrders]);

  // A coluna "Realizado" fica sempre visível (mesmo comportamento das
  // outras) — só os cards de paciente dentro dela é que somem quando o
  // toggle está desmarcado, pra não perder o board de referência.
  const visibleStages = PROSTHESIS_STAGES;
  const hiddenRealizadoCount = showRealizado ? 0 : byStage.get("realizado")?.length ?? 0;

  async function handleDrop(orderId: string, stage: ProsthesisStage) {
    setDragOverStage(null);
    const previous = localOrders;
    if (previous.find((o) => o.id === orderId)?.stage === stage) return;

    setLocalOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, stage } : o)));
    setMoving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLocalOrders(previous);
        push(data?.message || data?.error || "Falha ao mover o serviço.");
        return;
      }
      push(`Movido pra ${PROSTHESIS_STAGE_LABEL[stage]}.`, "success");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <div className={styles.searchBox} style={{ minWidth: 240 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por paciente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showRealizado}
            onChange={toggleShowRealizado}
            style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
          />
          Mostrar realizados{hiddenRealizadoCount > 0 ? ` (${hiddenRealizadoCount})` : ""}
        </label>
      </div>

      <div className={styles.prosthesisBoard}>
        {visibleStages.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const isHiddenRealizado = stage === "realizado" && !showRealizado;
          const displayItems = isHiddenRealizado ? [] : items;
          return (
            <div
              key={stage}
              className={styles.prosthesisColumn}
              onDragOver={
                !moving && draggingId
                  ? (e) => {
                      e.preventDefault();
                      if (dragOverStage !== stage) setDragOverStage(stage);
                    }
                  : undefined
              }
              onDragLeave={!moving && draggingId ? () => setDragOverStage((s) => (s === stage ? null : s)) : undefined}
              onDrop={
                !moving && draggingId
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      setDraggingId(null);
                      if (id) handleDrop(id, stage);
                    }
                  : undefined
              }
              style={{
                background: dragOverStage === stage ? "var(--brand-tint)" : undefined,
                outline: dragOverStage === stage ? "2px dashed var(--brand)" : undefined,
              }}
            >
              <div className={styles.prosthesisColumnHeader}>
                <span>{PROSTHESIS_STAGE_LABEL[stage]}</span>
                <span className={styles.prosthesisColumnCount}>{items.length}</span>
              </div>

              <div className={styles.prosthesisColumnBody}>
                {displayItems.map((o) => (
                  <Link
                    key={o.id}
                    href={`/dashboard/proteses/${o.id}`}
                    draggable={!moving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", o.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(o.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStage(null);
                    }}
                    className={styles.prosthesisCard}
                    style={{ cursor: moving ? "default" : "grab" }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <PatientAvatar clinicId={clinicId} patientId={o.patient_id} name={o.patient_name} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.prosthesisCardTitle}>{o.description}</div>
                        <div className={styles.prosthesisCardPatient}>{o.patient_name}</div>
                      </div>
                    </div>
                    <div className={styles.prosthesisCardMeta}>
                      {o.expected_delivery_date && <span>Previsão {formatBRDate(`${o.expected_delivery_date}T12:00:00-03:00`)}</span>}
                      <span>{daysInStage(o.stage_since)}d neste estágio</span>
                    </div>
                  </Link>
                ))}
                {isHiddenRealizado && items.length > 0 ? (
                  <p className={styles.prosthesisEmptyColumn}>
                    {items.length} oculto{items.length > 1 ? "s" : ""} — marque "Mostrar realizados" pra ver
                  </p>
                ) : (
                  displayItems.length === 0 && <p className={styles.prosthesisEmptyColumn}>Nada por aqui</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
