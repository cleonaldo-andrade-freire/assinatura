import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/validation";
import { formatDateOnlyBR, formatTimestampBR } from "@/lib/date";
import { clinicLinkPreview } from "@/lib/linkPreview";
import { getContractByToken } from "@/lib/roomRentalContractServer";
import { contractClauses, contractShiftLabel, formatContractAmount, lessorLine, partyLine } from "@/lib/roomRentalContract";
import { ContratoAssinatura } from "./ContratoAssinatura";

export const dynamic = "force-dynamic";

export function generateMetadata({ searchParams }: { searchParams: { token?: string } }) {
  return clinicLinkPreview("contrato", searchParams.token);
}

const label: React.CSSProperties = { fontSize: 12.5, color: "var(--ink-soft)" };
const value: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600 };

/** Contrato de locação da sala por turno — aberto pelo link do WhatsApp. */
export default async function ContratoLocacaoPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token || !isValidToken(token)) notFound();
  const contract = await getContractByToken(token);
  if (!contract) notFound();

  const { snapshot: s } = contract;
  const clauses = contractClauses(s);

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {contract.clinicLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contract.clinicLogoUrl} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }} />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>{contract.clinicName}</span>
      </header>

      {contract.cancelled && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Locação cancelada</h1>
          <p style={{ color: "var(--ink-soft)" }}>Esta locação foi cancelada pela clínica e o contrato não vale mais.</p>
        </div>
      )}

      {!contract.cancelled && (
        <div className="card" style={{ paddingBottom: contract.signedAt ? undefined : 8 }}>
          <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
            Contrato de locação
          </p>
          <h1>Locação da sala por turno</h1>

          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "16px 0 20px" }}>
            <div>
              <dt style={label}>Locatário</dt>
              <dd style={value}>{s.tenant.name}</dd>
            </div>
            <div>
              <dt style={label}>Dia</dt>
              <dd style={value}>{formatDateOnlyBR(s.rental.date)}</dd>
            </div>
            <div>
              <dt style={label}>Turno</dt>
              <dd style={value}>{contractShiftLabel(s.rental)}</dd>
            </div>
            <div>
              <dt style={label}>Valor</dt>
              <dd style={value}>{formatContractAmount(s.rental.amount)}</dd>
            </div>
          </dl>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, fontSize: 14.5, lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 6px" }}>
              <strong>LOCADORA:</strong> {lessorLine(s.lessor)}.
            </p>
            <p style={{ margin: "0 0 14px" }}>
              <strong>LOCATÁRIO:</strong> {partyLine(s.tenant.name, s.tenant.document, s.tenant.cro, s.tenant.croUf)}.
            </p>
            <p style={{ margin: "0 0 14px" }}>As partes acima combinam a locação da sala nas condições abaixo.</p>

            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {clauses.map((c) => (
                <li key={c.title} style={{ marginBottom: 12 }}>
                  <strong>{c.title}.</strong>
                  {c.paragraphs.map((p, i) => (
                    <p key={i} style={{ margin: "4px 0 0" }}>
                      {p}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          </div>

          {contract.signedAt && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
              {contract.signatureDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contract.signatureDataUrl} alt="Assinatura do locatário" style={{ maxWidth: 260, width: "100%", display: "block" }} />
              )}
              <div style={{ borderTop: "1px solid var(--ink)", maxWidth: 260, paddingTop: 4, fontSize: 13.5 }}>{s.tenant.name}</div>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "8px 0 0" }}>
                Assinado eletronicamente em {formatTimestampBR(contract.signedAt)}.
              </p>
              <a
                href={`/api/contrato-locacao/${encodeURIComponent(token)}/pdf`}
                download={`contrato-locacao-${s.rental.date}.pdf`}
                style={{
                  display: "inline-flex", marginTop: 14, background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)",
                  borderRadius: "var(--radius-sm)", padding: "10px 18px", fontSize: 14, fontWeight: 600, textDecoration: "none",
                }}
              >
                Baixar contrato em PDF
              </a>
            </div>
          )}
        </div>
      )}

      {!contract.cancelled && !contract.signedAt && <ContratoAssinatura token={token} contentHash={contract.contentHash} />}
    </div>
  );
}
