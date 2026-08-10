"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Lê parâmetros tanto da query string (?erro=) quanto do fragmento (#erro=) — o Supabase usa os dois formatos dependendo do tipo de falha. */
function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  if (search.get(name)) return search.get(name);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get(name);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const errorCode = readParam("error_code") || readParam("error");
    const errorDescription = readParam("error_description");
    if (errorCode) {
      const reason = errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, " ")) : errorCode;
      setError(
        `O link de redefinição não é mais válido (motivo: ${reason}). Isso costuma acontecer quando o link já foi aberto antes (às vezes pelo próprio antivírus/scanner de segurança do e-mail) — peça um novo em "Esqueci minha senha".`
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("Falha ao redefinir senha:", error);
        setError(
          `Não foi possível redefinir a senha (motivo: ${error.message}). O link pode já ter sido usado — peça um novo em "Esqueci minha senha".`
        );
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Redefinir senha</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 20 }}>Escolha uma nova senha.</p>

        {error && <div className="error-box">{error}</div>}
        {done ? (
          <div
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-deep)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              fontSize: 14,
            }}
          >
            Senha redefinida! Levando você pro painel…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="password">Nova senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirme a nova senha</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
