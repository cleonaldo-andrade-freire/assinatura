"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login/reset-password`,
      });
      if (error) {
        setError("Não conseguimos enviar o e-mail agora. Tenta de novo em instantes.");
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Esqueci minha senha</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 20 }}>
          Digite o e-mail cadastrado — mandamos um link pra você redefinir a senha.
        </p>

        {error && <div className="error-box">{error}</div>}
        {sent ? (
          <div
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-deep)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              fontSize: 14,
            }}
          >
            Se esse e-mail estiver cadastrado, você vai receber um link em instantes. Confira também a caixa de spam.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de redefinição"}
            </button>
          </form>
        )}

        <p style={{ marginTop: 16, fontSize: 13, textAlign: "center" }}>
          <a href="/login">Voltar pro login</a>
        </p>
      </div>
    </div>
  );
}
