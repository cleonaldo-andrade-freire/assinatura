import type { CampaignAudience, CampaignRecipientStatus, CampaignStatus } from "@/lib/database.types";

/**
 * Regras puras das campanhas de promoção por WhatsApp (migration 076) — sem
 * banco nem rede, pra dar pra testar. O ritmo é a única proteção do número
 * da clínica (que já foi bloqueado uma vez pela operadora): não afrouxar
 * estes valores sem pedido explícito.
 */

/** Máximo de convites por clínica por dia (dia do Brasil). */
export const CAMPAIGN_DAILY_LIMIT = 30;
/** Intervalo aleatório entre dois envios da mesma clínica, em minutos. Irregular de propósito — 5:00 cravados parece robô. */
export const CAMPAIGN_MIN_GAP_MINUTES = 4;
export const CAMPAIGN_MAX_GAP_MINUTES = 7;
/** Horário comercial (Brasília): seg–sex, das 9h até antes das 18h. */
export const CAMPAIGN_START_HOUR = 9;
export const CAMPAIGN_END_HOUR = 18;
/** Erros de envio seguidos que pausam a campanha — primeiro sinal de restrição no número. */
export const CAMPAIGN_MAX_CONSECUTIVE_FAILURES = 3;
/** Por quantos dias uma resposta ainda conta como resposta ao convite. */
export const CAMPAIGN_REPLY_WINDOW_DAYS = 7;

export const CAMPAIGN_CONTENT_MAX_CHARS = 1000; // legenda de mídia no WhatsApp vai até ~1024
export const CAMPAIGN_MEDIA_MAX_BYTES = 16 * 1024 * 1024; // acima disso o WhatsApp não entrega vídeo como vídeo
export const CAMPAIGN_MEDIA_TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "video/mp4": "video",
};

export const DEFAULT_INVITE_TEXT =
  "Oi, {{nome}}! Aqui é da {{clinica}} 😊 Estamos com uma condição especial este mês. Posso te mandar os detalhes? Responda SIM ou NÃO.";

export const CAMPAIGN_DECLINE_CONFIRMATION = "Tudo bem! Não vamos mais te enviar promoções. Qualquer coisa, é só chamar por aqui. 😊";

export const CAMPAIGN_AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  pacientes: "Pacientes",
  leads: "Leads que não viraram pacientes",
  todos: "Pacientes e leads",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/** Classe de cor do statusBadge (shell.module.css) por status da campanha. */
export const CAMPAIGN_STATUS_CLASS: Record<CampaignStatus, string> = {
  rascunho: "statusMuted",
  enviando: "statusOk",
  pausada: "statusWarn",
  concluida: "statusInfo",
  cancelada: "statusNeutral",
};

/** skip_reason de quem a clínica tirou da campanha à mão (no rascunho ou da fila). */
export const CAMPAIGN_MANUAL_SKIP_REASON = "Retirado manualmente";
/** skip_reason de quem a clínica marcou como "Número errado". */
export const CAMPAIGN_WRONG_NUMBER_REASON = "Número errado";
/** skip_reason quando a Evolution diz que o número não tem WhatsApp (convite nem sai). */
export const CAMPAIGN_NO_WHATSAPP_REASON = "Número sem WhatsApp";
/** marketing_opt_outs.source de número errado (migration 077). */
export const OPT_OUT_SOURCE_WRONG_NUMBER = "numero_errado";

/** Contato que a clínica precisa olhar: resposta que o robô não entendeu, erro no envio ou sem WhatsApp. */
export function recipientNeedsAttention(r: { status: CampaignRecipientStatus; handled_at: string | null }): boolean {
  return !r.handled_at && (r.status === "replied" || r.status === "failed");
}

export const RECIPIENT_STATUS_LABEL: Record<CampaignRecipientStatus, string> = {
  pending: "Na fila",
  sending: "Enviando",
  sent: "Aguardando resposta",
  interested: "Quer saber (SIM)",
  declined: "Não quer (NÃO)",
  replied: "Respondeu outra coisa",
  failed: "Erro no envio",
  skipped: "Pulado",
};

const BR_TIMEZONE = "America/Sao_Paulo";

function brParts(d: Date): { date: string; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays.indexOf(get("weekday")),
    hour: Number(get("hour")) % 24,
  };
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) como "YYYY-MM-DD". */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Feriados nacionais (fixos + Carnaval, Sexta-feira Santa e Corpus Christi). Feriado municipal/estadual não entra. */
export function isBrazilianHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  if (fixed.includes(dateStr.slice(5))) return true;
  const easter = easterSunday(year);
  return [shiftDate(easter, -48), shiftDate(easter, -47), shiftDate(easter, -2), shiftDate(easter, 60)].includes(dateStr);
}

/** Dentro do horário de envio de campanha? seg–sex, 9h–18h (Brasília), fora de feriado nacional. */
export function isCampaignSendingWindow(now: Date = new Date()): boolean {
  const { date, weekday, hour } = brParts(now);
  if (weekday < 1 || weekday > 5) return false;
  if (hour < CAMPAIGN_START_HOUR || hour >= CAMPAIGN_END_HOUR) return false;
  return !isBrazilianHoliday(date);
}

