import crypto from "crypto";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDateBR, wrapText } from "@/lib/pdfTextLayout";
import { drawValidationFooter } from "@/lib/pdfValidationFooter";
import { formatBRPhoneLocal } from "@/lib/validation";
import { formatTreatmentsLines } from "@/lib/treatments";
import type { SignatureStrokeData } from "@/components/SignatureCanvas";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4, em pt
const PAGE_HEIGHT = 841.89;
const BOTTOM_LIMIT = 100;

interface EvolutionSnapshot {
  schema: "evolucao/v1";
  clinic: { name: string; logoUrl: string | null };
  dentist: { name: string; cro: string; croUf: string };
  patient: { name: string; cpf: string | null };
  treatments: { name: string; toothRegion: string | null }[];
  evolutionDate: string;
  text: string;
}

interface ManifestData {
  verificationCode: string;
  signerName: string;
  signerCpf: string | null;
  phoneE164: string;
  consentTermVersion: string;
  consentAcceptedAt: string;
  signedAtServerIso: string;
  strokeData: SignatureStrokeData | null;
  userAgent: string | null;
  ip: string | null;
  contentHash: string;
  auditEventCount: number;
  auditChainIntact: boolean;
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return "não informado";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function maskPhone(phoneE164: string): string {
  const local = formatBRPhoneLocal(phoneE164);
  return local.replace(/(\(\d{2}\) \d)\d{4}(-\d{4})/, "$1****$2");
}

/**
 * Monta o PDF da evolução assinada + manifesto de assinatura (última
 * página) — mesmo desenho de certificatePdf.ts/prescriptionPdf.ts, mas
 * esta função já recebe tudo pronto (snapshot congelado + dados da
 * assinatura) porque quem monta o conteúdo achatado é `content_snapshot`,
 * não uma consulta ao banco no momento da geração — é isso que garante que
 * o PDF reflete exatamente o que a pessoa leu e assinou, mesmo que a
 * evolução seja editada depois (o que gera uma v2 nova, nunca sobrescreve).
 */
export async function buildEvolutionSignedPdf(
  snapshot: EvolutionSnapshot,
  manifest: ManifestData,
  auditTrailJson: string,
  validationUrl: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;

  function ensureSpace(needed: number) {
    if (y - needed < BOTTOM_LIMIT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }
  }

  page.drawText("Evolução Clínica", { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  page.drawText(snapshot.clinic.name, { x: MARGIN, y, size: 10.5, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 28;

  function field(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  }

  function fieldLines(label: string, lines: string[]) {
    ensureSpace(16);
    page.drawText(label, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
    const labelWidth = bold.widthOfTextAtSize(`${label} `, 11);
    for (const line of lines) {
      ensureSpace(16);
      page.drawText(line, { x: MARGIN + labelWidth, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
      y -= 16;
    }
  }

  field("Paciente:", snapshot.patient.name);
  if (snapshot.patient.cpf) field("CPF:", snapshot.patient.cpf);
  field("Dentista responsável:", `${snapshot.dentist.name} — CRO ${snapshot.dentist.cro}/${snapshot.dentist.croUf}`);
  field("Data do atendimento:", formatDateBR(snapshot.evolutionDate));
  fieldLines(snapshot.treatments.length > 1 ? "Tratamentos:" : "Tratamento:", formatTreatmentsLines(snapshot.treatments));

  ensureSpace(20);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.86, 0.86, 0.86) });
  y -= 24;

  for (const line of wrapText(snapshot.text, font, 11, contentWidth)) {
    ensureSpace(15);
    page.drawText(line, { x: MARGIN, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 15;
  }

  y -= 10;
  const declText =
    "Registro de evolução clínica com ciência e concordância do paciente, coletada eletronicamente. " +
    "A trilha de auditoria completa está anexada a este arquivo.";
  for (const line of wrapText(declText, italic, 9, contentWidth)) {
    ensureSpace(12);
    page.drawText(line, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  await drawValidationFooter(doc, page, font, bold, MARGIN, validationUrl, manifest.verificationCode);

  // Hash das páginas de CONTEÚDO, calculado antes de acrescentar o
  // manifesto — o hash do arquivo final (com manifesto + anexo) não pode
  // aparecer dentro dele mesmo (seria circular: o valor mudaria assim que
  // fosse escrito). O que o manifesto mostra é o hash da parte que o
  // paciente efetivamente leu antes de assinar; o hash do arquivo
  // completo fica só no banco (`treatment_evolution_signatures.sha256`),
  // pra conferência externa de quem baixar o PDF depois.
  const contentOnlyBytes = await doc.save({ useObjectStreams: false });
  const documentHash = crypto.createHash("sha256").update(Buffer.from(contentOnlyBytes)).digest("hex");

  // ---- Página do manifesto de assinatura (§11 do prompt original) ----
  page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - 60;

  page.drawText("MANIFESTO DE ASSINATURA ELETRÔNICA", { x: MARGIN, y, size: 14, font: bold, color: rgb(0.08, 0.08, 0.08) });
  y -= 18;
  page.drawText(`Código de verificação: ${manifest.verificationCode}`, { x: MARGIN, y, size: 10, font: mono, color: rgb(0.35, 0.35, 0.35) });
  y -= 30;

  function section(title: string) {
    ensureSpace(24);
    page.drawText(title, { x: MARGIN, y, size: 10.5, font: bold, color: rgb(0.16, 0.22, 0.19) });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: rgb(0.86, 0.86, 0.86) });
    y -= 16;
  }

  function row(label: string, value: string) {
    ensureSpace(15);
    page.drawText(label, { x: MARGIN, y, size: 9.5, font, color: rgb(0.4, 0.4, 0.4) });
    const lines = wrapText(value, mono, 9.5, contentWidth - 190);
    page.drawText(lines[0] ?? "", { x: MARGIN + 180, y, size: 9.5, font: mono, color: rgb(0.1, 0.1, 0.1) });
    y -= 15;
    for (const extra of lines.slice(1)) {
      ensureSpace(13);
      page.drawText(extra, { x: MARGIN + 180, y, size: 9.5, font: mono, color: rgb(0.1, 0.1, 0.1) });
      y -= 13;
    }
  }

  section("SIGNATÁRIO");
  row("Nome", manifest.signerName);
  row("CPF", maskCpf(manifest.signerCpf));
  row("Qualidade", "Paciente");
  row("Canal", `WhatsApp ${maskPhone(manifest.phoneE164)}`);
  y -= 8;

  section("AUTENTICAÇÃO");
  row("Fator 1 (posse)", "Número de WhatsApp confirmado no cadastro do paciente");
  row("Fator 2 (conhecimento)", "CPF confirmado antes da exibição do documento");
  row("Termo de adesão", `${manifest.consentTermVersion}, aceito em ${formatBRDateTimeUTC(manifest.consentAcceptedAt)}`);
  y -= 8;

  section("ASSINATURA");
  row("Data e hora (UTC)", formatBRDateTimeUTC(manifest.signedAtServerIso));
  row(
    "Traçado",
    manifest.strokeData
      ? `${manifest.strokeData.metrics.pointsTotal} pontos, ${manifest.strokeData.metrics.numStrokes} traço(s), ${manifest.strokeData.metrics.durationTotalMs} ms`
      : "não capturado"
  );
  row("Dispositivo", manifest.userAgent ?? "não capturado");
  row("Endereço IP", manifest.ip ?? "não capturado");
  y -= 8;

  section("INTEGRIDADE");
  row("Hash do conteúdo (SHA-256)", manifest.contentHash);
  row("Hash das páginas de conteúdo (SHA-256)", documentHash);
  row("Cadeia de auditoria", `${manifest.auditEventCount} eventos, ${manifest.auditChainIntact ? "íntegra" : "DIVERGÊNCIA DETECTADA"}`);

  y -= 20;
  ensureSpace(40);
  const legalText =
    "Assinatura eletrônica simples, válida com base na MP 2.200-2/2001, art. 10 §2º, e na Lei 14.063/2020, art. 4º I. " +
    "Este documento não substitui o prontuário físico/eletrônico já existente na clínica — é anexo probatório da " +
    "ciência e concordância do paciente com o atendimento descrito.";
  for (const line of wrapText(legalText, italic, 8.5, contentWidth)) {
    ensureSpace(12);
    page.drawText(line, { x: MARGIN, y, size: 8.5, font: italic, color: rgb(0.45, 0.45, 0.45) });
    y -= 12;
  }
  y -= 10;
  ensureSpace(12);
  page.drawText(`Verifique em: ${validationUrl}`, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.16, 0.22, 0.19) });

  // Anexa a trilha de auditoria completa como arquivo embutido — o PDF
  // fica autossuficiente, sem depender do banco da clínica pra provar a
  // cadeia de eventos.
  try {
    await doc.attach(Buffer.from(auditTrailJson, "utf8"), `trilha-auditoria-${manifest.verificationCode}.json`, {
      mimeType: "application/json",
      description: "Trilha de auditoria completa (eventos encadeados por hash) desta assinatura.",
      creationDate: new Date(),
      modificationDate: new Date(),
    });
  } catch (err) {
    console.error("Falha ao anexar a trilha de auditoria ao PDF:", err);
  }

  return doc.save({ useObjectStreams: false });
}

function formatBRDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  const utc = d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const brt = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `${utc} (${brt} BRT)`;
}
