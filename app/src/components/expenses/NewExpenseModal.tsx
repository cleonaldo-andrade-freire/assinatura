"use client";

import { useState } from "react";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import shellStyles from "@/styles/shell.module.css";

/** Botão "+ Nova despesa" do cabeçalho — abre o mesmo ExpenseFormModal usado pra editar, sem despesa pré-carregada. */
export function NewExpenseModal({ clinicId, categoryOptions }: { clinicId: string; categoryOptions: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={`${shellStyles.btn} ${shellStyles.btnPrimary}`} onClick={() => setOpen(true)}>
        + Nova despesa
      </button>
      <ExpenseFormModal clinicId={clinicId} categoryOptions={categoryOptions} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
