import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { NewPriceTableForm } from "@/components/priceTables/NewPriceTableForm";
import type { PriceTable } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function PriceTablesPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: tables } = await supabase
    .from("price_tables")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("name", { ascending: true });
  const priceTables = (tables as PriceTable[]) ?? [];

  const { data: itemCounts } = await supabase
    .from("price_table_items")
    .select("price_table_id")
    .eq("clinic_id", clinic.id);
  const countByTable = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countByTable.set(row.price_table_id, (countByTable.get(row.price_table_id) ?? 0) + 1);
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Tabelas de tratamento"
      subtitle="Preços por plano (particular, convênios) usados ao montar um orçamento"
      actions={
        <Link href="/dashboard/configuracoes" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Configurações
        </Link>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Nova tabela</p>
        </div>
        <div className={styles.panelBody}>
          <NewPriceTableForm clinicId={clinic.id} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Tabelas cadastradas</p>
        </div>
        {priceTables.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma tabela de tratamento cadastrada ainda.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tratamentos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {priceTables.map((t) => (
                <ClickableRow key={t.id} href={`/dashboard/configuracoes/tabelas-tratamento/${t.id}`}>
                  <td className={styles.rowTitle}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {t.name}
                      {t.is_default && <span className={`${styles.statusDot} ${styles.statusOk}`}>Padrão</span>}
                    </span>
                  </td>
                  <td data-label="Tratamentos">{countByTable.get(t.id) ?? 0}</td>
                  <td style={{ textAlign: "right", color: "var(--ink-faint)" }}>›</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ClinicShell>
  );
}
