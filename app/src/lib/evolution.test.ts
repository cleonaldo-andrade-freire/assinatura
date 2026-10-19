import { afterEach, describe, expect, it, vi } from "vitest";
import { parseInboundMessage, sendText } from "./evolution";

const wrap = (message: Record<string, unknown>, fromMe = false) => ({
  data: { key: { remoteJid: "5579999998888@s.whatsapp.net", fromMe }, message },
});

describe("parseInboundMessage", () => {
  it("lê texto simples (conversation)", () => {
    const r = parseInboundMessage(wrap({ conversation: "Olá, tenho uma dúvida" }));
    expect(r).toMatchObject({ phone: "5579999998888", fromMe: false, text: "Olá, tenho uma dúvida", mediaLabel: null });
  });

  it("lê a legenda de uma imagem como texto", () => {
    const r = parseInboundMessage(wrap({ imageMessage: { caption: "esse é o dente" } }));
    expect(r?.text).toBe("esse é o dente");
    expect(r?.mediaLabel).toBeNull();
  });

  it("áudio sem texto vira mediaLabel '[áudio]'", () => {
    const r = parseInboundMessage(wrap({ audioMessage: { seconds: 8 } }));
    expect(r?.text).toBeNull();
    expect(r?.mediaLabel).toBe("[áudio]");
  });

  it("figurinha vira mediaLabel '[figurinha]'", () => {
    const r = parseInboundMessage(wrap({ stickerMessage: {} }));
    expect(r?.mediaLabel).toBe("[figurinha]");
  });

  it("imagem sem legenda vira mediaLabel '[imagem]'", () => {
    const r = parseInboundMessage(wrap({ imageMessage: {} }));
    expect(r?.text).toBeNull();
    expect(r?.mediaLabel).toBe("[imagem]");
  });

  it("tipo não reconhecido (reação, protocolo) fica sem texto e sem mediaLabel", () => {
    const r = parseInboundMessage(wrap({ reactionMessage: { text: "👍" } }));
    expect(r?.text).toBeNull();
    expect(r?.mediaLabel).toBeNull();
  });

  it("payload sem remoteJid não parseia", () => {
    expect(parseInboundMessage({ data: { message: { conversation: "x" } } })).toBeNull();
  });
});

describe("sendText", () => {
  const clinic = { evolution_base_url: "https://evo.test", evolution_instance_name: "er", evolution_api_key: "k" };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function sentBody(text: string) {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.exemplo.com.br");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendText(clinic, "(79) 99999-8888", text);
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  }

  it("pede prévia do link quando a mensagem tem link do app", async () => {
    const body = await sentBody("Seu atestado: https://app.exemplo.com.br/atestado/abc");
    expect(body).toMatchObject({ number: "79999998888", linkPreview: true });
  });

  it("não pede prévia para mensagem só com link externo", async () => {
    const body = await sentBody("Como chegar: https://maps.app.goo.gl/x");
    expect(body).not.toHaveProperty("linkPreview");
  });
});
