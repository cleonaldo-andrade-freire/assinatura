"use client";

import { useState } from "react";
import { NewAnamnesisModal } from "@/components/NewAnamnesisModal";
import type { QuestionTemplate } from "@/lib/database.types";

/** Botão que abre o modal de "Nova anamnese" — usado na aba Anamneses da ficha do paciente. */
export function NewAnamnesisTrigger({
  clinicId,
  templates,
  patientName,
  patientPhone,
  className,
  children,
  /** Abre o modal já no mount — usado pelo sheet do [+] do shell mobile v2
   * (?new=1 na URL). Default false preserva o comportamento atual. */
  autoOpen = false,
}: {
  clinicId: string;
  templates: QuestionTemplate[];
  patientName?: string;
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
      <NewAnamnesisModal open={open} onClose={() => setOpen(false)} clinicId={clinicId} templates={templates} patientName={patientName} patientPhone={patientPhone} />
    </>
  );
}
