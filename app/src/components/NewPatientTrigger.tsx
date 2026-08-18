"use client";

import { useState } from "react";
import { NewPatientModal } from "@/components/NewPatientModal";

export function NewPatientTrigger({
  clinicId,
  className,
  children,
}: {
  clinicId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
