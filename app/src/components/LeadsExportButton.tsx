"use client";

import { useState } from "react";
import styles from "@/styles/shell.module.css";

/** Baixa o CSV de leads + conversas a partir de uma data. GET simples (form
 * nativo) — a rota devolve `Content-Disposition: attachment`. */
export function LeadsExportButton({ clinicId }: { clinicId: string }) {
  const [desde, setDesde] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));

  return (
    <form
      method="GET"
      action={`/api/clinics/${clinicId}/leads/export`}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <label htmlFor="leads-export-desde" style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
        desde
      </label>
      <input
        id="leads-export-desde"
        type="date"
        name="desde"
        value={desde}
        onChange={(e) => setDesde(e.target.value)}
        className={styles.input}
        style={{ padding: "4px 8px", width: "auto" }}
      />
      <button type="submit" className={`${styles.btn} ${styles.btnGhost}`}>
        Exportar CSV
      </button>
    </form>
  );
}
