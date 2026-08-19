"use client";

import { useState } from "react";
import { ReceiptPickerModal } from "@/components/expenses/ReceiptPickerModal";
import type { Expense } from "@/lib/database.types";
import ex from "./expenses.module.css";

function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

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
        className={`${ex.iconBtn} ${ex.iconBtnActive}`}
        title="Ver comprovante"
        aria-label="Ver comprovante"
      >
        <ReceiptIcon />
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => setPicking(true)}
        className={ex.iconBtn}
        title={uploading ? "Enviando…" : "Anexar comprovante"}
        aria-label={uploading ? "Enviando comprovante" : "Anexar comprovante"}
      >
        <ReceiptIcon />
      </button>
      <ReceiptPickerModal open={picking} onClose={() => setPicking(false)} onPicked={handlePicked} />
    </>
  );
}
