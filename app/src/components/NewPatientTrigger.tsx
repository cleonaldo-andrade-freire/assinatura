"use client";

import { useState } from "react";
import { NewPatientModal } from "@/components/NewPatientModal";

export function NewPatientTrigger({
  clinicId,
  className,
  children,
  /** Abre o modal já no mount — usado pelo sheet do [+] do shell mobile v2
   * (?new=1 na URL). Default false preserva o comportamento atual. */
  autoOpen = false,
}: {
  clinicId: string;
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
      <NewPatientModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
      />
    </>
  );
}
