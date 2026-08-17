"use client";

import { useState } from "react";
import { NewCertificateModal } from "@/components/NewCertificateModal";
import type { CertificateTemplate } from "@/lib/database.types";

/** Botão que abre o modal de "Novo atestado" — usado na aba Atestados da ficha do paciente. */
export function NewCertificateTrigger({
  clinicId,
  templates,
  dentistConfigured,
  patientId,
  patientName,
  patientCpf,
  patientPhone,
  className,
  children,
}: {
  clinicId: string;
  templates: CertificateTemplate[];
  dentistConfigured: boolean;
  patientId?: string | null;
  patientName?: string;
  patientCpf?: string | null;
  patientPhone?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <NewCertificateModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
        templates={templates}
        dentistConfigured={dentistConfigured}
        patientId={patientId}
        patientName={patientName}
        patientCpf={patientCpf}
        patientPhone={patientPhone}
      />
    </>
  );
}
