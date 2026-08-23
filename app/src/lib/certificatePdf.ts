import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { drawClinicLetterhead, formatDateBR, reasonToWords, wrapReasonWords, wrapText, type LetterheadClinic } from "@/lib/pdfTextLayout";
import { drawValidationFooter } from "@/lib/pdfValidationFooter";
import { drawUnsignedSignatureBox } from "@/lib/pdfUnsignedNotice";
import type { Certificate } from "@/lib/database.types";

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
 * Monta o PDF do atestado do zero, no servidor (não no client como a
 * anamnese em `AssinaturaClient.tsx`, porque aqui quem "assina" é o
 * dentista/sistema, não o paciente no navegador). Retorna os bytes **sem**
 * assinatura — o carimbo de assinatura (mock ou, no futuro, real) entra
 * depois, via `SignatureProvider.sign()`.
 */
export async function buildCertificatePdf(
  certificate: Certificate,
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

  page.drawText("Atestado Odontológico", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  y = drawClinicLetterhead(page, MARGIN, y, font, clinicInfo);

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  field("Paciente:", certificate.patient_name);
  if (certificate.patient_cpf) field("CPF:", certificate.patient_cpf);
  field(
    "Dentista responsável:",
    `${certificate.dentist_name} — CRO ${certificate.dentist_cro}/${certificate.dentist_cro_uf}`
  );
  field("Data de emissão:", formatDateBR(certificate.created_at));
  field("Início do afastamento:", formatDateBR(certificate.starts_on));
  field("Dias de afastamento:", String(certificate.rest_days));


  ensureSpace(20);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.86, 0.86, 0.86),
  });
  y -= 24;

  // Dados vindos de placeholders (nome, CPF, datas, dias) saem em negrito — o
  // atestado deixa claro pra quem lê o que é texto fixo do modelo e o que foi
  // preenchido pra este paciente específico.
  const reasonValues: Record<string, string> = {
    paciente_nome: certificate.patient_name,
    paciente_cpf: certificate.patient_cpf ?? "",
    data_emissao: formatDateBR(certificate.created_at),
    data_inicio: formatDateBR(certificate.starts_on),
    dias_afastamento: String(certificate.rest_days),
  };
  const reasonWords = reasonToWords(certificate.reason, reasonValues);
  const reasonSpaceWidth = font.widthOfTextAtSize(" ", 11);
  for (const line of wrapReasonWords(reasonWords, font, bold, 11, contentWidth)) {
    ensureSpace(15);
    let x = MARGIN;
    for (const word of line) {
      const wordFont = word.bold ? bold : font;
      page.drawText(word.text, { x, y, size: 11, font: wordFont, color: rgb(0.08, 0.08, 0.08) });
      x += wordFont.widthOfTextAtSize(word.text, 11) + reasonSpaceWidth;
    }
    y -= 15;
  }

  y -= 10;
  const declText = options?.unsigned
    ? "Este documento não possui assinatura digital ICP-Brasil. Para ter validade, precisa da assinatura e do " +
      "carimbo manuais do(a) profissional responsável, como qualquer atestado em papel. Uma versão assinada " +
      "digitalmente pode ser gerada depois, pelo computador, sobre este mesmo registro."
    : "Documento emitido eletronicamente pelo sistema da clínica. A área reservada abaixo é preenchida " +
      "pelo provedor de assinatura digital do dentista responsável.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    ensureSpace(12);
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  if (certificate.validation_code) {
    await drawValidationFooter(doc, page, font, bold, MARGIN, validationUrl, certificate.validation_code);
  }

  if (options?.unsigned) {
    const lastPage = doc.getPages().at(-1)!;
    drawUnsignedSignatureBox(lastPage, font, bold, MARGIN, certificate.dentist_name, `CRO ${certificate.dentist_cro}/${certificate.dentist_cro_uf}`);
  }

  return doc.save({ useObjectStreams: false });
}
