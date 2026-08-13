"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/styles/shell.module.css";

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PatientRowActions({ clinicId, patientId }: { clinicId: string; patientId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/dashboard/pacientes/${patientId}`}
          aria-label="Editar paciente"
          title="Editar"
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ padding: 7 }}
        >
          <EditIcon />
        </Link>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="Excluir paciente"
          title="Excluir"
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ padding: 7, color: "var(--danger)" }}
        >
          <TrashIcon />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Excluir paciente"
        message="Isso remove o paciente do cadastro. Atestados já emitidos pra ele continuam guardados normalmente, só deixam de estar vinculados a um cadastro."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
