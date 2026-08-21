import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { drawClinicLetterhead, formatDateBR, type LetterheadDentist } from "@/lib/pdfTextLayout";
import { formatBRPhoneLocal, formatCPF } from "@/lib/validation";

interface AnamnesisPdfData {
  clinicName: string;
  clinicLogoUrl: string | null;
  clinicAddress?: string | null;
  cnpj?: string | null;
  dentist?: LetterheadDentist | null;
  patient: {
    name: string;
    cpf: string | null;
    phone: string | null;
    birthDate: string | null;
    rg: string | null;
    occupation: string | null;
    address: string | null;
  };
  answers: { question: string; answer: string }[];
  signature: {
    signerName: string;
    signerCpf: string;
    signedAt: string;
    ip: string;
    userAgent: string;
    dataUrl: string; // The base64 signature image
  };
}

export async function buildAnamnesisSignedPdf(data: AnamnesisPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 48;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < 100) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  // Header
  page.drawText("FICHA DE ANAMNESE", { x: MARGIN, y, size: 16, font: bold });
  page.drawText(`Data: ${formatDateBR(new Date().toISOString())}`, { 
    x: PAGE_WIDTH - MARGIN - 100, 
    y, 
    size: 10, 
    font 
  });
  
  y -= 20;
  y = drawClinicLetterhead(
    page,
    MARGIN,
    y,
    font,
    { name: data.clinicName, clinic_address: data.clinicAddress, cnpj: data.cnpj },
    data.dentist
  );
  y -= 12;

  // Seção 1
  page.drawText("01. IDENTIFICAÇÃO DO PACIENTE", { x: MARGIN, y, size: 12, font: bold });
  y -= 5;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  y -= 20;

  function drawField(label: string, value: string, x: number, currentY: number) {
    page.drawText(label, { x, y: currentY, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value || "-", { x, y: currentY - 14, size: 11, font });
  }

  drawField("NOME COMPLETO", data.patient.name, MARGIN, y);
  y -= 40;

  drawField("CPF", data.patient.cpf ? formatCPF(data.patient.cpf) : "-", MARGIN, y);
  drawField("DATA DE NASCIMENTO", data.patient.birthDate ? formatDateBR(data.patient.birthDate) : "-", MARGIN + 250, y);
  y -= 40;

  drawField("RG", data.patient.rg || "-", MARGIN, y);
  drawField("CELULAR", data.patient.phone ? formatBRPhoneLocal(data.patient.phone) : "-", MARGIN + 250, y);
  y -= 40;

  drawField("OCUPAÇÃO/PROFISSÃO", data.patient.occupation || "-", MARGIN, y);
  y -= 40;

  drawField("ENDEREÇO RESIDENCIAL", data.patient.address || "-", MARGIN, y);
  y -= 50;

  // Seção 2
  ensureSpace(100);
  page.drawText("02. QUESTIONÁRIO DE SAÚDE", { x: MARGIN, y, size: 12, font: bold });
  y -= 5;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  y -= 25;

  for (const qa of data.answers) {
    ensureSpace(40);
    page.drawText(qa.question.toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    const answerLines = qa.answer.split('\n');
    y -= 14;
    for (const line of answerLines) {
      ensureSpace(16);
      page.drawText(line, { x: MARGIN, y, size: 10, font });
      y -= 16;
    }
    y -= 10;
  }

  // Assinatura
  ensureSpace(200);
  y -= 20;
  page.drawText("Assinatura do Paciente", { x: MARGIN, y, size: 12, font: bold });
  y -= 15;
  page.drawText("Ao assinar abaixo, você confirma que todas as informações fornecidas são verdadeiras e que", { x: MARGIN, y, size: 10, font });
  y -= 15;
  page.drawText("concorda com o Termo de Consentimento apresentado.", { x: MARGIN, y, size: 10, font });
  y -= 30;

  // Desenhar assinatura a partir do dataUrl
  if (data.signature.dataUrl.startsWith("data:image/png;base64,")) {
    const base64Data = data.signature.dataUrl.replace("data:image/png;base64,", "");
    try {
      const imgBuffer = Buffer.from(base64Data, "base64");
      const pngImage = await doc.embedPng(imgBuffer);
      const imgDims = pngImage.scale(0.5);
      page.drawImage(pngImage, {
        x: MARGIN,
        y: y - 80,
        width: 300,
        height: 100,
      });
    } catch(e) {
      console.error("Falha ao embutir imagem de assinatura", e);
    }
  }

  y -= 100;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 300, y },
    thickness: 1,
    color: rgb(0, 0, 0)
  });
  y -= 15;
  page.drawText(data.signature.signerName, { x: MARGIN, y, size: 10, font: bold });
  y -= 15;
  page.drawText(`Documento assinado eletronicamente (Assinatura Eletrônica Avançada — Lei nº 14.063/2020). IP: ${data.signature.ip}`, { x: MARGIN, y, size: 8, font: italic });
  y -= 12;
  page.drawText(`Data/Hora: ${formatDateBR(data.signature.signedAt)}`, { x: MARGIN, y, size: 8, font: italic });

  // Assinatura do Cirurgião-Dentista: PDF próprio, separado deste — ver
  // lib/anamnesisDentistPdf.ts / lib/anamnesisDentistSignature.ts.

  // === TRILHA DE AUDITORIA ===
  page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - 60;
  
  page.drawText("TRILHA DE AUDITORIA DA ASSINATURA", { x: MARGIN, y, size: 14, font: bold });
  y -= 25;
  page.drawText("Evidência jurídica da assinatura eletrônica (Lei 14.063/2020) — guardada integralmente pelo sistema.", { x: MARGIN, y, size: 9, font: italic, color: rgb(0.3, 0.3, 0.3) });
  y -= 30;
  
  const drawAuditField = (label: string, value: string, currentY: number) => {
    page.drawText(label, { x: MARGIN, y: currentY, size: 9, font: bold });
    page.drawText(value, { x: MARGIN + 150, y: currentY, size: 9, font });
  };

  drawAuditField("Assinado por (Paciente):", `${data.signature.signerName} (CPF: ${formatCPF(data.signature.signerCpf)})`, y);
  y -= 20;
  drawAuditField("Data/hora (servidor):", formatDateBR(data.signature.signedAt), y);
  y -= 20;
  drawAuditField("Endereço IP:", data.signature.ip, y);
  y -= 20;
  drawAuditField("Dispositivo/navegador:", data.signature.userAgent.substring(0, 80), y);
  if (data.signature.userAgent.length > 80) {
    y -= 12;
    page.drawText(data.signature.userAgent.substring(80, 160), { x: MARGIN + 150, y, size: 9, font });
  }
  y -= 30;

  return await doc.save();
}
