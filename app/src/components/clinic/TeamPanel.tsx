"use client";

import { useState } from "react";
import styles from "@/styles/shell.module.css";

interface Member {
  id: string;
  email: string;
  role: "owner" | "staff";
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Dentista / Dono",
  staff: "Atendente",
};

export function TeamPanel({
  clinicId,
  currentUserId,
  initialMembers,
}: {
  clinicId: string;
  currentUserId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("staff");
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/staff/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Erro ao enviar convite.");
        return;
      }
      setSuccess(`Convite enviado para ${email}!`);
      setEmail("");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(userId: string, memberEmail: string) {
    if (!confirm(`Remover acesso de ${memberEmail}?`)) return;
    setRevoking(userId);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/staff/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Erro ao revogar acesso.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      {/* Lista de membros */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Membros da equipe</p>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Função</th>
              <th>Desde</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.email}</td>
                <td>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: m.role === "owner" ? "var(--brand-tint)" : "var(--surface-sunken)",
                      color: m.role === "owner" ? "var(--brand-deep)" : "var(--ink-soft)",
                    }}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </td>
                <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  {new Date(m.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td>
                  {m.id !== currentUserId ? (
                    <button
                      type="button"
                      disabled={revoking === m.id}
                      onClick={() => handleRevoke(m.id, m.email)}
                      style={{
                        fontSize: 12,
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--danger-faint)",
                        background: "var(--danger-tint)",
                        color: "var(--danger)",
                        cursor: "pointer",
                        opacity: revoking === m.id ? 0.5 : 1,
                      }}
                    >
                      {revoking === m.id ? "…" : "Revogar"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Você</span>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--ink-faint)", textAlign: "center", padding: "20px 0" }}>
                  Nenhum membro cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Convidar novo membro */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Convidar membro</p>
        </div>
        <div className={styles.panelBody}>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 18 }}>
            O convidado receberá um e-mail com um link para definir sua senha e acessar o sistema.
          </p>

          {error && (
            <div style={{ background: "var(--danger-tint)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13.5 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: "var(--brand-tint)", color: "var(--brand-deep)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13.5 }}>
              ✓ {success}
            </div>
          )}

          <form onSubmit={handleInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                E-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="atendente@clinica.com"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  background: "var(--surface)",
                  color: "var(--ink)",
                }}
              />
            </div>
            <div style={{ width: 200 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Função
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "owner" | "staff")}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  background: "var(--surface)",
                  color: "var(--ink)",
                }}
              >
                <option value="staff">Atendente</option>
                <option value="owner">Dentista / Dono</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ height: 38 }}
            >
              {loading ? "Enviando…" : "Enviar convite"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
