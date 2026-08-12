import { redirect } from "next/navigation";

export default function ValidarPage({ searchParams }: { searchParams: { code?: string } }) {
  if (searchParams.code?.trim()) {
    redirect(`/validar/${encodeURIComponent(searchParams.code.trim())}`);
  }

  return (
    <div className="wrap">
      <div className="card">
        <p
          style={{
            textTransform: "uppercase",
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--brand)",
            margin: "0 0 10px",
          }}
        >
          Portal de validação
        </p>
        <h1>Verificar autenticidade</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 24 }}>
          Digite o código de validação impresso no atestado ou na prescrição odontológica, ou aponte a câmera do
          celular pro QR code no rodapé do documento.
        </p>

        <form method="GET" action="/validar">
          <div className="field">
            <label htmlFor="code">Código de validação</label>
            <input
              id="code"
              name="code"
              type="text"
              placeholder="Ex.: ABCD-1234"
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </div>
          <button className="btn-primary" type="submit">
            Verificar
          </button>
        </form>
      </div>
    </div>
  );
}
