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
}: {
  clinicId: string;
  templates: QuestionTemplate[];
  patientName?: string;
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
      <NewAnamnesisModal open={open} onClose={() => setOpen(false)} clinicId={clinicId} templates={templates} patientName={patientName} patientPhone={patientPhone} />
    </>
  );
}
