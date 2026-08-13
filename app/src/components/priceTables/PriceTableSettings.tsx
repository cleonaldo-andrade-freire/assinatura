"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { PriceTable } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PriceTableSettings({ clinicId, table }: { clinicId: string; table: PriceTable }) {
  const router = useRouter();
  const [name, setName] = useState(table.name);
  const [savingName, setSavingName] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/clinics/${clinicId}/price-tables/${table.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      push("Falha ao salvar. Tenta de novo.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === table.name) return;
    setSavingName(true);
    try {
      const ok = await patch({ name: name.trim() });
      if (ok) push("Nome atualizado.", "success");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSetDefault() {
    setSettingDefault(true);
    try {
      const ok = await patch({ is_default: true });
      if (ok) push("Tabela marcada como padrão.", "success");
    } finally {
      setSettingDefault(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${table.id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao duplicar. Tenta de novo.");
        return;
      }
      push("Tabela duplicada.", "success");
      router.push(`/dashboard/configuracoes/tabelas-tratamento/${data.priceTable.id}`);
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${table.id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      router.push("/dashboard/configuracoes/tabelas-tratamento");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form onSubmit={handleRename} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className={styles.field} style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="tableRename" className={styles.label}>
            Nome da tabela
          </label>
          <input
            id="tableRename"
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={savingName || name.trim() === table.name} className={`${styles.btn} ${styles.btnGhost}`}>
          {savingName ? "Salvando…" : "Salvar nome"}
        </button>
      </form>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {table.is_default ? (
          <span className={`${styles.statusDot} ${styles.statusOk}`}>Tabela padrão</span>
        ) : (
          <button type="button" disabled={settingDefault} onClick={handleSetDefault} className={`${styles.btn} ${styles.btnGhost}`}>
            {settingDefault ? "Marcando…" : "Marcar como padrão"}
          </button>
        )}
        <button type="button" disabled={duplicating} onClick={handleDuplicate} className={`${styles.btn} ${styles.btnGhost}`}>
          {duplicating ? "Duplicando…" : "Duplicar tabela"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ color: "var(--danger)" }}
        >
          Excluir tabela
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Excluir tabela de tratamento"
        message={`Isso remove "${table.name}" e todos os tratamentos cadastrados nela. Orçamentos já salvos não são afetados.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
