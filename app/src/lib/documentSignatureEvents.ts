import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cadeia de auditoria da assinatura eletrônica (anamnese e evolução
 * clínica) — append-only no banco (ver migration 052, trigger que bloqueia
 * UPDATE/DELETE em `document_signature_events`). Cada evento referencia o
 * hash do evento anterior, então alterar qualquer evento no meio da cadeia
 * quebra a verificação de todos os eventos depois dele.
 *
 * `document_type`/`document_id` são genéricos de propósito (em vez de uma
 * tabela de eventos por tipo de documento) — um terceiro tipo de documento
 * assinável no futuro não precisa de migration nova, só passa a chamar
 * `appendSignatureEvent` com o `document_type` dele.
 */
export type DocumentSignatureType = "anamnesis" | "treatment_evolution";

/** JSON canônico (chaves ordenadas recursivamente) — o hash precisa ser
 * estável independente da ordem em que as chaves foram inseridas no objeto. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/** SHA-256 do conteúdo congelado de um documento (snapshot) — usado tanto
 * pra evolução clínica quanto, no futuro, qualquer outro documento que
 * precise de hash de integridade sobre um JSON. */
export function computeContentHash(snapshot: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

/**
 * Adiciona um evento à cadeia de um documento. Lê o último evento (maior
 * `sequence`) pra encadear o hash — em concorrência real (dois eventos do
 * mesmo documento ao mesmo tempo), a constraint UNIQUE(document_type,
 * document_id, sequence) rejeita o segundo insert em vez de corromper a
 * cadeia; não implementamos retry automático porque o volume de eventos
 * por documento é baixo e sequencial por natureza (um paciente assinando
 * um documento de cada vez), não um cenário de alta concorrência.
 */
export async function appendSignatureEvent(
  supabase: SupabaseClient,
  params: {
    clinicId: string;
    documentType: DocumentSignatureType;
    documentId: string;
    eventType: string;
    actor: "system" | "dentist" | "patient";
    actorId?: string | null;
    payload?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  const { data: last } = await supabase
    .from("document_signature_events")
    .select("sequence, event_hash")
    .eq("document_type", params.documentType)
    .eq("document_id", params.documentId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sequence = (last?.sequence ?? 0) + 1;
  const previousHash: string | null = last?.event_hash ?? null;
  const occurredAt = new Date().toISOString();
  const payload = params.payload ?? {};

  const eventHash = crypto
    .createHash("sha256")
    .update([params.documentId, String(sequence), params.eventType, occurredAt, canonicalJson(payload), previousHash ?? "GENESIS"].join("|"))
    .digest("hex");

  const { error } = await supabase.from("document_signature_events").insert({
    clinic_id: params.clinicId,
    document_type: params.documentType,
    document_id: params.documentId,
    sequence,
    event_type: params.eventType,
    occurred_at: occurredAt,
    actor: params.actor,
    actor_id: params.actorId ?? null,
    payload,
    ip: params.ip ?? null,
    user_agent: params.userAgent ?? null,
    previous_hash: previousHash,
    event_hash: eventHash,
  });
  if (error) {
    // A trilha é importante, mas nunca deve travar o fluxo principal (o
    // documento em si já foi salvo antes de chamar isto) — loga e segue.
    console.error("Falha ao registrar evento de auditoria da assinatura:", error.message);
  }
}

export interface ChainVerificationResult {
  ok: boolean;
  totalEvents: number;
  brokenAtSequence: number | null;
}

/** Recalcula a cadeia inteira de um documento e confere se cada
 * `event_hash` bate com o que seria gerado a partir do payload/sequence/
 * previous_hash gravados — é o equivalente ao `verificar-cadeia` do prompt
 * original, chamável de um script ou de uma rota administrativa. */
export async function verifySignatureChain(
  supabase: SupabaseClient,
  documentType: DocumentSignatureType,
  documentId: string
): Promise<ChainVerificationResult> {
  const { data: events } = await supabase
    .from("document_signature_events")
    .select("*")
    .eq("document_type", documentType)
    .eq("document_id", documentId)
    .order("sequence", { ascending: true });

  if (!events || events.length === 0) return { ok: true, totalEvents: 0, brokenAtSequence: null };

  let expectedPrevious: string | null = null;
  for (const e of events) {
    const recomputed = crypto
      .createHash("sha256")
      .update([documentId, String(e.sequence), e.event_type, new Date(e.occurred_at).toISOString(), canonicalJson(e.payload), expectedPrevious ?? "GENESIS"].join("|"))
      .digest("hex");
    if (recomputed !== e.event_hash || e.previous_hash !== expectedPrevious) {
      return { ok: false, totalEvents: events.length, brokenAtSequence: e.sequence };
    }
    expectedPrevious = e.event_hash;
  }
  return { ok: true, totalEvents: events.length, brokenAtSequence: null };
}
