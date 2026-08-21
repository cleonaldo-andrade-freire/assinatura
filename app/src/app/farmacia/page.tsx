import { redirect } from "next/navigation";

export default function FarmaciaPage({ searchParams }: { searchParams: { code?: string } }) {
  if (searchParams.code?.trim()) {
    redirect(`/farmacia/${encodeURIComponent(searchParams.code.trim())}`);
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
          Área da farmácia
        </p>
        <h1>Dar baixa num receituário</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 24 }}>
          Digite o código impresso no receituário odontológico, ou aponte a câmera do celular pro QR code no rodapé
          do documento.
        </p>

        <form method="GET" action="/farmacia">
          <div className="field">
            <label htmlFor="code">Código do receituário</label>
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
            Continuar
          </button>
        </form>
      </div>
    </div>
  );
}
