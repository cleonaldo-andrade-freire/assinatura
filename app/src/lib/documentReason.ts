export const CERTIFICATE_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{{paciente_nome}}", label: "Nome do paciente" },
  { token: "{{paciente_cpf}}", label: "CPF" },
  { token: "{{data_emissao}}", label: "Data de emissão" },
  { token: "{{data_atendimento}}", label: "Data de atendimento" },
  { token: "{{data_inicio}}", label: "Data de início" },
  { token: "{{dias_afastamento}}", label: "Dias de afastamento" },
];

export const PRESCRIPTION_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{{paciente_nome}}", label: "Nome do paciente" },
  { token: "{{paciente_cpf}}", label: "CPF" },
  { token: "{{data_emissao}}", label: "Data de emissão" },
];

export interface ReasonSegment {
  text: string;
  /** true quando o texto veio de um placeholder resolvido — é o que entra em negrito. */
  variable: boolean;
}

const TOKEN_PATTERN = /(\{\{[a-zA-Z_]+\}\})/g;

/**
 * Divide um texto (do atestado ou da prescrição) em trechos literais e trechos
 * resolvidos a partir de placeholders (`{{paciente_nome}}` etc.) — os
 * resolvidos vêm marcados como `variable: true`, pra quem for desenhar/exibir
 * o texto saber quais entram em negrito. `values` mapeia o nome do token (sem
 * chaves) pro valor já formatado; um token sem entrada no mapa fica como texto
 * literal (não quebra) — assim o mesmo resolvedor serve pro atestado (5
 * placeholders) e pra prescrição (3 placeholders) sem precisar saber qual é
 * qual. Usado no PDF (`certificatePdf.ts`/`prescriptionPdf.ts`), na prévia do
 * formulário e na tela de detalhe.
 */
export function resolveReasonSegments(reason: string, values: Record<string, string>): ReasonSegment[] {
  return reason
    .split(TOKEN_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = /^\{\{([a-zA-Z_]+)\}\}$/.exec(part);
      const key = match?.[1];
      return key !== undefined && key in values
        ? { text: values[key], variable: true }
        : { text: part, variable: false };
    });
}
