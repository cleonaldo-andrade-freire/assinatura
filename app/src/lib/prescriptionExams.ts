import type { ExamRequest, PrescriptionItem } from "@/lib/database.types";

/**
 * Regras de conteúdo e rotulagem pra receituários que passaram a aceitar
 * solicitação de exames (pedido tardio — ver `ExamRequest` em
 * `database.types.ts`). Funções puras, sem banco: usadas na validação da
 * API, no gerador de PDF, nas telas de leitura e no texto da mensagem de
 * WhatsApp, pra a decisão "isto é só exame?" ficar num lugar só.
 */

/** Um receituário precisa ter ao menos um medicamento OU um exame. */
export function hasPrescriptionContent(items: unknown[], examRequests: unknown[]): boolean {
  return items.length > 0 || examRequests.length > 0;
}

/**
 * Documento sem nenhum medicamento e com ao menos um exame — muda o título
 * do PDF, o cabeçalho das telas e o texto da mensagem de WhatsApp.
 */
export function isExamsOnly(p: { items: PrescriptionItem[]; exam_requests: ExamRequest[] }): boolean {
  return p.items.length === 0 && p.exam_requests.length > 0;
}

/** Título do documento conforme o conteúdo. */
export function prescriptionDocTitle(p: { items: PrescriptionItem[]; exam_requests: ExamRequest[] }): string {
  return isExamsOnly(p) ? "Solicitação de Exames" : "Receituário Odontológico";
}
