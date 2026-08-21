import type { PDFFont, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";
import { resolveReasonSegments } from "@/lib/documentReason";
import { formatCNPJ } from "@/lib/validation";

/** Utilitários de layout de texto compartilhados entre `certificatePdf.ts` e `prescriptionPdf.ts`. */

export interface LetterheadClinic {
  name: string;
  clinic_address?: string | null;
  cnpj?: string | null;
}

export interface LetterheadDentist {
  name: string;
  cro: string;
  croUf: string;
}

/**
 * Cabeçalho compartilhado por todo PDF gerado pelo sistema — nome da clínica
 * (já existia em todo gerador) + endereço/CNPJ quando preenchidos em
 * Configurações, opcionalmente + responsável técnico (nome/CRO) pra
 * documentos que não mostram isso em nenhum outro lugar do corpo (orçamento,
 * recibo, anamnese). Documentos que já têm um campo "Dentista responsável:"
 * no corpo (atestado, prescrição, evolução) não recebem `dentist` aqui, pra
 * não duplicar a mesma informação duas vezes na mesma página.
 * Retorna o `y` já descontado, pronto pro próximo elemento do documento.
 */
/** Mesmo PAGE_WIDTH/MARGIN usados em todo PDF gerado pelo sistema — usado só
 * como largura de referência pra quebrar linha aqui dentro, sem precisar
 * mudar a assinatura de `drawClinicLetterhead` em todos os call sites. */
const DEFAULT_LETTERHEAD_MAX_WIDTH = 595.28 - 48 * 2;

export function drawClinicLetterhead(
  page: PDFPage,
  x: number,
  y: number,
  font: PDFFont,
  clinic: LetterheadClinic,
  dentist?: LetterheadDentist | null
): number {
  page.drawText(clinic.name, { x, y, size: 10.5, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 14;

  // O campo de endereço é uma textarea em Configurações — pode vir com
  // quebras de linha de verdade. `page.drawText` não quebra "\n" sozinho (o
  // texto todo saía desenhado na mesma linha, sobrepondo o próximo elemento
  // do PDF), por isso quebra aqui manualmente: por linha digitada e, dentro
  // de cada uma, por largura, descontando `y` a cada linha renderizada.
  if (clinic.clinic_address?.trim()) {
    for (const rawLine of clinic.clinic_address.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      for (const line of wrapText(trimmed, font, 8.5, DEFAULT_LETTERHEAD_MAX_WIDTH)) {
        page.drawText(line, { x, y, size: 8.5, font, color: rgb(0.5, 0.5, 0.5) });
        y -= 11;
      }
    }
  }

  if (clinic.cnpj?.trim()) {
    page.drawText(`CNPJ ${formatCNPJ(clinic.cnpj)}`, { x, y, size: 8.5, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 11;
  }

  if (dentist?.name) {
    page.drawText(`${dentist.name} — CRO ${dentist.cro}/${dentist.croUf}`, { x, y, size: 8.5, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 11;
  }

  return y - 12;
}

export function formatDateBR(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface ReasonWord {
  text: string;
  bold: boolean;
}

/**
 * Achata os trechos resolvidos (`resolveReasonSegments`) em palavras — cada uma
 * sabe se é negrito. Quando um trecho gruda no anterior sem espaço no texto
 * original (ex.: nome seguido de vírgula, "{{paciente_nome}},"), a pontuação
 * é colada na última palavra em vez de virar uma "palavra" própria — sem isso
 * sobra um espaço indevido antes da pontuação no PDF.
 */
export function reasonToWords(reason: string, values: Record<string, string>): ReasonWord[] {
  const words: ReasonWord[] = [];
  // Rastreia se o trecho anterior terminava em espaço — decidir sozinho não
  // basta, porque um valor resolvido (CPF, data) nunca tem espaço nas próprias
  // bordas; quem sabe se havia espaço na origem é sempre o texto literal dos
  // dois lados da fronteira.
  let prevEndsWithSpace = true;

  for (const seg of resolveReasonSegments(reason, values)) {
    if (seg.text.length === 0) continue;
    const startsWithSpace = /^\s/.test(seg.text);
    const endsWithSpace = /\s$/.test(seg.text);
    const segWords = seg.text.split(/\s+/).filter(Boolean);

    if (segWords.length === 0) {
      prevEndsWithSpace = true;
      continue;
    }

    if (!prevEndsWithSpace && !startsWithSpace && words.length > 0) {
      words[words.length - 1].text += segWords.shift()!;
    }
    for (const w of segWords) {
      words.push({ text: w, bold: seg.variable });
    }
    prevEndsWithSpace = endsWithSpace;
  }
  return words;
}

/** Mesma ideia de `wrapText`, mas cada palavra pode estar numa fonte diferente (negrito para os dados variáveis). */
export function wrapReasonWords(
  words: ReasonWord[],
  regularFont: PDFFont,
  boldFont: PDFFont,
  size: number,
  maxWidth: number
): ReasonWord[][] {
  const lines: ReasonWord[][] = [];
  let current: ReasonWord[] = [];
  let currentWidth = 0;
  const spaceWidth = regularFont.widthOfTextAtSize(" ", size);
  for (const word of words) {
    const font = word.bold ? boldFont : regularFont;
    const wordWidth = font.widthOfTextAtSize(word.text, size);
    const addWidth = current.length > 0 ? spaceWidth + wordWidth : wordWidth;
    if (current.length > 0 && currentWidth + addWidth > maxWidth) {
      lines.push(current);
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth += addWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
