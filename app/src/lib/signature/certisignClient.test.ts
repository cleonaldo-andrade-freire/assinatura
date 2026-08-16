import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { certisignCreateDocument, certisignUploadDocument } from "./certisignClient";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("certisignClient", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.CERTISIGN_API_BASE_URL = "https://api-sbx.portaldeassinaturas.com.br/api/v2";
    process.env.CERTISIGN_API_TOKEN = "token-de-teste";
    delete process.env.CERTISIGN_API_CODE;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("manda os bytes do upload como string base64, não array de números", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ uploadId: "abc.pdf" }));

    await certisignUploadDocument("teste.pdf", new Uint8Array([37, 80, 68, 70])); // "%PDF"

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ fileName: "teste.pdf", bytes: "JVBERg==" });
  });

  it("manda o header Token e não exige code quando ausente", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ uploadId: "abc.pdf" }));

    await certisignUploadDocument("teste.pdf", new Uint8Array([1]));

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.token).toBe("token-de-teste");
    expect(headers.code).toBeUndefined();
  });

  it("cria documento com signatureStandard (não signatureFormatId) quando configurado", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 123, chave: "chave-abc", signUrl: "https://sign.example/x", inProcessing: false })
    );

    const result = await certisignCreateDocument({
      document: { name: "atestado.pdf", upload: { id: "upload-1", name: "atestado.pdf" } },
      typeId: 1,
      signatureStandard: 2,
      callback: true,
      signers: [{ step: 1, name: "Dra. Teste", email: "dra@example.com", individualIdentificationCode: "11144477735" }],
      tags: ["doc-1"],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.signatureStandard).toBe(2);
    expect(body).not.toHaveProperty("signatureFormatId");

    // id numérico e chave (não id) são os campos que o resto do provider usa
    // como providerDocumentId/documentKey — ver certisignProvider.ts.
    expect(result.id).toBe(123);
    expect(result.chave).toBe("chave-abc");
  });
});
