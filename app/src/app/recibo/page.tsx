import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import type { Receipt, TreatmentDebit } from "@/lib/database.types";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export default async function ReciboPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token || !isValidToken(token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: receipt } = await supabase.from("receipts").select("*").eq("token", token).maybeSingle();
  if (!receipt) notFound();
  const r = receipt as Receipt;

  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", r.clinic_id).single();
  const { data: debitsData } = await supabase.from("treatment_debits").select("*").eq("receipt_id", r.id).order("created_at", { ascending: true });
  const debits = (debitsData as TreatmentDebit[]) ?? [];

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {clinic?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clinic.logo_url} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }} />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {clinic?.name || "Clínica"}
        </span>
      </header>

      <div className="card">
        <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
          Recibo de pagamento
        </p>
        <p style={{ fontSize: 15, marginBottom: 18 }}>
          Paciente: <strong style={{ color: "var(--brand-deep)" }}>{r.patient_name}</strong>
        </p>
        <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Data de emissão</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatBRDate(r.created_at)}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Tratamentos pagos</dt>
            <dd style={{ margin: 0 }}>
              {debits.map((d) => (
                <div key={d.id} style={{ padding: "6px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
                    <span>{d.description}</span>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{formatMoney(d.amount)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {[d.payment_method, d.paid_at ? formatBRDate(d.paid_at) : null].filter(Boolean).join(" — ")}
                  </div>
                </div>
              ))}
            </dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Total</dt>
            <dd style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--brand-deep)" }}>{formatMoney(r.total_amount)}</dd>
          </div>
          <div style={{ padding: "12px 0" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Declarado no IR</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{r.declared_ir ? "Sim" : "Não"}</dd>
          </div>
        </dl>
      </div>

      {r.pdf_storage_key && (
        <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
          <a
            href={`/api/recibos/${r.token}/pdf`}
            download={`recibo-${r.patient_name}.pdf`}
            className="btn-primary"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            Baixar recibo em PDF
          </a>
        </div>
      )}
    </div>
  );
}