/** Próximo instante liberado pra essa clínica enviar: agora + 4 a 7 min (aleatório, com segundos). */
export function nextCampaignSendAt(now: Date = new Date(), random: () => number = Math.random): Date {
  const spanMs = (CAMPAIGN_MAX_GAP_MINUTES - CAMPAIGN_MIN_GAP_MINUTES) * 60_000;
  return new Date(now.getTime() + CAMPAIGN_MIN_GAP_MINUTES * 60_000 + Math.floor(random() * spanMs));
}

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const YES_EXACT = new Set(["sim", "s", "ss", "si", "quero", "pode", "claro", "ok", "okay", "manda", "pode mandar", "pode sim", "quero sim", "sim quero", "sim pode", "tenho interesse", "tenho", "bora", "com certeza", "sim por favor", "quero saber", "pode ser", "aceito"]);
const YES_FIRST_WORD = new Set(["sim", "quero", "claro", "manda"]);
// Só frases fechadas: "não sei, quanto custa?" é dúvida, não recusa — vai
// pra equipe responder.
const NO_EXACT = new Set([
  "nao",
  "n",
  "nao quero",
  "nao obrigado",
  "nao obrigada",
  "nao tenho interesse",
  "sem interesse",
  "nao precisa",
  "sair",
  "parar",
  "pare",
  "remover",
  "descadastrar",
  "cancelar",
  "nao quero receber",
  "nao me mande mais",
  "nao mande mais",
]);

// Erros de digitação comuns de "sim" (o "u" fica do lado do "i" no teclado).
const YES_TYPOS: Record<string, string> = { sum: "sim", sin: "sim", sm: "sim", simn: "sim", aim: "sim" };
// Cumprimentos/vocativos que vêm antes do SIM ("Oii, sim!", "Boa noite Dra, pode sim").
const GREETING_WORDS = new Set(["oi", "ola", "bom", "boa", "dia", "tarde", "noite", "dra", "dr", "doutora", "doutor", "tudo", "bem", "obrigada", "obrigado", "ah", "ai", "eba", "opa", "e", "a"]);
// Palavras que, em qualquer posição de uma frase curta, querem dizer SIM.
const YES_ANYWHERE = new Set(["sim", "quero", "claro"]);
const YES_PHRASES = ["pode sim", "pode mandar", "pode enviar", "quero sim", "tenho interesse", "quero saber", "com certeza", "pode ser"];
// Sinais de dúvida/condição: aí a equipe responde, não o robô.
const DOUBT_WORDS = new Set(["nao", "mas", "quanto", "valor", "preco", "custa", "depois", "agora", "talvez", "quando", "onde", "qual", "como"]);

/** "oii" → "oi", "simmm" → "sim": letra repetida 3+ vezes (ou 2+ no fim da palavra) vira uma. */
function squeezeRepeats(word: string): string {
  return word.replace(/(.)\1{2,}/g, "$1").replace(/(.)\1+$/, "$1");
}

/** Classifica a resposta ao convite. `other` = a equipe responde (vira mensagem no quadro de leads). */
export function classifyCampaignReply(raw: string): "yes" | "no" | "other" {
  if (/^\s*(👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|✅)+\s*$/u.test(raw)) return "yes";
  const text = normalize(raw);
  if (!text) return "other";
  if (NO_EXACT.has(text)) return "no";
  if (YES_EXACT.has(text)) return "yes";
  const words = text.split(" ").map((w) => {
    const squeezed = w === "ss" ? w : squeezeRepeats(w);
    return YES_TYPOS[squeezed] ?? squeezed;
  });
  const cleaned = words.join(" ");
  if (YES_EXACT.has(cleaned)) return "yes";
  if (words.length <= 6 && YES_FIRST_WORD.has(words[0]) && !words.includes("nao")) return "yes";
  // Frase curta com SIM no meio de cumprimentos: "Oii, sim!", "Boa noite Dra pode sim".
  if (words.length <= 8 && !words.some((w) => DOUBT_WORDS.has(w))) {
    const hasYes = words.some((w) => YES_ANYWHERE.has(w)) || YES_PHRASES.some((p) => cleaned.includes(p));
    // O que sobra tem que ser cumprimento, nome ou palavra de SIM — senão é conversa.
    const leftovers = words.filter((w) => !YES_ANYWHERE.has(w) && !GREETING_WORDS.has(w) && !["pode", "mandar", "enviar", "manda", "por", "favor", "ok"].includes(w));
    if (hasYes && leftovers.length <= 2) return "yes";
  }
  return "other";
}

/** Primeiro nome com só a inicial maiúscula ("MARIA DA SILVA" → "Maria"). */
export function firstName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Preenche {{nome}} e {{clinica}}. Sem nome, some junto a vírgula/espaço da
 * frente ("Oi, {{nome}}!" → "Oi!") em vez de sair "Oi, !".
 */
export function renderCampaignText(template: string, vars: { name?: string | null; clinicName: string }): string {
  const name = firstName(vars.name);
  const withName = name ? template.replace(/\{\{\s*nome\s*\}\}/g, name) : template.replace(/[ ,]*\{\{\s*nome\s*\}\}/g, "");
  return withName.replace(/\{\{\s*clinica\s*\}\}/g, vars.clinicName).trim();
}

/** Telefone canônico pra dedup/fila: só dígitos, DDI 55, celular com o nono dígito. `null` se não parece telefone BR. */
export function canonicalCampaignPhone(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55") || d.length <= 11) d = `55${d}`;
  if (d.length === 12) {
    const rest = d.slice(4);
    // 8 dígitos começando em 6–9 = celular antigo sem o nono dígito.
    if (/^[6-9]/.test(rest)) d = `${d.slice(0, 4)}9${rest}`;
  }
  return d.length === 12 || d.length === 13 ? d : null;
}
