import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatBRDateTime } from "@/lib/date";

interface ConsentTermPdfData {
  clinicName: string;
  clinicLogoUrl: string | null;
  patientName: string;
  patientCpf: string | null;
  patientPhone: string | null;
  consentTermHtml: string;
  signature: {
    signerName: string;
    signerCpf: string;
    signedAtServerIso: string;
    ip: string;
    userAgent: string;
    strokeData: any;
  };
  verificationCode: string;
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return "";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
}

function maskPhone(phoneE164: string): string {
  if (!phoneE164) return "";
  const clean = phoneE164.replace(/\D/g, "");
  if (clean.length >= 12 && clean.startsWith("55")) {
    const ddd = clean.slice(2, 4);
    const last4 = clean.slice(-4);
    return `+55 (${ddd}) *****-${last4}`;
  }
  return phoneE164;
}

export async function buildConsentTermPdf(data: ConsentTermPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 48;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < 80) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  // Header
  page.drawText("TERMO DE CONSENTIMENTO E ADESÃO", { x: MARGIN, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 25;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  y -= 30;

  // Simple HTML renderer for PDF-lib
  const html = data.consentTermHtml
    .replace(/<p(.*?)>/gi, "\n\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/<ul(.*?)>/gi, "\n\n")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<li(.*?)>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<h[1-6](.*?)>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n");

  // We need to handle <b> and <strong> for bold text.
  // We'll split the text into blocks of plain text and bold text.
  
  const paragraphs = html.split("\n");
  const maxLineWidth = PAGE_WIDTH - MARGIN * 2;
  const fontSize = 10;
  const lineHeight = 14;

  for (let p of paragraphs) {
    p = p.trim();
    if (!p) {
      y -= lineHeight;
      ensureSpace(lineHeight);
      continue;
    }

    // Parse bold tags inside the paragraph
    const tokens = p.split(/(<strong>.*?<\/strong>|<b>.*?<\/b>)/gi).filter(Boolean);
    
    let currentX = MARGIN;
    
    for (const token of tokens) {
      const isBold = token.toLowerCase().startsWith("<strong") || token.toLowerCase().startsWith("<b");
      const textContent = token.replace(/<[^>]+>/g, ""); // strip tags
      const currentFont = isBold ? bold : font;
      
      const words = textContent.split(/(\s+)/); // keep spaces
      for (const word of words) {
        if (!word) continue;
        const width = currentFont.widthOfTextAtSize(word, fontSize);
        if (currentX + width > PAGE_WIDTH - MARGIN && word.trim().length > 0) {
          // Wrap to next line
          y -= lineHeight;
          currentX = MARGIN;
          ensureSpace(lineHeight);
        }
        
        // Don't draw leading spaces on a new line
        if (currentX === MARGIN && word.trim().length === 0) continue;

        page.drawText(word, { x: currentX, y, size: fontSize, font: currentFont, color: rgb(0.2, 0.2, 0.2) });
        currentX += width;
      }
    }
    y -= lineHeight;
    ensureSpace(lineHeight);
  }

  y -= 40;
  ensureSpace(200);

  // Footer / Auditoria
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 25;
  page.drawText("AUDITORIA DE ASSINATURA ELETRÔNICA", { x: MARGIN, y, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 15;
  page.drawText(`Código de verificação: ${data.verificationCode}`, { x: MARGIN, y, size: 9, font: mono, color: rgb(0.4, 0.4, 0.4) });
  y -= 20;

  function row(label: string, value: string) {
    page.drawText(label, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: MARGIN + 120, y, size: 9, font: mono, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  }

  row("Signatário", data.signature.signerName);
  row("CPF", maskCpf(data.signature.signerCpf));
  row("Canal / Autenticação", `WhatsApp ${maskPhone(data.patientPhone || "")}`);
  row("Data e Hora (BRT)", formatBRDateTime(data.signature.signedAtServerIso));
  row("IP de Conexão", data.signature.ip || "Não registrado");
  row("User-Agent", data.signature.userAgent.substring(0, 70) + (data.signature.userAgent.length > 70 ? "..." : ""));

  y -= 10;
  if (data.signature.strokeData) {
    row("Traçado Biométrico", `${data.signature.strokeData.metrics.pointsTotal} pontos, ${data.signature.strokeData.metrics.numStrokes} traço(s), duração ${data.signature.strokeData.metrics.durationTotalMs}ms`);
  }

  return await doc.save();
}
