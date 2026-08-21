import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { drawClinicLetterhead, formatDateBR, reasonToWords, wrapReasonWords, wrapText, type LetterheadClinic } from "@/lib/pdfTextLayout";
import { drawValidationFooter } from "@/lib/pdfValidationFooter";
import { drawUnsignedSignatureBox } from "@/lib/pdfUnsignedNotice";
import type { Prescription } from "@/lib/database.types";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;
// Reserva espaço pro QR/código de validação (ver `pdfValidationFooter.ts`) e,
// abaixo dele, pro carimbo de assinatura (ver mockProvider.ts).
const BOTTOM_LIMIT = 175;

interface LogoImage {
  bytes: Uint8Array;
  format: "png" | "jpg";
}

/**
 * Monta o PDF da prescrição do zero, no servidor — mesmo desenho de
 * `certificatePdf.ts` (quem assina é o dentista/sistema, não o paciente).
 * Retorna os bytes **sem** assinatura — o carimbo entra depois, via
 * `SignatureProvider.sign()`.
 */
export async function buildPrescriptionPdf(
  prescription: Prescription,
  clinicInfo: LetterheadClinic,
  logo: LogoImage | null,
  validationUrl: string,
  options?: { unsigned?: boolean }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < BOTTOM_LIMIT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  if (logo) {
    try {
      const image = logo.format === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const dim = image.scale(38 / image.height);
      page.drawImage(image, {
        x: PAGE_WIDTH - MARGIN - dim.width,
        y: PAGE_HEIGHT - 64,
        width: dim.width,
        height: dim.height,
      });
    } catch {
      // Sem logo no PDF nesse caso — mesma tolerância de AssinaturaClient.tsx.
    }
  }

  page.drawText("Receituário Odontológico", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  y = drawClinicLetterhead(page, MARGIN, y, font, clinicInfo);

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  field("Paciente:", prescription.patient_name);
  if (prescription.patient_cpf) field("CPF:", prescription.patient_cpf);
  field(
    "Dentista responsável:",
    `${prescription.dentist_name} — CRO ${prescription.dentist_cro}/${prescription.dentist_cro_uf}`
  );
  field("Data de emissão:", formatDateBR(prescription.created_at));

  ensureSpace(20);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.86, 0.86, 0.86),
  });
  y -= 24;

  function drawWrapped(lines: string[], font: PDFFont, size: number, lineHeight: number, color = rgb(0.08, 0.08, 0.08)) {
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= lineHeight;
    }
  }

  prescription.items.forEach((item, i) => {
    ensureSpace(15);
    const heading = `${i + 1}. ${item.drug_name}`;
    drawWrapped(wrapText(heading, bold, 11.5, contentWidth), bold, 11.5, 15);

    const detail = [item.dosage, item.instructions].filter(Boolean).join(" — ");
    if (detail) drawWrapped(wrapText(detail, font, 10.5, contentWidth - 14), font, 10.5, 14);

    if (item.generic_allowed) {
      drawWrapped(["Aceita substituição por medicamento genérico."], italic, 9.5, 13, rgb(0.4, 0.4, 0.4));
    }
    if (item.control_type === "antimicrobiano_retencao") {
      drawWrapped(["Sujeito a retenção de receita."], italic, 9.5, 13, rgb(0.4, 0.4, 0.4));
    }
    y -= 8;
  });

  if (prescription.notes) {
    ensureSpace(20);
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: rgb(0.86, 0.86, 0.86),
    });
    y -= 22;

    // Dados vindos de placeholders (nome, CPF, data) saem em negrito, mesmo
    // mecanismo do atestado — ver `lib/documentReason.ts`.
    const notesValues: Record<string, string> = {
      paciente_nome: prescription.patient_name,
      paciente_cpf: prescription.patient_cpf ?? "",
      data_emissao: formatDateBR(prescription.created_at),
    };
    const notesWords = reasonToWords(prescription.notes, notesValues);
    const spaceWidth = font.widthOfTextAtSize(" ", 11);
    for (const line of wrapReasonWords(notesWords, font, bold, 11, contentWidth)) {
      ensureSpace(15);
      let x = MARGIN;
      for (const word of line) {
        const wordFont = word.bold ? bold : font;
        page.drawText(word.text, { x, y, size: 11, font: wordFont, color: rgb(0.08, 0.08, 0.08) });
        x += wordFont.widthOfTextAtSize(word.text, 11) + spaceWidth;
      }
      y -= 15;
    }
  }

  y -= 10;
  const declText = options?.unsigned
    ? "Este documento não possui assinatura digital ICP-Brasil. Para ter validade, precisa da assinatura e do " +
      "carimbo manuais do(a) profissional responsável, como qualquer receituário em papel. Uma versão assinada " +
      "digitalmente pode ser gerada depois, pelo computador, sobre este mesmo registro."
    : "Documento emitido eletronicamente pelo sistema da clínica. A área reservada abaixo é preenchida " +
      "pelo provedor de assinatura digital do dentista responsável.";
  drawWrapped(wrapText(declText, italic, 9, contentWidth), italic, 9, 12, rgb(0.4, 0.4, 0.4));

  if (prescription.validation_code) {
    await drawValidationFooter(doc, page, font, bold, MARGIN, validationUrl, prescription.validation_code);
  }

  if (options?.unsigned) {
    const lastPage = doc.getPages().at(-1)!;
    drawUnsignedSignatureBox(lastPage, font, bold, MARGIN, prescription.dentist_name, `CRO ${prescription.dentist_cro}/${prescription.dentist_cro_uf}`);
  }

  return doc.save();
}
