"use client";

import { useState } from "react";
import { NewBudgetModal } from "@/components/budgets/NewBudgetModal";

export function NewBudgetTrigger({
  clinicId,
  patientId,
  patientName,
  defaultResponsibleName,
  className,
  children,
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  defaultResponsibleName: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <NewBudgetModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
        patientId={patientId}
        patientName={patientName}
        defaultResponsibleName={defaultResponsibleName}
      />
    </>
  );
}
