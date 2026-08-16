/**
 * Cliente HTTP fino pra API v2 do Portal de Assinaturas (Certisign). Cobre só
 * os 4 endpoints que o fluxo de atestado/prescrição usa: upload, create,
 * flowActions (status) e package (download). Documentação: portal do
 * desenvolvedor Certisign, host de sandbox `api-sbx.portaldeassinaturas.com.br`.
 *
 * Autenticação confirmada via doc oficial (POST /Api/V2/Document/Create):
 * só o header `Token` é exigido — `code` é enviado por precaução (só quando
 * `CERTISIGN_API_CODE` está setada) mas não aparece no schema oficial dessa
 * rota. `flowActions`/`package` não aparecem no catálogo público do portal
 * (só upload/create/createBatch estão documentados lá) — não confirmados
 * ainda contra a API real, testar com curl antes de confiar no fallback de
 * reconciliação (cron/botão manual).
 */

export interface CertisignSignerInfo {
  step: number;
  title?: string;
  name: string;
  email: string;
  individualIdentificationCode: string; // CPF, só dígitos
}

export interface CertisignCreateDocumentRequest {
  document: { name: string; upload: { id: string; name: string } };
  sender?: { name: string; email: string; individualIdentificationCode: string };
  typeId: number;
  signatureStandard?: number; // enum PadraoAssinatura (PAdES/CAdES) — o campo "signatureFormatId" não existe na API real
  callback?: boolean;
  signers?: CertisignSignerInfo[];
  tags?: string[];
}

export interface CertisignCreateDocumentResponse {
  id: number;
  chave: string; // key usada em document/package — não é o mesmo valor de `id`
  signUrl?: string | null;
  inProcessing: boolean;
}

export interface CertisignFlowAction {
  actionTaken: boolean;
  date?: string;
  user?: { name?: string; email?: string };
}

export interface CertisignFlowActionsResponse {
  steps: { order: number; status: number; attendees: CertisignFlowAction[] }[];
}

export interface CertisignPackageResponse {
  bytes: number[];
  name: string;
  mimeType: string;
}

function baseUrl(): string {
  const url = process.env.CERTISIGN_API_BASE_URL;
  if (!url) throw new Error("CERTISIGN_API_BASE_URL não configurada.");
  return url.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const token = process.env.CERTISIGN_API_TOKEN;
  const code = process.env.CERTISIGN_API_CODE;
  if (!token && !code) throw new Error("CERTISIGN_API_TOKEN/CERTISIGN_API_CODE não configurados.");
  const headers: Record<string, string> = {};
  if (token) headers.token = token;
  if (code) headers.code = code;
  return headers;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Certisign ${path} falhou (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function certisignUploadDocument(fileName: string, bytes: Uint8Array): Promise<string> {
  const result = await request<{ uploadId: string }>("/document/upload", {
    method: "POST",
    body: JSON.stringify({ fileName, bytes: Buffer.from(bytes).toString("base64") }),
  });
  return result.uploadId;
}

export async function certisignCreateDocument(
  payload: CertisignCreateDocumentRequest
): Promise<CertisignCreateDocumentResponse> {
  return request<CertisignCreateDocumentResponse>("/document/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function certisignGetFlowActions(documentId: string): Promise<CertisignFlowActionsResponse> {
  return request<CertisignFlowActionsResponse>(`/document/flowActions?id=${encodeURIComponent(documentId)}`, {
    method: "GET",
  });
}

/**
 * Com `signatureStandard` de PAdES, a API já devolve o PDF assinado direto
 * (sem zip) — CAdES é que devolveria um zip com manifesto + .p7s. Ver
 * `certisignProvider.ts` pra qual valor usar (`CERTISIGN_SIGNATURE_STANDARD`).
 */
export async function certisignDownloadPackage(documentKey: string): Promise<CertisignPackageResponse> {
  return request<CertisignPackageResponse>(
    `/document/package?key=${encodeURIComponent(documentKey)}&includeOriginal=false`,
    { method: "GET" }
  );
}

/**
 * O callback de FLOW já manda a URL pronta em `apiDownload` (com a `key`
 * correta — que não é o mesmo valor do `id` do documento). Preferir sempre
 * esta função no caminho do webhook em vez de tentar remontar a URL a partir
 * do `id`.
 */
export async function certisignDownloadFromUrl(apiDownloadUrl: string): Promise<CertisignPackageResponse> {
  const res = await fetch(apiDownloadUrl, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Certisign apiDownload falhou (${res.status}): ${body}`);
  }
  return res.json() as Promise<CertisignPackageResponse>;
}
