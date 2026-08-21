"use client";

import { useState } from "react";
import { NewPrescriptionModal } from "@/components/NewPrescriptionModal";
import type { PrescriptionTemplate } from "@/lib/database.types";

/** Botão que abre o modal de "Novo receituário" — usado na aba Receituários da ficha do paciente. */
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
  /** Abre o modal já no mount — usado pelo sheet do [+] do shell mobile v2
   * (?new=1 na URL). Default false preserva o comportamento atual. */
  autoOpen = false,
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
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);

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
