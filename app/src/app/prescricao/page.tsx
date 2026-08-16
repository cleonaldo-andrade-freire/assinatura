import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { resolveReasonSegments } from "@/lib/documentReason";
import { formatBRDate } from "@/lib/date";
import type { Prescription } from "@/lib/database.types";

export default async function PrescricaoPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token || !isValidToken(token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase.from("prescriptions").select("*").eq("token", token).maybeSingle();
  if (!prescription) notFound();
  const p = prescription as Prescription;

  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", p.clinic_id).single();

  const notesSegments = p.notes
    ? resolveReasonSegments(p.notes, {
        paciente_nome: p.patient_name,
        paciente_cpf: p.patient_cpf ?? "",
        data_emissao: formatBRDate(p.created_at),
      })
    : null;

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {clinic?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinic.logo_url}
            alt=""
            style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
          />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {clinic?.name || "Clínica"}
        </span>
      </header>

      {p.status !== "assinado" ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Documento em processamento</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Sua prescrição ainda está sendo preparada. Atualize esta página em alguns instantes.
          </p>
        </div>
      ) : (
        <>
          {p.signature_provider !== "certisign" && (
            <div
              style={{
                background: "#f7ecd9",
                border: "1px solid #e9d2a3",
                color: "#7a5a17",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              ⚠️ Assinatura digital simulada — sem validade jurídica, aguardando a contratação do certificado A3 em
              nuvem pela clínica.
            </div>
          )}

          <div className="card">
            <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
              Prescrição odontológica
            </p>
            <h1>Documento assinado</h1>
            <p style={{ fontSize: 15, marginBottom: 18 }}>
              Paciente: <strong style={{ color: "var(--brand-deep)" }}>{p.patient_name}</strong>
            </p>
            <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Dentista responsável</dt>
                <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                  {p.dentist_name} — CRO {p.dentist_cro}/{p.dentist_cro_uf}
                </dd>
              </div>
              {p.items.map((item, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>
                    Medicamento {i + 1}
                  </dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                    {item.drug_name} — {item.dosage}, {item.instructions}
                    {item.generic_allowed && " (aceita genérico)"}
                  </dd>
                </div>
              ))}
              {notesSegments && (
                <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Orientações gerais</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                    {notesSegments.map((seg, i) =>
                      seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
            <a
              href={`/api/prescriptions/${p.token}/pdf`}
              download={`prescricao-${p.patient_name}.pdf`}
              className="btn-primary"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Baixar prescrição em PDF
            </a>
          </div>
        </>
      )}
    </div>
  );
}
