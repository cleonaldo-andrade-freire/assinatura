import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import type { Certificate } from "@/lib/database.types";
import { isRealSignatureProvider } from "@/lib/signature/providerLabel";

export default async function AtestadoPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token || !isValidToken(token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase.from("certificates").select("*").eq("token", token).maybeSingle();
  if (!certificate) notFound();
  const c = certificate as Certificate;

  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", c.clinic_id).single();

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

      {c.status !== "assinado" ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Documento em processamento</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Seu atestado ainda está sendo preparado. Atualize esta página em alguns instantes.
          </p>
        </div>
      ) : (
        <>
          {!isRealSignatureProvider(c.signature_provider) && (
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
              Atestado odontológico
            </p>
            <h1>Documento assinado</h1>
            <p style={{ fontSize: 15, marginBottom: 18 }}>
              Paciente: <strong style={{ color: "var(--brand-deep)" }}>{c.patient_name}</strong>
            </p>
            <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Dentista responsável</dt>
                <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                  {c.dentist_name} — CRO {c.dentist_cro}/{c.dentist_cro_uf}
                </dd>
              </div>
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Início do afastamento</dt>
                <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatBRDate(`${c.starts_on}T12:00:00-03:00`)}</dd>
              </div>
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Dias de afastamento</dt>
                <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{c.rest_days}</dd>
              </div>
              {!c.hide_cid_on_patient_pdf && c.cid && (
                <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>CID</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{c.cid}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
            <a
              href={`/api/certificates/${c.token}/pdf`}
              download={`atestado-${c.patient_name}.pdf`}
              className="btn-primary"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18v1.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              Baixar atestado em PDF
            </a>
          </div>
        </>
      )}
    </div>
  );
}
