"use client";

import { useState } from "react";
import { NewAppointmentModal } from "@/components/NewAppointmentModal";

/** Botão/link que abre o mesmo modal de "Novo agendamento" da grade semanal —
 * mantém uma única forma de marcar consulta na agenda inteira, em vez de
 * misturar modal (duplo clique na grade) com navegação pra página cheia. */
export function NewAppointmentTrigger({
  clinicId,
  professionalName,
  date,
  time,
  className,
  children,
}: {
  clinicId: string;
  professionalName: string;
  date: string;
  time?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <NewAppointmentModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
        professionalName={professionalName}
        date={date}
        time={time}
      />
    </>
  );
}
