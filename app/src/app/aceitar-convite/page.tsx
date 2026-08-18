"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Página de aceite de convite para novos membros da equipe.
 * O Supabase redireciona aqui após o clique no link do e-mail de convite,
 * com o token de sessão no hash da URL. O usuário define sua senha e
 * é redirecionado para o dashboard.
 */
export default function AceitarConvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // O Supabase injeta o token no hash — esperamos o client processar a sessão
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Processa o hash imediatamente caso já esteja disponível
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Bem-vindo(a)!</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 24 }}>
          Defina sua senha para acessar o sistema.
        </p>

        {!ready && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Verificando convite…</p>
        )}

        {ready && (
          <>
            {error && (
              <div className="error-box">{error}</div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="password">Nova senha</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                    style={{
                      position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, padding: 0,
                      background: "none", border: "none", borderRadius: "var(--radius-sm)",
                      color: "var(--ink-faint)", cursor: "pointer",
                    }}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M6.6 6.6C4.2 8.2 2.5 10.5 2 12c1.4 4 5.7 7 10 7 1.7 0 3.3-.4 4.7-1.2M9.9 4.2C10.6 4.1 11.3 4 12 4c4.3 0 8.6 3 10 7-.5 1.4-1.4 2.9-2.5 4.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2 12c1.4-4 5.7-7 10-7s8.6 3 10 7c-1.4 4-5.7 7-10 7s-8.6-3-10-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirmar senha</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? "Definindo…" : "Definir senha e entrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
