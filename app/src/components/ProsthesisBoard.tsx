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

export function ProsthesisBoard({ clinicId, orders }: { clinicId: string; orders: ProsthesisOrder[] }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ProsthesisStage | null>(null);
  const [moving, setMoving] = useState(false);

  // Estado local otimista: o card muda de coluna assim que solta, sem
  // esperar o PATCH voltar (que inclui o envio da mensagem de WhatsApp —
  // podia demorar mais de um segundo e a transição parecia travada).
  // Ressincroniza com a prop sempre que o servidor manda dado novo
  // (router.refresh() depois de qualquer movimentação bem-sucedida).
  const [localOrders, setLocalOrders] = useState(orders);
  useEffect(() => setLocalOrders(orders), [orders]);

  const byStage = useMemo(() => {
    const map = new Map<ProsthesisStage, ProsthesisOrder[]>();
    for (const stage of PROSTHESIS_STAGES) map.set(stage, []);
    for (const o of localOrders) map.get(o.stage)?.push(o);
    return map;
  }, [localOrders]);

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
      <div className={styles.prosthesisBoard}>
        {PROSTHESIS_STAGES.map((stage) => {
          const items = byStage.get(stage) ?? [];
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
                {items.map((o) => (
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
                {items.length === 0 && <p className={styles.prosthesisEmptyColumn}>Nada por aqui</p>}
              </div>
            </div>
          );
        })}
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
