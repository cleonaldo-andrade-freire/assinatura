"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { SpecialtyCombobox } from "@/components/priceTables/SpecialtyCombobox";
import type { PriceTableItem } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import pt from "./priceTables.module.css";

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

/** Agrupa preservando a ordem de chegada (já vem ordenado por especialidade
 * do servidor) — sem reordenar por conta própria aqui. */
function groupBySpecialty(items: PriceTableItem[]): { specialty: string | null; items: PriceTableItem[] }[] {
  const groups: { specialty: string | null; items: PriceTableItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.specialty === item.specialty) {
      last.items.push(item);
    } else {
      groups.push({ specialty: item.specialty, items: [item] });
    }
  }
  return groups;
}

function ToggleSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <label className={pt.switch} aria-label={label} title={label}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className={pt.switchTrack} />
    </label>
  );
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
  // Ressincroniza com o server component depois de um router.refresh() — sem
  // isso, ações que mudam MUITOS itens de uma vez (popular catálogo, ativar
  // todos de uma especialidade) não apareceriam até a próxima navegação.
  useEffect(() => setItems(initialItems), [initialItems]);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [bulkTogglingSpecialty, setBulkTogglingSpecialty] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const [newSpecialty, setNewSpecialty] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [adding, setAdding] = useState(false);

  const [editSpecialty, setEditSpecialty] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const specialtyOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.specialty).filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

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

  async function handleToggleActive(item: PriceTableItem) {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao atualizar. Tenta de novo.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === item.id ? (data.item as PriceTableItem) : it)));
      refresh();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleBulkToggle(specialty: string | null, active: boolean) {
    setBulkTogglingSpecialty(specialty ?? "");
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/items/bulk-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, active }),
      });
      if (!res.ok) {
        push("Falha ao atualizar. Tenta de novo.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.specialty === specialty ? { ...it, active } : it)));
      refresh();
    } finally {
      setBulkTogglingSpecialty(null);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/price-tables/${priceTableId}/seed`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao popular a tabela. Tenta de novo.");
        return;
      }
      push(
        data.added > 0
          ? `${data.added} tratamento${data.added === 1 ? "" : "s"} adicionado${data.added === 1 ? "" : "s"} — preencha os valores.`
          : "Nada novo pra adicionar (já estão todos cadastrados).",
        "success"
      );
      setConfirmSeedOpen(false);
      refresh();
    } finally {
      setSeeding(false);
    }
  }

  const q = search.trim().toLowerCase();
  const visibleItems = q ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.specialty ?? "").toLowerCase().includes(q)) : items;
  const groups = groupBySpecialty(visibleItems);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className={pt.toolbar}>
        <div className={styles.searchBox} style={{ maxWidth: 260 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tratamento ou especialidade…"
            className={styles.searchInput}
          />
        </div>
        <button type="button" onClick={() => setConfirmSeedOpen(true)} className={`${styles.btn} ${styles.btnGhost}`}>
          Popular com tratamentos comuns
        </button>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyState}>Nenhum tratamento cadastrado nesta tabela ainda.</div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.emptyState}>Nenhum tratamento encontrado pra &quot;{search}&quot;.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>Ativo</th>
              <th>Especialidade</th>
              <th>Tratamento</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIndex) => (
              <Fragment key={`group-${groupIndex}-${group.specialty ?? "none"}`}>
                <tr className={pt.groupRow}>
                  <td colSpan={5}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span className={pt.groupLabel}>{group.specialty || "Sem especialidade"}</span>
                      <div className={pt.groupActions}>
                        <button
                          type="button"
                          disabled={bulkTogglingSpecialty === (group.specialty ?? "")}
                          onClick={() => handleBulkToggle(group.specialty, true)}
                          className={pt.groupActionBtn}
                        >
                          Ativar todos
                        </button>
                        <button
                          type="button"
                          disabled={bulkTogglingSpecialty === (group.specialty ?? "")}
                          onClick={() => handleBulkToggle(group.specialty, false)}
                          className={pt.groupActionBtn}
                        >
                          Desativar todos
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
                {group.items.map((item) =>
                  editingId === item.id ? (
                    <tr key={item.id}>
                      <td></td>
                      <td>
                        <SpecialtyCombobox id={`edit-specialty-${item.id}`} value={editSpecialty} onChange={setEditSpecialty} options={specialtyOptions} />
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
                    <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                      <td>
                        <ToggleSwitch
                          checked={item.active}
                          disabled={togglingId === item.id}
                          onChange={() => handleToggleActive(item)}
                          label={item.active ? "Desativar tratamento" : "Ativar tratamento"}
                        />
                      </td>
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
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ paddingTop: 4, borderTop: items.length > 0 ? "1px solid var(--line-soft)" : "none" }}>
        <p className={styles.fgroupLabel} style={{ marginBottom: 10 }}>
          Adicionar tratamento
        </p>
        <form onSubmit={handleAdd} className={styles.formRow} style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className={styles.field} style={{ minWidth: 160 }}>
            <label htmlFor="newSpecialty" className={styles.label}>
              Especialidade
            </label>
            <SpecialtyCombobox id="newSpecialty" value={newSpecialty} onChange={setNewSpecialty} options={specialtyOptions} />
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
      </div>

      <ConfirmDialog
        open={confirmSeedOpen}
        title="Popular com tratamentos comuns"
        message="Adiciona especialidades e tratamentos padrão (sem valor preenchido, sem duplicar o que já existe) — não existe uma tabela pública confiável de preços reais, então você ajusta o valor e desativa o que não usa depois."
        confirmLabel="Adicionar"
        cancelLabel="Cancelar"
        loading={seeding}
        onConfirm={handleSeed}
        onCancel={() => setConfirmSeedOpen(false)}
      />

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
