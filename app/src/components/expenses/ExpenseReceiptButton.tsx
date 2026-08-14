"use client";

import { useRef, useState } from "react";
import type { Expense } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/** Anexa/visualiza o comprovante de pagamento de UMA despesa já paga. Upload dispara direto na seleção do arquivo — sem modal, pra ficar rápido de usar numa linha de lista. */
export function ExpenseReceiptButton({
  clinicId,
  expense,
  onUploaded,
  onError,
}: {
  clinicId: string;
  expense: Expense;
  onUploaded: (expense: Expense) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const res = await fetch(`/api/clinics/${clinicId}/expenses/${expense.id}/receipt`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(data?.message || "Falha ao anexar comprovante.");
        return;
      }
      onUploaded(data.expense as Expense);
    } finally {
      setUploading(false);
    }
  }

  if (expense.receipt_storage_key) {
    return (
      <a
        href={`/api/clinics/${clinicId}/expenses/${expense.id}/receipt`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ flexShrink: 0 }}
      >
        Ver comprovante
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ flexShrink: 0 }}
      >
        {uploading ? "Enviando…" : "+ Comprovante"}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={handleFile} style={{ display: "none" }} />
    </>
  );
}
