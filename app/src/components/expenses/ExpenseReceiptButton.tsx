"use client";

import { useState } from "react";
import { ReceiptPickerModal } from "@/components/expenses/ReceiptPickerModal";
import type { Expense } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/** Anexa/visualiza o comprovante de pagamento de UMA despesa já paga — abre o mesmo modal de escolher/arrastar arquivo usado na criação, upload dispara assim que o arquivo é escolhido. */
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
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handlePicked(file: File) {
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
        onClick={() => setPicking(true)}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ flexShrink: 0 }}
      >
        {uploading ? "Enviando…" : "+ Comprovante"}
      </button>
      <ReceiptPickerModal open={picking} onClose={() => setPicking(false)} onPicked={handlePicked} />
    </>
  );
}
