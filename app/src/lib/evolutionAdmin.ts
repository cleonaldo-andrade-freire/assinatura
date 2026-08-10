/**
 * Chamadas "de administrador" à Evolution API — criar instância, ler QR Code,
 * checar status de conexão, configurar webhook. Usa uma chave global (a mesma
 * pra todas as clínicas), diferente da chave por-instância usada em lib/evolution.ts
 * pra mandar mensagem. Só faz sentido existir se EVOLUTION_ADMIN_BASE_URL e
 * EVOLUTION_ADMIN_API_KEY estiverem configurados no ambiente do app.
 */

function baseUrl(): string | null {
  return process.env.EVOLUTION_ADMIN_BASE_URL?.replace(/\/$/, "") ?? null;
}

function adminKey(): string | null {
  return process.env.EVOLUTION_ADMIN_API_KEY ?? null;
}

export function evolutionAdminConfigured(): boolean {
  return !!(baseUrl() && adminKey());
}

interface CreateInstanceResult {
  qrcodeBase64: string | null;
}

/**
 * Cria a instância (ou, se já existir, a Evolution costuma devolver erro — nesse
 * caso chamamos o connect pra pegar um QR Code novo). Devolve o QR Code em base64
 * (data URI), pronto pra colocar num <img src>.
 */
export async function createInstanceWithQr(instanceName: string): Promise<CreateInstanceResult | null> {
  const base = baseUrl();
  const key = adminKey();
  if (!base || !key) return null;

  const headers = { "Content-Type": "application/json", apikey: key };

  const createRes = await fetch(`${base}/instance/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });

  if (createRes.ok) {
    const data = await createRes.json();
    const qr = data?.qrcode?.base64 ?? data?.base64 ?? null;
    if (qr) return { qrcodeBase64: qr };
  }

  // Instância já existia (ou createRes não trouxe QR) — tenta pegar um QR Code fresco.
  const connectRes = await fetch(`${base}/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: "GET",
    headers,
  });
  if (!connectRes.ok) {
    console.error("Evolution API: falha ao criar/conectar instância", await connectRes.text().catch(() => ""));
    return null;
  }
  const data = await connectRes.json();
  const qr = data?.base64 ?? data?.qrcode?.base64 ?? null;
  return { qrcodeBase64: qr };
}

export type ConnectionState = "open" | "close" | "connecting" | "unknown";

export async function getConnectionState(instanceName: string): Promise<ConnectionState> {
  const base = baseUrl();
  const key = adminKey();
  if (!base || !key) return "unknown";

  try {
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: key },
    });
    if (!res.ok) return "unknown";
    const data = await res.json();
    const state = data?.instance?.state ?? data?.state;
    return state === "open" || state === "close" || state === "connecting" ? state : "unknown";
  } catch (err) {
    console.error("Falha ao checar estado da conexão Evolution:", err);
    return "unknown";
  }
}

/**
 * Desconecta a sessão do WhatsApp da instância (equivalente a "sair" no
 * Aparelhos Conectados), sem apagar a instância em si — fica pronta pra
 * escanear um QR Code novo, de outro número, em seguida.
 */
export async function logoutInstance(instanceName: string): Promise<boolean> {
  const base = baseUrl();
  const key = adminKey();
  if (!base || !key) return false;

  try {
    const res = await fetch(`${base}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: key },
    });
    return res.ok;
  } catch (err) {
    console.error("Falha ao desconectar instância Evolution:", err);
    return false;
  }
}

/** Configura o webhook genérico da instância pra apontar pro nosso endpoint. */
export async function setInstanceWebhook(instanceName: string, webhookUrl: string): Promise<boolean> {
  const base = baseUrl();
  const key = adminKey();
  if (!base || !key) return false;

  try {
    const res = await fetch(`${base}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          events: ["MESSAGES_UPSERT"],
        },
      }),
    });
    if (!res.ok) {
      console.error("Falha ao configurar webhook da instância:", await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    console.error("Falha ao configurar webhook da instância:", err);
    return false;
  }
}
