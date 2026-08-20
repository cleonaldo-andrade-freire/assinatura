import crypto from "crypto";
import sanitizeHtml from "sanitize-html";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clinic } from "@/lib/database.types";

const QL_ALIGN_CLASS = /^ql-align-(center|right|justify)$/;
const QL_SIZE_CLASS = /^ql-size-(small|large|huge)$/;
const CSS_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d.,\s%]+\)$/i];

/** O texto do termo vem do editor rico em Configurações (RichTextEditor,
 * baseado em Quill/react-quill-new) e é exibido pro paciente na página
 * pública de assinatura — sanitiza no momento de salvar (única rota que
 * escreve nesta coluna), não na leitura, pra `clinics.consent_term_text` já
 * nascer confiável em qualquer lugar que o ler depois. Allowlist reflete
 * exatamente como `editor.getSemanticHTML()` (usado por padrão pelo
 * react-quill-new) serializa cada formato — checado direto na fonte do
 * pacote `quill`, não por suposição: listas viram `<ul>`/`<ol>` limpos (sem
 * o `data-list`/`.ql-ui` que só existem no DOM de edição, nunca no HTML
 * semântico exportado), `size`/`align` viram classe (`ql-size-*`/
 * `ql-align-*`), `color`/`background` viram `style` inline. Nada de script/
 * estilo arbitrário/atributo de evento passa. */
export function sanitizeConsentTermHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "span", "p", "br", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "a"],
    allowedAttributes: {
      span: ["style", "class"],
      p: ["class"],
      h1: ["class"],
      h2: ["class"],
      h3: ["class"],
      li: ["class"],
      a: ["href", "rel", "target"],
    },
    allowedClasses: {
      span: [QL_SIZE_CLASS],
      p: [QL_ALIGN_CLASS],
      h1: [QL_ALIGN_CLASS],
      h2: [QL_ALIGN_CLASS],
      h3: [QL_ALIGN_CLASS],
      li: [QL_ALIGN_CLASS],
    },
    allowedStyles: {
      span: { color: CSS_COLOR, "background-color": CSS_COLOR },
    },
    disallowedTagsMode: "discard",
  });
}

/** SHA-256 do texto do termo, pra registrar exatamente o que a pessoa leu
 * mesmo que a clínica edite o texto depois (ver migration 052, comentário
 * da tabela `electronic_consent_terms`). */
export function hashConsentText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Bloqueia o fluxo de assinatura de evolução até a clínica configurar o
 * próprio texto do Termo de Adesão em Configurações — nunca existe um
 * texto padrão pronto pra uso sem revisão jurídica. */
export function clinicHasConfiguredConsentTerm(clinic: Pick<Clinic, "consent_term_text" | "consent_term_version">): boolean {
  return !!clinic.consent_term_text?.trim() && !!clinic.consent_term_version?.trim();
}

/** Paciente já tem um termo ativo (não revogado)? Não força reaceite quando
 * a clínica só corrige um typo no texto — ver nota na migration/documento
 * de análise sobre essa ser uma decisão de produto, não uma obrigação legal
 * automática. */
export async function patientHasActiveConsent(supabase: SupabaseClient, patientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("electronic_consent_terms")
    .select("id")
    .eq("patient_id", patientId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

/** Registra o aceite do termo — snapshot da versão/hash vigente na
 * clínica no momento do aceite. */
export async function recordConsentAcceptance(
  supabase: SupabaseClient,
  params: {
    clinicId: string;
    patientId: string;
    termVersion: string;
    termTextHash: string;
    phoneE164: string;
    ip: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("electronic_consent_terms").insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    term_version: params.termVersion,
    term_text_hash: params.termTextHash,
    accepted_at: new Date().toISOString(),
    accept_channel: "whatsapp",
    phone_e164: params.phoneE164,
    ip: params.ip,
    user_agent: params.userAgent,
  });
  if (error) throw new Error(`Falha ao registrar aceite do termo: ${error.message}`);
}
