"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { PriceTableItem } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function formatPrice(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/** Aceita "150", "150,00" ou "150.00" e devolve um número — mesma tolerância
 * de digitação que o resto do app já dá em campos de dinheiro. */
function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function PriceTableItemsEditor({
  clinicId,
  priceTableId,
  initialItems,
}: {
  clinicId: string;
  priceTableId: string;
  initialItems: PriceTableItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const [newSpecialty, setNewSpecialty] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [adding, setAdding] = useState(false);

  const [editSpecialty, setEditSpecialty] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const price = parsePrice(newPrice);
    if (!newName.trim() || price === null) {
      push("Preencha o tratamento e um valor válido.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty: newSpecialty.trim() || null, name: newName.trim(), price }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao adicionar tratamento.");
        return;
      }
      setItems((prev) => [...prev, data.item as PriceTableItem]);
      setNewSpecialty("");
      setNewName("");
      setNewPrice("");
      refresh();
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item: PriceTableItem) {
    setEditingId(item.id);
    setEditSpecialty(item.specialty ?? "");
    setEditName(item.name);
    setEditPrice(String(item.price));
  }

  async function handleSaveEdit(itemId: string) {
    const price = parsePrice(editPrice);
    if (!editName.trim() || price === null) {
      push("Preencha o tratamento e um valor válido.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty: editSpecialty.trim() || null, name: editName.trim(), price }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao salvar.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === itemId ? (data.item as PriceTableItem) : it)));
      setEditingId(null);
      refresh();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(itemId: string) {
    setDeletingId(itemId);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== itemId));
      setConfirmDeleteId(null);
      refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.length === 0 ? (
        <div className={styles.emptyState}>Nenhum tratamento cadastrado nesta tabela ainda.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Especialidade</th>
              <th>Tratamento</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              editingId === item.id ? (
                <tr key={item.id}>
                  <td>
                    <input
                      type="text"
                      className={styles.input}
                      value={editSpecialty}
                      onChange={(e) => setEditSpecialty(e.target.value)}
                      placeholder="Opcional"
                    />
                  </td>
                  <td>
                    <input type="text" className={styles.input} value={editName} onChange={(e) => setEditName(e.target.value)} required />
                  </td>
                  <td style={{ maxWidth: 120 }}>
                    <input type="text" inputMode="decimal" className={styles.input} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" disabled={savingEdit} onClick={() => handleSaveEdit(item.id)} className={`${styles.btn} ${styles.btnPrimary}`}>
                        {savingEdit ? "Salvando…" : "Salvar"}
                      </button>
                      <button type="button" disabled={savingEdit} onClick={() => setEditingId(null)} className={`${styles.btn} ${styles.btnGhost}`}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td data-label="Especialidade">{item.specialty || "—"}</td>
                  <td className={styles.rowTitle}>{item.name}</td>
                  <td data-label="Valor">{formatPrice(item.price)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => startEdit(item)} className={`${styles.btn} ${styles.btnGhost}`}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ color: "var(--danger)" }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      <form onSubmit={handleAdd} className={styles.formRow} style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className={styles.field} style={{ minWidth: 160 }}>
          <label htmlFor="newSpecialty" className={styles.label}>
            Especialidade
          </label>
          <input
            id="newSpecialty"
            type="text"
            className={styles.input}
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className={styles.field} style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="newName" className={styles.label}>
            Tratamento
          </label>
          <input
            id="newName"
            type="text"
            className={styles.input}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Restauração em Resina Fotopolimerizável 1 face"
            required
          />
        </div>
        <div className={styles.field} style={{ width: 130 }}>
          <label htmlFor="newPrice" className={styles.label}>
            Valor
          </label>
          <input
            id="newPrice"
            type="text"
            inputMode="decimal"
            className={styles.input}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="150,00"
            required
          />
        </div>
        <button type="submit" disabled={adding} className={`${styles.btn} ${styles.btnPrimary}`}>
          {adding ? "Adicionando…" : "+ Adicionar"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir tratamento"
        message="Isso remove o tratamento desta tabela de preço. Orçamentos já salvos com ele não são afetados."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
