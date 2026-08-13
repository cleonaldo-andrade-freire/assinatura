import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PriceTableSettings } from "@/components/priceTables/PriceTableSettings";
import { PriceTableItemsEditor } from "@/components/priceTables/PriceTableItemsEditor";
import type { PriceTable, PriceTableItem } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function PriceTableDetailPage({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: table } = await supabase
    .from("price_tables")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!table) notFound();
  const priceTable = table as PriceTable;

  const { data: itemsData } = await supabase
    .from("price_table_items")
    .select("*")
    .eq("price_table_id", priceTable.id)
    .order("specialty", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });
  const items = (itemsData as PriceTableItem[]) ?? [];

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={priceTable.name}
      subtitle={priceTable.is_default ? "Tabela padrão" : undefined}
      actions={
        <Link href="/dashboard/configuracoes/tabelas-tratamento" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Tabelas de tratamento
        </Link>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Dados da tabela</p>
        </div>
        <div className={styles.panelBody}>
          <PriceTableSettings clinicId={clinic.id} table={priceTable} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Tratamentos</p>
        </div>
        <div className={styles.panelBody}>
          <PriceTableItemsEditor clinicId={clinic.id} priceTableId={priceTable.id} initialItems={items} />
        </div>
      </div>
    </ClinicShell>
  );
}
