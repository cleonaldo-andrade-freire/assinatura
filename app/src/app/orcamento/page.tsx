import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import type { Budget, BudgetItem } from "@/lib/database.types";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export default async function OrcamentoPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token || !isValidToken(token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: budget } = await supabase.from("budgets").select("*").eq("token", token).maybeSingle();
  if (!budget) notFound();
  const b = budget as Budget;

  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", b.clinic_id).single();
  const { data: itemsData } = await supabase
    .from("budget_items")
    .select("*")
    .eq("budget_id", b.id)
    .eq("selected", true)
    .order("display_order", { ascending: true });
  const items = (itemsData as BudgetItem[]) ?? [];
  const selectedValue = items.reduce((sum, i) => sum + i.price, 0);
  const discountAmount = b.discount_type === "percent" ? (selectedValue * b.discount_value) / 100 : b.discount_value;
  const total = Math.max(0, selectedValue - discountAmount);

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
          Orçamento odontológico
        </p>
        <h1>{b.description}</h1>
        <p style={{ fontSize: 15, marginBottom: 18 }}>
          Paciente: <strong style={{ color: "var(--brand-deep)" }}>{b.patient_name}</strong>
        </p>
        <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Data</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatBRDate(`${b.budget_date}T12:00:00-03:00`)}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Responsável</dt>
            <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{b.responsible_name}</dd>
          </div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Tratamentos</dt>
            <dd style={{ margin: 0 }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 14 }}>
                  <span>{item.tooth_region ? `${item.tooth_region} — ${item.treatment_name}` : item.treatment_name}</span>
                  <span style={{ fontWeight: 600, flexShrink: 0 }}>{formatMoney(item.price)}</span>
                </div>
              ))}
            </dd>
          </div>
          <div style={{ padding: "12px 0" }}>
            <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>Total</dt>
            <dd style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--brand-deep)" }}>{formatMoney(total)}</dd>
          </div>
        </dl>
      </div>

      {b.pdf_storage_key && (
        <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
          <a
            href={`/api/budgets/${b.token}/pdf`}
            download={`orcamento-${b.patient_name}.pdf`}
            className="btn-primary"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            Baixar orçamento em PDF
          </a>
        </div>
      )}
    </div>
  );
}
