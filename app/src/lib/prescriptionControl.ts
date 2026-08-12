import type { PrescriptionControlType } from "@/lib/database.types";

export const PRESCRIPTION_CONTROL_LABEL: Record<PrescriptionControlType, string> = {
  comum: "Comum",
  antimicrobiano_retencao: "Antimicrobiano (com retenção de receita)",
  controlado_especial: "Controlado especial",
};

export const PRESCRIPTION_CONTROL_OPTIONS: { value: PrescriptionControlType; label: string }[] = [
  { value: "comum", label: PRESCRIPTION_CONTROL_LABEL.comum },
  { value: "antimicrobiano_retencao", label: PRESCRIPTION_CONTROL_LABEL.antimicrobiano_retencao },
  { value: "controlado_especial", label: PRESCRIPTION_CONTROL_LABEL.controlado_especial },
];
