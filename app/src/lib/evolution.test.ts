import { describe, expect, it } from "vitest";
import { parseInboundMessage } from "./evolution";

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
