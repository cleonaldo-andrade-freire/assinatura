"use client";

import { useState } from "react";
import { NewPrescriptionModal } from "@/components/NewPrescriptionModal";
import type { PrescriptionTemplate } from "@/lib/database.types";

/** Botão que abre o modal de "Nova prescrição" — usado na aba Prescrições da ficha do paciente. */
export function NewPrescriptionTrigger({
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
  templates: PrescriptionTemplate[];
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
      <NewPrescriptionModal
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
