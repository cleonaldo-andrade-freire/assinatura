import Link from "next/link";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lookupEvolutionValidation } from "@/lib/documentValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { formatValidationCode } from "@/lib/validationCode";
import { formatBRDate, formatBRDateTime } from "@/lib/date";

export default async function ValidarEvolucaoCodePage({ params }: { params: { code: string } }) {
  const supabase = createSupabaseAdminClient();
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const allowed = await checkRateLimit(supabase, `validar-evolucao:${ip}`, { windowSeconds: 300, maxAttempts: 20 });

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          Portal de validação
        </span>
      </header>

      {!allowed ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Muitas tentativas</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Você tentou validar códigos demais em pouco tempo. Espera alguns minutos e tenta de novo.
          </p>
        </div>
      ) : (
        <ValidationResult code={params.code} supabase={supabase} />
      )}

      <div className="card" style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/validar-evolucao" style={{ fontSize: 13.5 }}>
          ← Verificar outro código
        </Link>
      </div>
    </div>
  );
}

async function ValidationResult({ code, supabase }: { code: string; supabase: ReturnType<typeof createSupabaseAdminClient> }) {
  const result = await lookupEvolutionValidation(supabase, code);

  if (!result.found) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1>Código não encontrado</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          Confira se digitou o código certo. Ele fica no comprovante recebido por WhatsApp e no rodapé do PDF
          assinado.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          background: result.chainIntact ? "#e3f3e8" : "#fbe2e2",
          border: `1px solid ${result.chainIntact ? "#b9dfc4" : "#e6b3b3"}`,
          color: result.chainIntact ? "#256b3c" : "#8a2c2c",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          fontSize: 13,
          marginBottom: 16,
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        {result.chainIntact ? "✅ Assinatura válida" : "⚠️ Trilha de auditoria com inconsistência — contate a clínica"}
      </div>

      <div className="card">
        <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
          Evolução clínica assinada eletronicamente
        </p>
        <h1>Autenticidade confirmada</h1>
        <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Paciente</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{result.patientName}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Dentista responsável</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
              {result.dentistName} — CRO {result.dentistCro}/{result.dentistCroUf}
            </dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Clínica</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{result.clinicName}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Tratamento</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{result.treatmentName}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Data da evolução</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{result.evolutionDate && formatBRDate(result.evolutionDate)}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Assinado em</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{result.signedAt && formatBRDateTime(result.signedAt, "medium")}</dd>
          </div>
          <div style={{ padding: "12px 0" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Código verificado</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatValidationCode(code.toUpperCase())}</dd>
          </div>
        </dl>
      </div>

      {result.sha256 && (
        <div className="card">
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
            Pra conferir que o arquivo em mãos não foi alterado, compare com o hash SHA-256 do PDF original:
          </p>
          <code style={{ fontSize: 12, wordBreak: "break-all", display: "block" }}>{result.sha256}</code>
        </div>
      )}
    </>
  );
}
