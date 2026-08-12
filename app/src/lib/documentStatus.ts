/** Mesma máquina de estados do atestado e da prescrição: rascunho → aguardando_assinatura → assinado | falha. */
export type DocumentStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  rascunho: "Rascunho",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  falha: "Falha na assinatura",
};

/** Nomes de classe de `shell.module.css` (`.statusOk`/`.statusWarn`/`.statusDanger`). */
export const DOCUMENT_STATUS_CLASS: Record<DocumentStatus, string> = {
  rascunho: "statusWarn",
  aguardando_assinatura: "statusWarn",
  assinado: "statusOk",
  falha: "statusDanger",
};
