"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PriceTable } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function NewPriceTableForm({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao criar a tabela.");
        return;
      }
      const priceTable = data.priceTable as PriceTable;
      router.push(`/dashboard/configuracoes/tabelas-tratamento/${priceTable.id}`);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className={styles.field} style={{ flex: 1, minWidth: 220 }}>
        <label htmlFor="tableName" className={styles.label}>
          Nome da tabela
        </label>
        <input
          id="tableName"
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Particular, Unimed Odonto…"
          required
        />
      </div>
      <button type="submit" disabled={sending} className={`${styles.btn} ${styles.btnPrimary}`}>
        {sending ? "Criando…" : "+ Nova tabela"}
      </button>
      {error && <div className="error-box" style={{ width: "100%" }}>{error}</div>}
    </form>
  );
}
