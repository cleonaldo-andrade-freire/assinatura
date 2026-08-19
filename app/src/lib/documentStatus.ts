/**
 * Mesma máquina de estados do atestado e da prescrição: rascunho →
 * aguardando_assinatura → assinado | falha. `pendente_assinatura` é o novo
 * estado da via não assinada digitalmente (mobile, prompt §8): o documento
 * já tem PDF gerado e pode ser impresso, mas ainda não passou por nenhum
 * provedor de assinatura — dali só sai pra `assinado` se alguém rodar o
 * fluxo de assinatura de novo sobre o mesmo registro (no desktop).
 */
export type DocumentStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha" | "pendente_assinatura";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  rascunho: "Rascunho",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado digitalmente",
  falha: "Falha na assinatura",
  pendente_assinatura: "Aguardando assinatura física",
};

/** Nomes de classe de `shell.module.css` (`.statusOk`/`.statusWarn`/`.statusDanger`). */
export const DOCUMENT_STATUS_CLASS: Record<DocumentStatus, string> = {
  rascunho: "statusWarn",
  aguardando_assinatura: "statusWarn",
  assinado: "statusOk",
  falha: "statusDanger",
  pendente_assinatura: "statusWarn",
};
