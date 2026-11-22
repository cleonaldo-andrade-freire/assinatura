"use client";

import { useEffect, useMemo, useState } from "react";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatBRPhoneLocal } from "@/lib/validation";
import styles from "@/styles/shell.module.css";

type Member = { phone: string; name: string | null; patient_id: string | null; lead_id: string | null; removed: boolean };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Rascunho: quem vai receber o convite. Desmarcar tira o contato só desta campanha. */
export function DraftAudienceList({ clinicId, campaignId }: { clinicId: string; campaignId: string }) {
  const { toasts, push, dismiss } = useToasts();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/clinics/${clinicId}/campaigns/${campaignId}/recipients`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setMembers(data.members))
      .catch(() => setFailed(true));
  }, [clinicId, campaignId]);

  const shown = useMemo(() => {
    if (!members) return [];
    const q = normalize(search.trim());
    const digits = search.replace(/\D/g, "");
    if (!q) return members;
    return members.filter((m) => normalize(m.name || "").includes(q) || (digits.length >= 3 && m.phone.includes(digits)));
  }, [members, search]);

  async function toggle(member: Member) {
    const removed = !member.removed;
    setBusy((prev) => new Set(prev).add(member.phone));
    setMembers((prev) => prev?.map((m) => (m.phone === member.phone ? { ...m, removed } : m)) ?? prev);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/campaigns/${campaignId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: member.phone, removed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Não foi possível salvar.");
      }
    } catch (err) {
      setMembers((prev) => prev?.map((m) => (m.phone === member.phone ? { ...m, removed: !removed } : m)) ?? prev);
      push(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(member.phone);
        return next;
      });
    }
  }

  const removedCount = members?.filter((m) => m.removed).length ?? 0;
  const receiving = (members?.length ?? 0) - removedCount;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader} style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <span className={styles.panelHeaderTitle}>Quem vai receber</span>
          {members && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
              {receiving} {receiving === 1 ? "contato" : "contatos"}
              {removedCount > 0 && ` · ${removedCount} ${removedCount === 1 ? "retirado" : "retirados"}`} — desmarque quem não deve receber esta campanha
            </div>
          )}
        </div>
        {members && members.length > 0 && (
          <input className={styles.input} placeholder="Buscar nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        )}
      </div>

      {failed ? (
        <div className={styles.emptyState}>Não foi possível carregar a lista de contatos.</div>
      ) : !members ? (
        <div className={styles.emptyState}>Carregando contatos…</div>
      ) : members.length === 0 ? (
        <div className={styles.emptyState}>Nenhum contato no público escolhido.</div>
      ) : shown.length === 0 ? (
        <div className={styles.emptyState}>Nenhum contato encontrado.</div>
      ) : (
        <div>
          {shown.map((m) => (
            <label
              key={m.phone}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 24px",
                borderTop: "1px solid var(--line)",
                cursor: "pointer",
                opacity: m.removed ? 0.55 : 1,
              }}
            >
              <input type="checkbox" checked={!m.removed} disabled={busy.has(m.phone)} onChange={() => toggle(m)} style={{ width: 18, height: 18 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: m.removed ? "line-through" : undefined }}>{m.name || "Sem nome"}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                  {formatBRPhoneLocal(m.phone)} · {m.patient_id ? "paciente" : "lead"}
                  {m.removed && " · não vai receber"}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
