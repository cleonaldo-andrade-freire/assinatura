import type { Clinic } from "@/lib/database.types";

type EvolutionCreds = Pick<Clinic, "evolution_base_url" | "evolution_instance_name" | "evolution_api_key">;

function evolutionConfigured(clinic: EvolutionCreds): boolean {
  return !!(clinic.evolution_base_url && clinic.evolution_instance_name && clinic.evolution_api_key);
}

/**
 * Manda uma mensagem de texto simples via Evolution API. Best-effort: erros são
 * logados, não lançados — uma falha de rede aqui nunca deve derrubar o fluxo que
 * chamou (assinatura, motor de conversa, etc.).
 *
 * ⚠️ O payload exato do sendText varia entre versões da Evolution API na prática
 * (a documentação oficial mostra formatos diferentes dependendo da página). Usamos
 * aqui o formato `{ number, text }`, que é o mais comumente relatado — se a sua
 * instância usar outro formato, ajuste este arquivo depois de testar contra ela.
 */
export async function sendText(clinic: EvolutionCreds, phone: string, text: string): Promise<boolean> {
  if (!evolutionConfigured(clinic)) return false;

  const url = `${clinic.evolution_base_url!.replace(/\/$/, "")}/message/sendText/${clinic.evolution_instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: clinic.evolution_api_key!,
      },
      body: JSON.stringify({
        number: phone.replace(/\D/g, ""),
        text,
      }),
    });
    if (!res.ok) {
      console.error("Evolution API sendText respondeu", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Falha ao chamar Evolution API (sendText):", err);
    return false;
  }
}

/**
 * Avisa a clínica no WhatsApp que uma anamnese foi assinada, chamando a Evolution API
 * dela diretamente (sem passar por n8n). Best-effort.
 */
export async function notifyClinicSigned(
  clinic: EvolutionCreds & Pick<Clinic, "notify_phone">,
  patientName: string
): Promise<void> {
  if (!clinic.notify_phone) return;
  await sendText(clinic, clinic.notify_phone, `✅ Anamnese assinada com sucesso por ${patientName}.`);
}

/** Avisa a clínica que uma evolução clínica foi assinada — best-effort,
 * mesmo padrão de `notifyClinicSigned`. */
export async function notifyClinicEvolutionSigned(
  clinic: EvolutionCreds & Pick<Clinic, "notify_phone">,
  patientName: string
): Promise<void> {
  if (!clinic.notify_phone) return;
  await sendText(clinic, clinic.notify_phone, `✅ Evolução clínica assinada por ${patientName}.`);
}

/** Avisa a clínica IMEDIATAMENTE quando o paciente recusa a assinatura —
 * o prompt original exige notificação em menos de 1 minuto, não em batch. */
export async function notifyClinicEvolutionRefused(
  clinic: EvolutionCreds & Pick<Clinic, "notify_phone">,
  patientName: string,
  reason: string | null
): Promise<void> {
  if (!clinic.notify_phone) return;
  const suffix = reason ? ` Motivo informado: "${reason}"` : "";
  await sendText(clinic, clinic.notify_phone, `⚠️ ${patientName} não reconheceu/recusou assinar a evolução clínica.${suffix}`);
}

export interface InboundMessage {
  remoteJid: string;
  phone: string; // remoteJid sem o sufixo @s.whatsapp.net
  fromMe: boolean;
  text: string | null;
}

/**
 * Extrai os dados relevantes do payload de webhook da Evolution API pro evento
 * MESSAGES_UPSERT. A estrutura muda um pouco entre variações de mensagem (texto
 * simples vs. resposta citando outra mensagem), por isso checamos alguns formatos.
 *
 * ⚠️ Não testado contra uma instância real ainda — se o parsing não achar o texto
 * de mensagens reais, logue `JSON.stringify(payload)` uma vez pra ver a forma
 * exata que sua versão da Evolution API manda, e ajuste os campos abaixo.
 */
export function parseInboundMessage(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const key = data.key as Record<string, unknown> | undefined;
  const remoteJid = key?.remoteJid as string | undefined;
  if (!remoteJid) return null;

  const message = data.message as Record<string, unknown> | undefined;
  const text =
    (message?.conversation as string | undefined) ??
    ((message?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
    ((message?.buttonsResponseMessage as Record<string, unknown> | undefined)?.selectedDisplayText as
      | string
      | undefined) ??
    null;

  return {
    remoteJid,
    phone: remoteJid.replace(/@.*$/, ""),
    fromMe: Boolean(key?.fromMe),
    text,
  };
}
