"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "confirmed" | "cancelled" | "error";

export function ConfirmationActions({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [action, setAction] = useState<"confirm" | "cancel" | null>(null);

  async function send(a: "confirm" | "cancel") {
    setAction(a);
    setStatus("sending");
    try {
      const res = await fetch(`/api/appointments/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: a }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus(a === "confirm" ? "confirmed" : "cancelled");
    } catch {
      setStatus("error");
    }
  }

  if (status === "confirmed") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1>Presença confirmada</h1>
        <p style={{ color: "var(--ink-soft)" }}>Combinado! A clínica já foi avisada. Te esperamos lá.</p>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1>Agendamento cancelado</h1>
        <p style={{ color: "var(--ink-soft)" }}>Tudo bem — se quiser remarcar, é só chamar a clínica pelo WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="card">
      {status === "error" && (
        <div className="error-box">
          Não conseguimos processar agora. Verifique sua internet e tente de novo.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="btn-primary" disabled={status === "sending"} onClick={() => send("confirm")}>
          {status === "sending" && action === "confirm" ? "Confirmando…" : "✅ Confirmar presença"}
        </button>
        <button
          type="button"
          disabled={status === "sending"}
          onClick={() => send("cancel")}
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            color: "var(--danger)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 18px",
            fontSize: 16,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: status === "sending" ? "not-allowed" : "pointer",
          }}
        >
          {status === "sending" && action === "cancel" ? "Cancelando…" : "❌ Cancelar consulta"}
        </button>
      </div>
    </div>
  );
}
