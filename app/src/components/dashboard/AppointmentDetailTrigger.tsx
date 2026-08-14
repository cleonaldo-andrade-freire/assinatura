"use client";

import { useState } from "react";
import { AppointmentDetailModal } from "@/components/dashboard/AppointmentDetailModal";

/** "Ver detalhes" fora da agenda (ex.: aba Agendamentos da ficha do paciente) — abre o mesmo detalhe em modal client-fetched, ver AppointmentDetailModal. */
export function AppointmentDetailTrigger({ clinicId, appointmentId }: { clinicId: string; appointmentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: "inherit", padding: 0, textDecoration: "underline" }}
      >
        Ver detalhes
      </button>
      <AppointmentDetailModal open={open} onClose={() => setOpen(false)} clinicId={clinicId} appointmentId={appointmentId} />
    </>
  );
}
