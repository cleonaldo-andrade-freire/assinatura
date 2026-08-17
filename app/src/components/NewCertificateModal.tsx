"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { NewCertificateForm } from "@/components/NewCertificateForm";
import type { Certificate, CertificateTemplate } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import shellStyles from "@/styles/shell.module.css";

/** Diálogo de "Novo atestado" — usado pelo botão da aba Atestados na ficha do
 * paciente, com o paciente já pré-preenchido (mesmo padrão do NewAppointmentModal). */
export function NewCertificateModal({
  open,
  onClose,
  clinicId,
  templates,
  dentistConfigured,
  patientId,
  patientName,
  patientCpf,
  patientPhone,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  templates: CertificateTemplate[];
  dentistConfigured: boolean;
  patientId?: string | null;
  patientName?: string;
  patientCpf?: string | null;
  patientPhone?: string | null;
  onCreated?: (certificate: Certificate) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>Novo atestado</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {!dentistConfigured ? (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: 14 }}>
              Antes de emitir o primeiro atestado, cadastre o nome e o CRO do dentista responsável em Configurações.
            </p>
            <Link href="/dashboard/configuracoes" className={`${shellStyles.btn} ${shellStyles.btnPrimary}`} onClick={onClose}>
              Ir para Configurações
            </Link>
          </div>
        ) : (
          <NewCertificateForm
            bare
            clinicId={clinicId}
            templates={templates}
            initialPatientId={patientId}
            initialPatientName={patientName}
            initialPatientCpf={patientCpf}
            initialPatientPhone={patientPhone}
            onSuccess={(certificate) => {
              onClose();
              onCreated?.(certificate);
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
