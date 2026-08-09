"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Senha incorreta.");
        return;
      }
      router.push("/admin/clinics");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--brand-deep)",
      }}
    >
      <div className="wrap" style={{ padding: 0 }}>
        <div className="card" style={{ width: 360 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--brand-tint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 18,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2c-2.2 0-3.4 1.1-4.5 1.1C6.3 3.1 5 2 3.6 2 1.9 2 1 3.6 1 5.8c0 3 1.4 6.9 2.3 9.4.6 1.7 1.1 3.6 2.4 3.6 1.6 0 1.5-2.4 1.9-4.3.3-1.4.7-2.6 1.4-2.6.8 0 1.1 1.3 1.4 2.6.4 1.9.3 4.3 1.9 4.3 1.3 0 1.8-1.9 2.4-3.6.9-2.5 2.3-6.4 2.3-9.4C23 3.6 22.1 2 20.4 2c-1.4 0-2.7 1.1-3.9 1.1C15.4 3.1 14.2 2 12 2z"
                fill="#2C6659"
              />
            </svg>
          </div>
          <h1>Painel administrativo</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 20 }}>
            Acesso restrito ao operador da plataforma.
          </p>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="password">Senha mestra</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                autoFocus
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
