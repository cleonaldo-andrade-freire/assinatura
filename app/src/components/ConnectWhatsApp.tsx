"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import styles from "@/styles/shell.module.css";

type Status = "checking" | "disconnected" | "connecting" | "connected";

export function ConnectWhatsApp({ clinicId, initialWhatsappNumber }: { clinicId: string; initialWhatsappNumber: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [number, setNumber] = useState(formatBRPhoneLocal(initialWhatsappNumber ?? ""));
  const [numberSaved, setNumberSaved] = useState(!!initialWhatsappNumber);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkStatus() {
    const res = await fetch(`/api/clinics/${clinicId}/whatsapp/status`);
    const data = await res.json();
    if (data.state === "open") {
      setStatus("connected");
      if (pollRef.current) clearInterval(pollRef.current);
    } else if (status !== "connecting") {
      setStatus("disconnected");
    }
  }

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/whatsapp/connect`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Não foi possível gerar o QR Code.");
        return;
      }
      setQrCode(data.qrcode_base64);
      setStatus("connecting");

      pollRef.current = setInterval(checkStatus, 3000);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNumber(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/whatsapp/number`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_number: toE164BR(number) }),
      });
      if (!res.ok) {
        setError("Falha ao salvar o número.");
        return;
      }
      setNumberSaved(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") {
    return <p style={{ color: "var(--ink-soft)" }}>Verificando…</p>;
  }

  if (status === "connected") {
    return (
      <div>
        <div
          style={{
            background: "var(--brand-tint)",
            color: "var(--brand-deep)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ✅ WhatsApp conectado.
        </div>

        {!numberSaved && (
          <form onSubmit={handleSaveNumber}>
            <p style={{ fontSize: 14, marginBottom: 10 }}>Confirme o número que você conectou:</p>
            {error && <div className="error-box">{error}</div>}
            <div className="field">
              <label htmlFor="waNumber">Número de WhatsApp</label>
              <div style={{ display: "flex" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    border: "1.5px solid var(--line)",
                    borderRight: "none",
                    borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                    background: "var(--surface)",
                    color: "var(--ink-soft)",
                  }}
                >
                  🇧🇷 +55
                </span>
                <input
                  id="waNumber"
                  type="text"
                  inputMode="numeric"
                  style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
                  value={number}
                  onChange={(e) => setNumber(formatBRPhoneLocal(e.target.value))}
                  placeholder="(79) 99999-9999"
                  required
                />
              </div>
            </div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Confirmar número"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      {status === "connecting" && qrCode ? (
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="QR Code do WhatsApp" style={{ width: 240, height: 240, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            Abre o WhatsApp no celular da clínica → Aparelhos conectados → Conectar um aparelho, e escaneia esse
            código.
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 16 }}>
            Seu WhatsApp ainda não está conectado. Clica no botão pra gerar o QR Code.
          </p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleConnect} disabled={loading}>
            {loading ? "Gerando…" : "Conectar WhatsApp"}
          </button>
        </>
      )}
    </div>
  );
}
