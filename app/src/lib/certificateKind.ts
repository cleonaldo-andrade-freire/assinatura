import type { Certificate, CertificateKind, CertificateShift } from "@/lib/database.types";
import { formatDateOnlyBR, formatTimestampBR } from "@/lib/date";

/**
 * Dois tipos de documento na mesma tabela `certificates` (migration 074):
 * o atestado de afastamento (dias de repouso) e a declaração de comparecimento
 * (só a data e o turno em que o paciente esteve na clínica). Rótulos e textos
 * que mudam conforme o tipo ficam aqui, pra PDF, telas e WhatsApp não
 * divergirem.
 */
export const CERTIFICATE_SHIFTS: { value: CertificateShift; label: string }[] = [
  { value: "manha", label: "Manhã" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
];

export function shiftLabel(shift: CertificateShift | null | undefined): string {
  return CERTIFICATE_SHIFTS.find((s) => s.value === shift)?.label ?? "";
}

/** Título do documento — vai no PDF e no topo das páginas públicas. */
export function certificateTitle(kind: CertificateKind): string {
  return kind === "comparecimento" ? "Declaração de Comparecimento" : "Atestado Odontológico";
}

/** Mensagem de WhatsApp com o link do documento pronto (emissão e reenvio). */
export function certificateReadyMessage(kind: CertificateKind, link: string): string {
  return kind === "comparecimento"
    ? `📄 Sua declaração de comparecimento já está disponível: ${link}`
    : `📄 Seu atestado odontológico já está disponível: ${link}`;
}

/** Texto padrão da declaração — editável no formulário, com placeholders resolvidos só no PDF/prévia. */
export const ATTENDANCE_DEFAULT_REASON =
  "Declaro, para os devidos fins, que {{paciente_nome}} compareceu a esta clínica " +
  "para atendimento odontológico no dia {{data_atendimento}}, no turno da {{turno}}.";

/** Resumo de uma linha pra coluna das listas: "3 dias de afastamento" / "Comparecimento — Tarde". */
export function certificateSummary(c: Pick<Certificate, "kind" | "shift" | "rest_days">): string {
  if (c.kind === "comparecimento") return `Comparecimento — ${shiftLabel(c.shift)}`;
  return `${c.rest_days} ${c.rest_days === 1 ? "dia" : "dias"} de afastamento`;
}

/**
 * Valores dos placeholders do texto (`{{paciente_nome}}` etc.) — mesmo mapa no
 * PDF e na tela de detalhe. O turno vai em minúsculas porque entra no meio da
 * frase ("no turno da tarde").
 */
export function certificateReasonValues(c: Certificate): Record<string, string> {
  return {
    paciente_nome: c.patient_name,
    paciente_cpf: c.patient_cpf ?? "",
    data_emissao: formatTimestampBR(c.created_at),
    data_atendimento: formatDateOnlyBR(c.care_date),
    data_inicio: formatDateOnlyBR(c.starts_on),
    dias_afastamento: String(c.rest_days),
    turno: shiftLabel(c.shift).toLowerCase(),
  };
}
